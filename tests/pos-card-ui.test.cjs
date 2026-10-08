/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,findAll,load}=require('./ui-harness.cjs');
const {backend}=require('./card-backend-harness.cjs');
test('A/B/D/Q/R: actual manual page double click, cash exclusion, waiting, reload, receipt on demand and next sale',async()=>{
 const previous=Object.fromEntries(['window','localStorage','fetch','navigator'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const storage=new Map(),db=backend(),session={userId:'user-a',username:'kasse',role:'cashier',cashierEventId:'event-a'};let prints=0;
 const settle=async()=>{for(let n=0;n<8;n++)await new Promise(resolve=>setImmediate(resolve));};
 try{
  globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  globalThis.window={addEventListener:()=>{},removeEventListener:()=>{},setInterval:()=>1,clearInterval:()=>{},print:()=>prints++,location:{}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(k,fn)=>fn()}}});
  globalThis.fetch=async(url,options)=>url.startsWith('/api/admin/menu-config')?Response.json({ok:true,storeConfig:{events:[{id:'event-a',name:'Event A'}]},sections:[{id:'food',title:{de:'Food'},items:[{id:'meal',name:{de:'Meal'},price:10,visible:true}]}]}):db.request(url,options);
  const mocks={'next/link':()=>null,'next/image':()=>null,'@/lib/staff-auth':{getSession:()=>session,resolveCashierEventId:s=>s.cashierEventId,getStaffRoleLabel:()=> 'Kasse'},'@/lib/translations':{getSavedLang:()=> 'de',saveLang:()=>{}}};
  const component=(tree,name)=>findAll(tree,e=>e.type?.name===name)[0];
  let page=harness('src/app/caisse/manual/page.tsx',{},mocks),tree=page.render();page.effects.forEach(fn=>fn());await settle();tree=page.render();
  component(tree,'ProductGrid').props.onAdd({id:'meal'});tree=page.render();const cart=component(tree,'PosCart');
  assert.equal(cart.props.cardDisabled,false);cart.props.onCard();cart.props.onCard();cart.props.onCash();await settle();tree=page.render();
  assert.equal(db.orders.size,1);assert.equal(db.stripeCreates,1);assert.equal(component(tree,'CashPayment'),undefined);assert.equal(component(tree,'OrderReceipt'),undefined);assert.equal(prints,0);
  let panel=component(tree,'CardPayment');assert.equal(panel.props.attempt.published,true);assert.equal(panel.props.receipt,null);const id=panel.props.attempt.orderId;
  panel.props.onCheck();await settle();assert.equal(db.orders.size,1);
  // A fresh page restores the persisted attempt and its frozen cart.
  page=harness('src/app/caisse/manual/page.tsx',{},mocks);tree=page.render();page.effects.forEach(fn=>fn());await settle();tree=page.render();panel=component(tree,'CardPayment');
  assert.equal(panel.props.attempt.orderId,id);assert.equal(db.orders.size,1);assert.equal(db.stripeCreates,1);
  const row=db.orders.get(id);Object.assign(row,{status:'DONE',paid_at:'2026-10-08T12:00:00Z',payment_provider:'stripe'});
  panel.props.onCheck();await settle();tree=page.render();panel=component(tree,'CardPayment');assert.equal(panel.props.receipt.id,id);assert.equal(component(tree,'OrderReceipt'),undefined);assert.equal(prints,0);
  panel.props.onTicket();tree=page.render();assert.equal(component(tree,'OrderReceipt').props.order.id,id);assert.equal(prints,0);
  panel.props.onNew();await settle();tree=page.render();assert.equal(component(tree,'CardPayment'),undefined);assert.deepEqual(component(tree,'PosCart').props.items,[]);assert.equal(storage.has('af_pos_cart_v1:user-a:event-a:card-attempt'),false);assert.equal(db.orders.size,1);
 }finally{for(const [k,d]of Object.entries(previous)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
test('R: CardPayment buttons have no automatic receipt or print action',()=>{
 const {CardPayment}=load('src/components/pos/CardPayment.tsx');let tickets=0;
 const tree=CardPayment({attempt:{orderId:'20261008-006',amountCents:1000,eventName:'Event A'},receipt:{id:'20261008-006'},lang:'de',onNew:()=>{},onTicket:()=>tickets++});
 assert.equal(tickets,0);findAll(tree,e=>e.type==='button'&&e.props.children==='Beleg / Ticket')[0].props.onClick();assert.equal(tickets,1);
});
test('X: existing caisse card button uses shared preparation, same terminal, no NEW PATCH or automatic receipt',async()=>{
 const previous=Object.fromEntries(['window','fetch','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const session={userId:'user-a',username:'kasse',role:'cashier'},db=backend(),calls=[];
 const row={id:'20261008-006',created_at:new Date().toISOString(),event_id:'event-a',event_name:'Event A',payment:'card',status:'PENDING_PAYMENT',amount_cents:1000,currency:'eur',items:[{id:'meal',name:'Meal',qty:1,price:10}]};db.orders.set(row.id,row);
 try{
  globalThis.window={setTimeout:()=>1,print:()=>{throw Error('Unexpected print');}};globalThis.localStorage={getItem:()=>null};
  globalThis.fetch=async(url,options)=>{calls.push([url,options]);return url==='/api/orders?eventId=event-a'?Response.json([row]):db.request(url,options);};
  const h=harness('src/app/caisse/page.tsx',{isUnlocked:true,staffRole:'cashier',staffSession:session,eventReady:true,activeEventName:'Event A',selectedEventId:'event-a',orders:[row],loading:false},{'@/lib/staff-auth':{getSession:()=>session,getStaffRoleLabel:()=> 'Kasse'}});
  const tree=h.render();const button=findAll(tree,e=>e.type==='button'&&String(e.props.onClick).includes('initTapToPay'))[0];assert.ok(button);assert.equal(button.props.disabled,false);
  button.props.onClick();for(let n=0;n<8;n++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(db.stripeCreates,1);assert.equal(db.mailboxes.get('kasse').order_id,row.id);assert.equal(row.status,'PENDING_PAYMENT');assert.ok(!calls.some(([,options])=>options?.method==='PATCH'));
  assert.equal(h.state.actionError,null);assert.equal(h.state.tapToPayInfo[row.id].paymentIntentId,row.stripe_payment_intent_id);
 }finally{for(const[k,d]of Object.entries(previous)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
