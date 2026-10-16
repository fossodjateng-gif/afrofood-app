/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load, harness, findAll } = require('./ui-harness.cjs');
const { transactionalSql } = require('./sale-transaction-harness.cjs');

const limited = qty => ({ status: 'limited', remainingQty: qty, resumeAt: null });
const items = [{ id: 'meal', qty: 5, name: 'Meal', price: 10 }];
function setup(qty = 12) {
  const state = { orders: new Map(), settings: new Map([['item_availability:local-event', { meal: limited(qty) }]]) };
  const sql = transactionalSql(async (strings, ...v) => {
    const query = strings.join('');
    if (query.includes('UPDATE orders') && query.includes('SET status =')) {
      const row = state.orders.get(v[1]);
      if (!row || row.status !== v[2]) return [];
      row.status = v[0];return [structuredClone(row)];
    }
    if (query.includes('FROM orders') && query.includes('WHERE id =')) {
      const row = state.orders.get(v[0]);return row ? [structuredClone(row)] : [];
    }
    if (strings.join('').includes('SELECT setting_value')) {
      const entries = state.settings.get(v[0]);return entries ? [{ setting_value: structuredClone(entries) }] : [];
    }
    return [];
  }, state);
  const mocks = { '@/lib/db': { sql }, '@/lib/orders-schema': { ensureOrdersSchema: async()=>{} }, '@/lib/order-events': { publishOrderEvent:()=>{} }, 'next/server': { NextResponse: { json: (body, init)=>Response.json(body,init) } } };
  const cache = new Map();
  const { finalizeSale } = load('src/lib/finalize-sale.ts', mocks, cache);
  const admin = load('src/lib/menu-settings.ts', mocks, cache);
  const status = load('src/app/api/orders/[id]/status/route.ts', mocks, cache);
  function sale(id = 'LOCAL-QUANTITY-A', payment = 'cash', patch = {}) {
    const row = { id, payment, status: 'PENDING_PAYMENT', paid_at: null, quantity_applied: false,
      amount_cents: 5000, currency: 'eur', event_id: 'local-event', items: structuredClone(items), ...patch };
    state.orders.set(id, row);return row;
  }
  const patchStatus = (id, value)=>status.PATCH(new Request('http://localhost/api/orders/'+id+'/status',{method:'PATCH',body:JSON.stringify({status:value})}),{params:Promise.resolve({id})});
  return { state, sale, finalizeSale, admin, patchStatus, qty: () => state.settings.get('item_availability:local-event').meal.remainingQty };
}

for (const [before, sold, after] of [[12,5,7],[7,7,0],[2,5,0],[0,5,0]]) {
  test(`validated cash clamps ${before} - ${sold} to ${after}; retry/reload is inert`, async () => {
    const h = setup(before), row = h.sale();row.items[0].qty = sold;
    const first = await h.finalizeSale(row.id, { payment: 'cash', received: 5000 });
    assert.equal(first.changed, true);assert.equal(h.qty(), after);
    assert.equal(first.order.quantity_applied, true);assert.ok(first.order.paid_at);
    const retry = await h.finalizeSale(row.id, { payment: 'cash', received: 9000 });
    assert.equal(retry.changed, false);assert.equal(h.qty(), after);assert.equal(retry.order.cash_received_cents, 5000);
  });
}

test('two concurrent cash confirmations apply only once', async () => {
  const h = setup(), row = h.sale();
  const results = await Promise.all([h.finalizeSale(row.id, { payment: 'cash', received: 5000 }), h.finalizeSale(row.id, { payment: 'cash', received: 5000 })]);
  assert.equal(results.filter(r => r.changed).length, 1);assert.equal(h.qty(), 7);
});

test('two different simultaneous sales retain both decrements', async () => {
  const h = setup(), a = h.sale(), b = h.sale('LOCAL-QUANTITY-B');
  await Promise.all([a,b].map(row => h.finalizeSale(row.id, { payment: 'cash' })));
  assert.equal(h.qty(), 2);
});

test('card success, duplicate webhook and kitchen progress apply once', async () => {
  const h = setup(), row = h.sale(undefined, 'card', { stripe_payment_intent_id: 'pi_local_quantity' });
  const payment = { payment: 'card', paymentIntentId: 'pi_local_quantity', amountReceived: 5000, currency: 'eur' };
  assert.equal(h.qty(),12);
  const results = await Promise.all([h.finalizeSale(row.id, payment),h.finalizeSale(row.id, payment)]);
  assert.equal(results.filter(r => r.changed).length,1);assert.equal(h.qty(),7);
  row.status = 'READY';await h.finalizeSale(row.id,payment);assert.equal(row.status,'READY');assert.equal(h.qty(),7);
});

for (const patch of [{ paymentIntentId: 'pi_wrong' },{ amountReceived: 1 },{ currency: 'usd' }]) {
  test('mismatched card confirmation leaves payment and quantities untouched: '+JSON.stringify(patch), async () => {
    const h = setup(), row = h.sale(undefined,'card',{stripe_payment_intent_id:'pi_local_quantity'});
    assert.equal((await h.finalizeSale(row.id,{payment:'card',paymentIntentId:'pi_local_quantity',amountReceived:5000,currency:'eur',...patch})).changed,false);
    assert.equal(h.qty(),12);assert.equal(row.status,'PENDING_PAYMENT');assert.equal(row.quantity_applied,false);
  });
}

test('cash amount too small cannot validate or decrement', async () => {
  const h=setup(),row=h.sale();assert.equal((await h.finalizeSale(row.id,{payment:'cash',received:100})).changed,false);
  assert.equal(h.qty(),12);assert.equal(row.quantity_applied,false);
});

test('legacy NULL is preserved even when an old pending payment succeeds', async () => {
  const h=setup(),row=h.sale(undefined,'card',{quantity_applied:null,stripe_payment_intent_id:'pi_local_legacy'});
  const result=await h.finalizeSale(row.id,{payment:'card',paymentIntentId:'pi_local_legacy',amountReceived:5000,currency:'eur'});
  assert.equal(result.changed,true);assert.equal(result.order.quantity_applied,null);assert.equal(h.qty(),12);
});

test('transaction failure rolls back sale, quantity and marker, then retry succeeds once', async () => {
  const h=setup(),row=h.sale();h.state.beforeCommit=()=>{throw Error('simulated pre-commit failure');};
  await assert.rejects(h.finalizeSale(row.id,{payment:'cash'}));
  assert.equal(h.qty(),12);assert.equal(h.state.orders.get(row.id).status,'PENDING_PAYMENT');
  assert.equal(h.state.orders.get(row.id).quantity_applied,false);
  h.state.beforeCommit=null;await h.finalizeSale(row.id,{payment:'cash'});assert.equal(h.qty(),7);
});

test('multiple products, repeated items and free dips count units independently of pricing', async () => {
  const h=setup();h.state.settings.get('item_availability:local-event').dip=limited(9);
  const row=h.sale();row.items=[{id:'meal',qty:2},{id:'meal',qty:3},{id:'dip',qty:3,price:0,pricingKind:'dip'}];
  await h.finalizeSale(row.id,{payment:'cash'});
  assert.equal(h.qty(),7);assert.equal(h.state.settings.get('item_availability:local-event').dip.remainingQty,6);
});

test('no tracked counter still marks the sale applied; events remain isolated',async()=>{
  const h=setup(),row=h.sale();row.event_id='local-other-event';
  await h.finalizeSale(row.id,{payment:'cashless'});assert.equal(row.quantity_applied,false);
  row.payment='cashless';await h.finalizeSale(row.id,{payment:'cashless'});
  assert.equal(row.quantity_applied,true);assert.equal(h.qty(),12);
});

test('pre-payment cancellation never changes quantities; no automatic restock helper remains',async()=>{
  const h=setup(),row=h.sale(undefined,'card',{status:'CANCELED'});
  assert.equal((await h.finalizeSale(row.id,{payment:'card',paymentIntentId:'pi_local',amountReceived:5000,currency:'eur'})).changed,false);
  assert.equal(h.qty(),12);
  assert.doesNotMatch(fs.readFileSync('src/app/api/orders/[id]/status/route.ts','utf8'),/restoreItemAvailability/);
});

test('actual status route never restores counters on cancellation before or after validation',async()=>{
  const h=setup(),pending=h.sale('LOCAL-CANCEL-PENDING');
  assert.equal((await h.patchStatus(pending.id,'CANCELED')).status,200);assert.equal(h.qty(),12);
  const paid=h.sale('LOCAL-CANCEL-PAID');await h.finalizeSale(paid.id,{payment:'cash'});assert.equal(h.qty(),7);
  assert.equal((await h.patchStatus(paid.id,'CANCELED')).status,200);assert.equal(h.qty(),7);
  assert.equal((await h.patchStatus(paid.id,'PENDING_PAYMENT')).status,409);
});

test('classic cashless status validation uses common finalization and preserves kitchen progress on retry',async()=>{
  const h=setup(),row=h.sale(undefined,'cashless');
  assert.equal((await h.patchStatus(row.id,'NEW')).status,200);assert.equal(h.qty(),7);
  row.status='READY';const retry=await(await h.patchStatus(row.id,'NEW')).json();
  assert.equal(retry.order.status,'READY');assert.equal(h.qty(),7);
});

test('admin save after a concurrent sale is rejected instead of erasing its decrement',async()=>{
  const h=setup(),row=h.sale();const before=await h.admin.getItemAvailabilityMap('local-event');
  const [paid,revision]=await Promise.all([
    h.finalizeSale(row.id,{payment:'cash'}),
    h.admin.upsertItemAvailability('meal',limited(20),'local-event',before.meal.revision),
  ]);
  assert.equal(paid.changed,true);assert.equal(revision,null);assert.equal(h.qty(),7);
});

test('admin save before a sale serializes; unrelated entries survive',async()=>{
  const h=setup(),row=h.sale();h.state.settings.get('item_availability:local-event').dip=limited(3);
  const before=await h.admin.getItemAvailabilityMap('local-event');
  const revision=await h.admin.upsertItemAvailability('meal',limited(20),'local-event',before.meal.revision);
  assert.ok(revision);await h.finalizeSale(row.id,{payment:'cash'});assert.equal(h.qty(),15);
  assert.equal(h.state.settings.get('item_availability:local-event').dip.remainingQty,3);
});

test('admin can create a counter and save again using the returned revision',async()=>{
  const h=setup();const revision=await h.admin.upsertItemAvailability('new',limited(5),'local-event','null');
  assert.ok(revision);assert.ok(await h.admin.upsertItemAvailability('new',limited(9),'local-event',revision));
});

const product = qty => ({id:'meal',name:{de:'Meal',fr:'Meal',en:'Meal'},price:10,visible:true,availability:limited(qty)});
for (const flow of ['classic-cash','classic-card','classic-cashless','pos-cash','pos-card']) {
  for (const condition of ['zero','insufficient','hidden','blocked']) {
    test(`${flow} creation: ${condition} keeps quantity separate from manual sellability`,async()=>{
      const p=product(condition==='insufficient'?2:0);if(condition==='hidden')p.visible=false;
      if(condition==='blocked')p.availability.status='blocked';
      const inserts=[];let row;
      const sql=async(strings,...v)=>{
        const q=strings.join('');
        if(q.includes('INSERT INTO orders')) {
          inserts.push(q);row={id:v[0],event_id:'local-event',event_name:'Local',items:[{id:'meal',qty:5}],amount_cents:5000,status:'PENDING_PAYMENT',pos_card_state:'creating',pos_cash_state:'creating',pos_card_fingerprint:v[6],pos_cash_fingerprint:v[6]};
          return [row];
        }
        if(q.includes("state = 'ready'")){row.pos_card_state='ready';row.pos_cash_state='ready';return [row];}
        return [];
      };
      const route=load('src/app/api/orders/route.ts',{
        'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
        '@/lib/db':{sql},'@/lib/orders-schema':{ensureOrdersSchema:async()=>{}},
        '@/lib/order-number':{makeNextOrderId:async()=> 'LOCAL-CREATION-CHECK'},
        '@/lib/order-events':{publishOrderEvent:()=>{}},
        '@/lib/menu-settings':{
          getStoreConfig:async()=>({events:[{id:'local-event',name:'Local'}]}),
          getPaymentConfig:async()=>({cashEnabled:true,cardEnabled:true,cashlessEnabled:true}),
          getResolvedMenuSections:async()=>[{id:'food',items:[p]}],
        },
      });
      const payment=flow.split('-')[1],body={payment,eventId:'local-event',items:[{id:'meal',qty:5}],userId:'local-user',username:'local-cashier'};
      if(flow==='pos-cash')body.posCashKey='dddddddd-dddd-dddd-dddd-dddddddddddd';
      if(flow==='pos-card'){
        body.posCardKey='cccccccc-cccc-cccc-cccc-cccccccccccc';
        body.fingerprint=await load('src/lib/pos-card.ts').makeCardFingerprint(body);
      }
      const response=await route.POST(new Request('http://localhost/api/orders',{method:'POST',headers:{'x-staff-role':'cashier'},body:JSON.stringify(body)}));
      const refused=['hidden','blocked'].includes(condition);
      assert.equal(response.status,refused?400:200,JSON.stringify(await response.json()));
      assert.equal(inserts.length,refused?0:1);
      if(!refused)assert.match(inserts[0],/quantity_applied/);
      assert.equal(p.availability.remainingQty,condition==='insufficient'?2:0);
    });
  }
}

for (const qty of [0,2]) {
  test(`POS product, plus and checkout remain usable past indicative quantity ${qty}`,()=>{
    const pos=load('src/lib/pos-cart.ts'),p=product(qty);let cart=[];
    for(let n=0;n<5;n++)cart=pos.addPosProduct(cart,p);
    assert.equal(cart[0].qty,5);assert.equal(pos.getProductLimit(p),Infinity);
    const {ProductGrid}=load('src/components/pos/ProductGrid.tsx');
    const grid=ProductGrid({lang:'de',sections:[{id:'food',title:p.name,items:[p]}],categoryId:'',quantities:new Map([['meal',5]]),onAdd:()=>{},onCategoryChange:()=>{}});
    assert.equal(findAll(grid,e=>e.type==='button'&&e.props['aria-label']?.includes('Meal'))[0].props.disabled,false);
    const {PosCart}=load('src/components/pos/PosCart.tsx');
    const tree=PosCart({lang:'de',items:cart,products:new Map([['meal',p]]),cashDisabled:false,cardDisabled:false});
    assert.equal(findAll(tree,e=>e.type==='button'&&e.props['aria-label']?.includes('erhöhen'))[0].props.disabled,false);
    assert.ok(findAll(tree,e=>e.type==='button'&&['Barzahlung','Kartenzahlung'].includes(e.props.children)).every(e=>!e.props.disabled));
  });
}

test('hidden and explicitly blocked products remain unsellable in POS',()=>{
  const pos=load('src/lib/pos-cart.ts');
  for(const p of [{...product(0),visible:false},{...product(0),availability:{status:'blocked'}}]) {
    assert.equal(pos.getProductLimit(p),0);assert.deepEqual(pos.addPosProduct([],p),[]);
  }
});

test('Menu renders a red zero badge and keeps Add enabled',()=>{
  const p=product(0),page=harness('src/app/menu/page.tsx',{sections:[{id:'food',title:p.name,items:[p]}]},{'next/link':()=>null});
  const tree=page.render();const add=findAll(tree,e=>e.type==='button'&&e.props.title?.includes('Bestand 0'))[0];
  assert.equal(add.props.disabled,false);assert.equal(add.props['aria-disabled'],false);
  assert.ok(findAll(tree,e=>e.props?.style?.color==='#991b1b'&&String(e.props.children).includes('Bestand 0')).length);
});

test('Cart displays zero as an alert while its plus button remains enabled',()=>{
  const page=harness('src/app/cart/page.tsx',{lang:'de',quantities:{meal:limited(0)},cart:[{id:'meal',name:'Meal',price:10,qty:5,unitNotes:[]}]});
  const tree=page.render();
  assert.ok(findAll(tree,e=>e.props?.style?.color==='#991b1b'&&String(e.props.children).includes('Bestand 0')).length);
  assert.ok(findAll(tree,e=>e.type==='button'&&String(e.props.children).trim()==='+'&&!e.props.disabled).length);
});

test('schema never backfills legacy rows; all new creation paths explicitly opt in',()=>{
  const schema=fs.readFileSync('src/lib/orders-schema.ts','utf8');
  assert.match(schema,/ADD COLUMN IF NOT EXISTS quantity_applied BOOLEAN;/);
  assert.doesNotMatch(schema,/quantity_applied BOOLEAN[^;]*DEFAULT|UPDATE orders SET quantity_applied/);
  for(const file of ['src/app/api/orders/route.ts','src/lib/pos-cash-server.ts','src/lib/pos-card-server.ts']) {
    const text=fs.readFileSync(file,'utf8');assert.match(text,/quantity_applied/);assert.match(text,/FALSE\)/);
    assert.doesNotMatch(text,/consumeItemAvailability|restoreItemAvailability/);
  }
});
