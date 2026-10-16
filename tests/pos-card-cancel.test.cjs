/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {backend}=require('./card-backend-harness.cjs');
const {load,findAll,harness}=require('./ui-harness.cjs');

const context={role:'cashier',userId:'local-user',username:'local-cashier',eventId:'local-event'};
const piKey='afrofood-terminal:LOCAL-CANCEL-A:v1';
function setup(state='requires_payment_method',withPi=true){
  const db=backend();
  const row={id:'LOCAL-CANCEL-A',payment:'card',status:'PENDING_PAYMENT',pos_card_state:'ready',pos_card_key:'local-claim',
    pos_card_user_id:context.userId,pos_card_username:context.username,event_id:context.eventId,event_name:'Local event',
    amount_cents:5000,currency:'eur',items:[{id:'meal',name:'Meal',qty:5,price:10}],quantity_applied:false,paid_at:null,
    stripe_payment_intent_id:withPi?'pi_local_cancel':null,stripe_pi_started_at:withPi?new Date().toISOString():null};
  db.orders.set(row.id,row);
  const pi={id:'pi_local_cancel',status:state,amount:5000,amount_received:state==='succeeded'?5000:0,currency:'eur',client_secret:'mock-only',metadata:{order_id:row.id}};
  if(withPi)db.intents.set(piKey,pi);
  db.settings.set('item_availability:local-event',{meal:{status:'limited',remainingQty:12,resumeAt:null}});
  const cancel=(patch={})=>db.request(`/api/orders/${row.id}/cancel-card-payment`,{method:'POST',headers:{'x-staff-role':patch.role??context.role},body:JSON.stringify({...context,...patch})});
  const prepare=()=>db.request('/api/stripe/terminal/payment-intent',{method:'POST',body:JSON.stringify({orderId:row.id})});
  const publish=()=>db.terminal.setTerminalActiveOrder({username:context.username,userId:context.userId,eventName:row.event_name,orderId:row.id,paymentIntentId:row.stripe_payment_intent_id});
  const qty=()=>db.settings.get('item_availability:local-event').meal.remainingQty;
  return {db,row,pi,cancel,prepare,publish,qty};
}
async function deliver(db,pi){
  const previous=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='local-signature-only';
  try{
    const payload=JSON.stringify({id:'evt_local_cancel',type:'payment_intent.succeeded',data:{object:{...pi,status:'succeeded',amount_received:pi.amount}}});
    const timestamp=String(Math.floor(Date.now()/1000));
    const sig=crypto.createHmac('sha256','local-signature-only').update(timestamp+'.'+payload).digest('hex');
    return await db.webhook.POST(new Request('http://localhost/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${sig}`},body:payload}));
  }finally{if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;}
}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

for(const status of ['requires_payment_method','requires_confirmation','requires_action','processing','requires_capture','canceled']){
  test(`Stripe ${status}: finalize only with canceled proof, no quantity effect`,async()=>{
    const h=setup(status);await h.publish();
    const result=await(await h.cancel()).json();assert.equal(result.outcome,'canceled');
    assert.equal(h.row.status,'CANCELED');assert.equal(h.row.pos_card_state,'canceled');
    assert.equal(h.row.quantity_applied,false);assert.equal(h.qty(),12);assert.equal(h.db.consumed,0);
    assert.equal(h.db.stripeCancelCalls,status==='canceled'?0:1);assert.equal(h.db.mailboxes.size,0);
  });
}

test('double cancellation finalizes once; repeat after completion makes no Stripe call',async()=>{
  const h=setup();const results=await Promise.all([h.cancel(),h.cancel()]);
  const bodies=await Promise.all(results.map(r=>r.json()));assert.ok(bodies.every(b=>['canceled','already_canceled'].includes(b.outcome)));
  assert.equal(h.db.cancelFinalizations,1);assert.equal(h.db.events.filter(e=>e.status==='CANCELED').length,1);
  const before=h.db.stripeGetCalls;assert.equal((await(await h.cancel()).json()).outcome,'already_canceled');assert.equal(h.db.stripeGetCalls,before);assert.equal(h.qty(),12);
});

test('lost Stripe cancellation response leaves request durable; retry rereads canceled',async()=>{
  const h=setup();h.db.loseCancelResponse=true;
  assert.equal((await(await h.cancel()).json()).outcome,'cancellation_pending');
  assert.equal(h.pi.status,'canceled');assert.equal(h.row.status,'PENDING_PAYMENT');assert.equal(h.row.pos_card_state,'cancel_requested');
  assert.equal((await(await h.cancel()).json()).outcome,'canceled');assert.equal(h.db.stripeCancelCalls,1);assert.equal(h.qty(),12);
});

test('lost HTTP acknowledgement after completed cancellation returns already_canceled on retry',async()=>{
  const h=setup();await h.cancel();const response=await(await h.cancel()).json();assert.equal(response.outcome,'already_canceled');assert.equal(h.db.cancelFinalizations,1);
});

for(const stage of ['get','cancel']){
  test(`Stripe ${stage} network error: durable pending, no local cancellation or quantity effect`,async()=>{
    const h=setup();h.db.hooks[stage==='get'?'beforeStripeGet':'beforeStripeCancel']=async()=>{throw Error('simulated timeout');};
    const response=await h.cancel();assert.equal(response.status,202);assert.equal((await response.json()).outcome,'cancellation_pending');
    assert.equal(h.row.pos_card_state,'cancel_requested');assert.equal(h.row.status,'PENDING_PAYMENT');assert.equal(h.qty(),12);assert.equal(h.row.quantity_applied,false);
    assert.equal((await h.prepare()).status,409);await assert.rejects(h.publish());
  });
}
for(const status of ['processing','requires_action','requires_capture']){
  test(`Stripe refuses cancellation in ${status}: never infer canceled`,async()=>{
    const h=setup(status);h.db.hooks.beforeStripeCancel=async()=>{throw Error('not cancelable');};
    assert.equal((await(await h.cancel()).json()).outcome,'cancellation_pending');assert.equal(h.row.status,'PENDING_PAYMENT');assert.equal(h.row.pos_card_state,'cancel_requested');assert.equal(h.qty(),12);
  });
}

test('unexpected Stripe state requires review and cannot restart payment',async()=>{
  const h=setup('future_state');assert.equal((await(await h.cancel()).json()).outcome,'requires_review');
  assert.equal(h.db.stripeCancelCalls,0);assert.equal(h.row.pos_card_state,'cancel_requested');assert.equal((await h.prepare()).status,409);
});
for(const [name,patch] of [['id',{id:'pi_wrong'}],['amount',{amount:1}],['currency',{currency:'usd'}],['metadata',{metadata:{order_id:'other'}}]]){
  test(`mismatched PI ${name}: requires review, no cancellation effect`,async()=>{
    const h=setup();h.db.hooks.beforeStripeGet=async()=>Object.assign(h.pi,patch);
    // The mock finds the original ID before applying the response mutation.
    assert.equal((await(await h.cancel()).json()).outcome,'requires_review');assert.equal(h.db.stripeCancelCalls,0);assert.equal(h.row.pos_card_state,'cancel_requested');assert.equal(h.qty(),12);
  });
}

test('PI succeeded reconciles payment via finalizeSale; duplicate webhook never decrements twice',async()=>{
  const h=setup('succeeded');const result=await(await h.cancel()).json();
  assert.equal(result.outcome,'already_paid');assert.equal(h.row.status,'NEW');assert.equal(h.row.pos_card_state,'ready');assert.equal(h.row.quantity_applied,true);assert.equal(h.qty(),7);
  assert.equal(h.db.stripeCancelCalls,0);assert.equal((await deliver(h.db,h.pi)).status,200);assert.equal(h.qty(),7);assert.equal(h.db.consumed,1);
});

test('webhook wins while Stripe cancellation is requested',async()=>{
  const h=setup();h.db.hooks.beforeStripeCancel=async()=>{
    h.pi.status='succeeded';h.pi.amount_received=5000;
    assert.equal(h.row.pos_card_state,'cancel_requested');assert.equal((await deliver(h.db,h.pi)).status,200);
  };
  assert.equal((await(await h.cancel()).json()).outcome,'already_paid');assert.equal(h.row.status,'NEW');assert.equal(h.qty(),7);
  await deliver(h.db,h.pi);assert.equal(h.db.consumed,1);assert.equal(h.db.events.filter(e=>e.type==='PAYMENT_VALIDATED').length,1);
});

test('cancellation wins; contradictory late success is recorded without kitchen/quantity changes',async()=>{
  const h=setup();assert.equal((await(await h.cancel()).json()).outcome,'canceled');
  const webhook=await(await deliver(h.db,h.pi)).json();assert.equal(webhook.outcome,'requires_review');
  assert.equal(h.row.payment_error,'POS_CARD_SUCCESS_AFTER_CANCEL');assert.equal(h.row.status,'CANCELED');assert.equal(h.row.quantity_applied,false);assert.equal(h.qty(),12);
  assert.equal(h.db.events.filter(e=>e.type==='PAYMENT_VALIDATED').length,0);
  assert.equal((await(await h.cancel()).json()).outcome,'requires_review');
});

test('no PI and no creation started: safe local cancellation prevents future PI start',async()=>{
  const h=setup(undefined,false);assert.equal((await(await h.cancel()).json()).outcome,'canceled');assert.equal(h.db.stripeGetCalls,0);assert.equal(h.db.stripeCreates,0);
  assert.equal((await h.prepare()).status,400);assert.equal(h.db.stripeCreates,0);assert.equal(h.row.quantity_applied,false);
});

test('no PI but creation started: requires review, never create a PI to cancel',async()=>{
  const h=setup(undefined,false);h.row.stripe_pi_started_at=new Date().toISOString();
  assert.equal((await(await h.cancel()).json()).outcome,'requires_review');assert.equal(h.row.pos_card_state,'cancel_requested');assert.equal(h.db.stripeCreates,0);assert.equal(h.db.stripeGetCalls,0);
});

test('cancellation between initial preparation read and PI-start claim blocks Stripe creation',async()=>{
  const h=setup(undefined,false);h.db.hooks.beforePiStart=async()=>{
    h.db.hooks.beforePiStart=null;assert.equal((await(await h.cancel()).json()).outcome,'canceled');
  };
  assert.equal((await h.prepare()).status,409);assert.equal(h.db.stripeCreates,0);
});

test('PI creation already in flight is linked after cancellation request, never released for payment',async()=>{
  const h=setup(undefined,false),entered=deferred(),release=deferred();
  h.db.hooks.beforeStripeCreate=async()=>{entered.resolve();await release.promise;};
  const preparing=h.prepare();await entered.promise;
  assert.equal((await(await h.cancel()).json()).outcome,'requires_review');assert.equal(h.row.pos_card_state,'cancel_requested');
  release.resolve();const response=await preparing;assert.equal(response.status,409);assert.equal((await response.json()).clientSecret,undefined);
  assert.ok(h.row.stripe_payment_intent_id);assert.equal(h.db.stripeCreates,1);assert.equal(h.db.mailboxes.size,0);
  assert.equal((await(await h.cancel()).json()).outcome,'canceled');assert.equal(h.db.stripeCreates,1);
});

test('webhook before the in-flight PI is linked requests retry, then reconciles the same PI once',async()=>{
  const h=setup(undefined,false),entered=deferred(),release=deferred();
  h.db.hooks.beforeStripeCreate=async()=>{entered.resolve();await release.promise;};
  const preparing=h.prepare();await entered.promise;
  await h.cancel();
  const pi={id:'pi_1',status:'succeeded',amount:5000,amount_received:5000,currency:'eur',metadata:{order_id:h.row.id}};
  assert.equal((await deliver(h.db,pi)).status,503);assert.equal(h.row.quantity_applied,false);
  release.resolve();await preparing;
  assert.equal(h.row.stripe_payment_intent_id,pi.id);assert.equal((await deliver(h.db,pi)).status,200);
  assert.equal(h.row.status,'NEW');assert.equal(h.row.quantity_applied,true);assert.equal(h.qty(),7);
  await deliver(h.db,pi);assert.equal(h.db.consumed,1);
});

test('successful cancel HTTP response without canceled status is not proof',async()=>{
  const h=setup('processing');h.db.hooks.afterStripeCancel=async pi=>{pi.status='processing';};
  assert.equal((await(await h.cancel()).json()).outcome,'cancellation_pending');assert.equal(h.row.status,'PENDING_PAYMENT');assert.equal(h.qty(),12);
});

test('succeeded PI with inconsistent amount received requires review',async()=>{
  const h=setup('succeeded');h.pi.amount_received=1;
  assert.equal((await(await h.cancel()).json()).outcome,'requires_review');assert.equal(h.row.quantity_applied,false);assert.equal(h.qty(),12);
});

test('cancel response is revalidated for identity after the Stripe call',async()=>{
  const h=setup();h.db.hooks.afterStripeCancel=async pi=>{pi.currency='usd';};
  assert.equal((await(await h.cancel()).json()).outcome,'requires_review');assert.equal(h.row.status,'PENDING_PAYMENT');assert.equal(h.row.pos_card_state,'cancel_requested');
});

test('in-flight existing-PI retrieval rechecks cancellation before returning a client secret',async()=>{
  const h=setup(),entered=deferred(),release=deferred();let first=true;
  h.db.hooks.beforeStripeGet=async()=>{if(first){first=false;entered.resolve();await release.promise;}};
  const preparing=h.prepare();await entered.promise;await h.cancel();release.resolve();
  const response=await preparing;assert.notEqual(response.status,200);assert.equal((await response.json()).clientSecret,undefined);
});

test('publication with a stale pre-cancellation read is rejected under the transaction recheck',async()=>{
  const h=setup(),entered=deferred(),release=deferred();let first=true;
  h.db.hooks.afterOrderRead=async()=>{if(first){first=false;entered.resolve();await release.promise;}};
  const publishing=h.publish();await entered.promise;await h.cancel();release.resolve();await assert.rejects(publishing);assert.equal(h.db.mailboxes.size,0);
});

test('terminal cleanup is scoped to the exact order, PI, user and event',async()=>{
  const h=setup();await h.publish();
  h.db.mailboxes.set('foreign',{...h.db.mailboxes.get(context.username),username:'foreign',order_id:'LOCAL-OTHER-ORDER'});
  await h.cancel();assert.equal(h.db.mailboxes.size,1);assert.equal(h.db.mailboxes.get('foreign').order_id,'LOCAL-OTHER-ORDER');
});

test('pending cancellation hides Terminal target but retains unresolved reservation',async()=>{
  const h=setup();await h.publish();h.db.hooks.beforeStripeGet=async()=>{throw Error('offline');};await h.cancel();
  assert.equal(await h.db.terminal.getTerminalActiveOrder(context.username),null);assert.equal(h.db.mailboxes.size,1);await assert.rejects(h.publish());
});

test('generic PATCH and stripe-confirm cannot bypass POS cancellation',async()=>{
  const h=setup();const prior=process.env.AFROFOOD_ENABLE_STRIPE_CONFIRM_FALLBACK;process.env.AFROFOOD_ENABLE_STRIPE_CONFIRM_FALLBACK='true';
  try{
    for(const state of ['ready','cancel_requested','canceled']){
      h.row.pos_card_state=state;h.row.status=state==='canceled'?'CANCELED':'PENDING_PAYMENT';
      for(const status of ['NEW','READY','DONE','IN_PROGRESS','PENDING_PAYMENT','CANCELED']){
        const res=await h.db.request(`/api/orders/${h.row.id}/status`,{method:'PATCH',body:JSON.stringify({status})});assert.ok(res.status>=400);
      }
      assert.equal((await h.db.request(`/api/orders/${h.row.id}/stripe-confirm`,{method:'PATCH',body:'{}'})).status,403);
    }
  }finally{if(prior===undefined)delete process.env.AFROFOOD_ENABLE_STRIPE_CONFIRM_FALLBACK;else process.env.AFROFOOD_ENABLE_STRIPE_CONFIRM_FALLBACK=prior;}
});

for(const patch of [{role:'kitchen'},{userId:'other'},{username:'other'},{eventId:'other'}]){
  test('unauthorized cancellation cannot change state: '+JSON.stringify(patch),async()=>{
    const h=setup();assert.equal((await h.cancel(patch)).status,403);assert.equal(h.row.pos_card_state,'ready');assert.equal(h.db.stripeGetCalls,0);
  });
}

test('wrong payment, non-POS, creating and missing orders are rejected',async()=>{
  for(const patch of [{payment:'cash'},{pos_card_key:null},{pos_card_state:'creating'}]){
    const h=setup();Object.assign(h.row,patch);assert.equal((await h.cancel()).status,409);assert.equal(h.db.stripeGetCalls,0);
  }
  const h=setup();h.db.orders.clear();assert.equal((await h.cancel()).status,404);
});

test('legacy NULL marker is unchanged by cancellation',async()=>{
  const h=setup();h.row.quantity_applied=null;await h.cancel();assert.equal(h.row.quantity_applied,null);assert.equal(h.qty(),12);
});

test('lost cancellation response persists local intent; reload cannot prepare a payment',async()=>{
  const h=setup(),card=load('src/lib/pos-card.ts');let saved;
  const attempt={key:'local-key',orderId:h.row.id,userId:context.userId,username:context.username,role:context.role,eventId:context.eventId,items:h.row.items,amountCents:5000};
  attempt.fingerprint=await card.makeCardFingerprint(attempt);
  const persist=a=>{saved=JSON.stringify(a);};
  await assert.rejects(card.cancelPosCard(attempt,persist,async(url,opts)=>{await h.db.request(url,opts);throw Error('HTTP response lost');}));
  const restored=JSON.parse(saved);assert.equal(restored.cancelRequested,true);
  await assert.rejects(card.preparePosCard(restored,persist,h.db.request));assert.equal(h.db.stripeCreates,0);
  assert.equal((await card.cancelPosCard(restored,persist,h.db.request)).outcome,'already_canceled');
});

test('CardPayment exposes explicit cancel, then only retry cancellation, then new order',()=>{
  const {CardPayment}=load('src/components/pos/CardPayment.tsx');let cancels=0;
  const h=setup(),attempt={orderId:h.row.id,eventId:h.row.event_id,amountCents:5000,published:false};
  let tree=CardPayment({attempt,order:h.row,lang:'fr',onCancel:()=>cancels++});
  findAll(tree,e=>e.type==='button'&&e.props.children==='Annuler le paiement carte')[0].props.onClick();assert.equal(cancels,1);
  attempt.cancelRequested=true;h.row.pos_card_state='cancel_requested';
  tree=CardPayment({attempt,order:h.row,lang:'fr',onCancel:()=>cancels++});
  assert.ok(findAll(tree,e=>e.type==='button'&&String(e.props.children).includes('Vérifier')).length);
  assert.equal(findAll(tree,e=>e.type==='button'&&String(e.props.children).includes('fortsetzen')).length,0);
  h.row.status='CANCELED';h.row.pos_card_state='canceled';tree=CardPayment({attempt,order:h.row,lang:'fr'});
  assert.ok(findAll(tree,e=>e.type==='button'&&e.props.children==='Nouvelle commande').length);
  h.row.payment_error='POS_CARD_SUCCESS_AFTER_CANCEL';tree=CardPayment({attempt,order:h.row,lang:'fr'});
  assert.equal(findAll(tree,e=>e.type==='button'&&e.props.children==='Nouvelle commande').length,0);
});

test('manual page reload resumes cancellation only, then allows a new sale after canceled',async()=>{
  const h=setup();h.row.pos_card_state='cancel_requested';
  const session={userId:context.userId,username:context.username,role:'cashier',cashierEventId:context.eventId};
  const card=load('src/lib/pos-card.ts');
  const attempt={key:'local-key',orderId:h.row.id,eventId:context.eventId,eventName:h.row.event_name,userId:context.userId,username:context.username,role:'cashier',items:h.row.items,amountCents:5000,createdAt:Date.now(),cancelRequested:true};
  attempt.fingerprint=await card.makeCardFingerprint(attempt);
  const key=card.cardAttemptKey('af_pos_cart_v1:local-user:local-event');
  const storage=new Map([[key,JSON.stringify(attempt)]]),calls=[];
  const previous=Object.fromEntries(['window','localStorage','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const settle=async()=>{for(let n=0;n<10;n++)await new Promise(resolve=>setImmediate(resolve));};
  try{
    globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
    globalThis.window={addEventListener:()=>{},removeEventListener:()=>{},setInterval:()=>1,clearInterval:()=>{},print:()=>{throw Error('Unexpected print');},location:{}};
    globalThis.fetch=async(url,opts)=>{
      calls.push([url,opts]);
      if(url.startsWith('/api/admin/menu-config'))return Response.json({ok:true,storeConfig:{events:[{id:context.eventId,name:h.row.event_name}]},sections:[]});
      return h.db.request(url,opts);
    };
    const page=harness('src/app/caisse/manual/page.tsx',{}, {'next/link':()=>null,'next/image':()=>null,'@/lib/staff-auth':{getSession:()=>session,resolveCashierEventId:s=>s.cashierEventId,getStaffRoleLabel:()=> 'Kasse'},'@/lib/translations':{getSavedLang:()=> 'de',saveLang:()=>{}}});
    page.render();page.effects.forEach(fn=>fn());await settle();page.render();
    page.effects.find(fn=>String(fn).includes('cardAttempt.published'))();await settle();
    let tree=page.render();let panel=findAll(tree,e=>e.type?.name==='CardPayment')[0];
    assert.equal(panel.props.attempt.cancelRequested,true);assert.equal(panel.props.order.pos_card_state,'cancel_requested');
    assert.ok(!calls.some(([url])=>url==='/api/stripe/terminal/payment-intent'));
    panel.props.onCancel();await settle();tree=page.render();panel=findAll(tree,e=>e.type?.name==='CardPayment')[0];
    assert.equal(panel.props.order.pos_card_state,'canceled');assert.equal(h.row.quantity_applied,false);assert.equal(h.qty(),12);
    panel.props.onNew();await settle();tree=page.render();
    assert.equal(findAll(tree,e=>e.type?.name==='CardPayment').length,0);assert.equal(storage.has(key),false);assert.equal(h.db.stripeCreates,0);
  }finally{for(const [k,descriptor]of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k];}}
});

test('local cancellation transaction rollback preserves pending claim and Terminal reservation',async()=>{
  const h=setup();await h.publish();h.db.hooks.beforeCommit=()=>{throw Error('simulated DB commit failure');};
  assert.equal((await h.cancel()).status,500);
  const current=h.db.orders.get(h.row.id);assert.equal(current.status,'PENDING_PAYMENT');assert.equal(current.pos_card_state,'cancel_requested');
  assert.equal(current.quantity_applied,false);assert.equal(h.qty(),12);assert.equal(h.db.mailboxes.size,1);
  h.db.hooks.beforeCommit=null;assert.equal((await(await h.cancel()).json()).outcome,'canceled');assert.equal(h.db.mailboxes.size,0);assert.equal(h.db.stripeCancelCalls,1);
});
