/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {load}=require('./ui-harness.cjs');
const {backend}=require('./card-backend-harness.cjs');
const card=load('src/lib/pos-card.ts');
async function attempt(items=[{id:'meal',name:'Forged',price:0.01,qty:1}]){
  const value={key:randomUUID(),userId:'user-a',username:'kasse',role:'cashier',eventId:'event-a',eventName:'Forged event',items,amountCents:1,createdAt:Date.now()};
  value.fingerprint=await card.makeCardFingerprint(value);return value;
}
const payload=sale=>({method:'POST',headers:{'x-staff-role':'cashier'},body:JSON.stringify({...sale,posCardKey:sale.key,payment:'card'})});

test('A/C/D/F: creation, retry and reload reuse one numbered card sale and stock claim',async()=>{
 const db=backend(),sale=await attempt();let saved;
 await card.preparePosCard(sale,value=>{saved=JSON.stringify(value);},db.request);
 const restored=JSON.parse(saved);await card.preparePosCard(restored,()=>{},db.request);
 assert.equal(db.orders.size,1);assert.equal(db.consumed,1);assert.equal(db.stripeCreates,1);
 assert.match(sale.orderId,/^\d{8}-\d{3,}$/);assert.notEqual(sale.orderId,sale.key);assert.equal(restored.orderId,sale.orderId);
 assert.equal(sale.amountCents,1000);assert.equal(sale.eventName,'Event A');assert.equal([...db.orders.values()][0].status,'PENDING_PAYMENT');
 assert.ok(!saved.includes('temporary-sdk-secret'));assert.ok(!saved.includes('clientSecret'));
});
test('B: concurrent same attempt creates and consumes only once',async()=>{
 const db=backend(),sale=await attempt();await Promise.all([db.request('/api/orders',payload(sale)),db.request('/api/orders',payload(sale))]);
 const retry=await (await db.request('/api/orders',payload(sale))).json();assert.equal(retry.ok,true);assert.equal(db.orders.size,1);assert.equal(db.consumeCalls,1);
});
test('E: same key with altered cart or user is rejected',async()=>{
 const db=backend(),sale=await attempt();await db.request('/api/orders',payload(sale));
 for(const altered of [{...sale,items:[{...sale.items[0],qty:2}]},{...sale,userId:'other'}]){
  altered.fingerprint=await card.makeCardFingerprint(altered);assert.equal((await db.request('/api/orders',payload(altered))).status,409);
 }
 assert.equal(db.orders.size,1);assert.equal(db.consumed,1);
});
test('lost order response recovers same sale; ambiguous stock write is never retried',async()=>{
 const db=backend(),sale=await attempt();let lost=true;
 const request=async(...args)=>{const result=await db.request(...args);if(lost){lost=false;throw Error('lost response');}return result;};
 await assert.rejects(card.preparePosCard(sale,()=>{},request));await card.preparePosCard(JSON.parse(JSON.stringify(sale)),()=>{},request);
 assert.equal(db.orders.size,1);assert.equal(db.consumed,1);
 const uncertain=backend(),second=await attempt();uncertain.stockError=Error('network error');
 await uncertain.request('/api/orders',payload(second));await uncertain.request('/api/orders',payload(second));assert.equal(uncertain.consumeCalls,1);assert.equal(uncertain.orders.size,1);
});
test('server validates event, visibility, quantities and dips; ignores client price/name',async()=>{
 const db=backend();
 for(const items of [[{id:'hidden',qty:1}],[{id:'meal',qty:-1}],[{id:'missing',qty:1}],[{id:'meal',qty:1},{id:'meal',qty:1}]]){
  const sale=await attempt(items);assert.equal((await db.request('/api/orders',payload(sale))).status,400);
 }
 const wrong=await attempt();wrong.eventId='unknown';wrong.fingerprint=await card.makeCardFingerprint(wrong);assert.equal((await db.request('/api/orders',payload(wrong))).status,400);
 const sale=await attempt([{id:'meal',qty:1},{id:'dip-green',qty:1},{id:'dip-chili',qty:1}]);await card.preparePosCard(sale,()=>{},db.request);
 assert.equal(sale.amountCents,1100);assert.equal([...db.orders.values()][0].items[0].name,'Meal');
});
for(const status of ['PENDING_PAYMENT','NEW','IN_PROGRESS','READY','DONE','CANCELED'])test('K-P: paid recognition '+status,async()=>{
 const sale=await attempt();sale.orderId='20261008-006';sale.amountCents=1000;sale.paymentIntentId='pi_expected';
 const row={id:sale.orderId,event_id:sale.eventId,payment:'card',payment_provider:'stripe',paid_at:'2026-10-08T12:00:00Z',amount_cents:1000,currency:'eur',stripe_payment_intent_id:'pi_expected',status};
 const expected=['NEW','IN_PROGRESS','READY','DONE'].includes(status);assert.equal(card.isPaidCardOrder(row,sale),expected);
 for(const patch of [{paid_at:null},{stripe_payment_intent_id:'pi_other'},{event_id:'other'},{amount_cents:1},{payment:'cash'}])assert.equal(card.isPaidCardOrder({...row,...patch},sale),false);
});
test('Q: repeated status checks and network failures never create or publish payments',async()=>{
 const db=backend(),sale=await attempt();await card.preparePosCard(sale,()=>{},db.request);
 for(let n=0;n<20;n++)assert.equal((await card.checkPosCard(sale,db.request)).status,'PENDING_PAYMENT');
 await assert.rejects(card.checkPosCard(sale,async()=>{throw Error('offline');}));
 assert.equal(db.orders.size,1);assert.equal(db.stripeCreates,1);assert.equal(db.consumeCalls,1);
});
test('lost terminal publication response followed by late payment reuses sale without another preparation',async()=>{
 const db=backend(),sale=await attempt();
 const request=async(url,options)=>{const response=await db.request(url,options);if(url==='/api/terminal-active-order')throw Error('publication acknowledgement lost');return response;};
 await assert.rejects(card.preparePosCard(sale,()=>{},request));assert.equal(sale.published,undefined);
 const row=db.orders.get(sale.orderId);Object.assign(row,{status:'READY',payment_provider:'stripe',paid_at:new Date().toISOString()});
 const restored=JSON.parse(JSON.stringify(sale));const paid=await card.preparePosCard(restored,()=>{},db.request);
 assert.equal(paid.id,row.id);assert.equal(paid.status,'READY');assert.equal(db.orders.size,1);assert.equal(db.stripeCreates,1);assert.equal(db.consumeCalls,1);
});
test('POS card cannot be advanced or canceled through generic status PATCH',async()=>{
 const db=backend(),sale=await attempt();await card.preparePosCard(sale,()=>{},db.request);
 for(const status of ['NEW','READY','DONE','IN_PROGRESS','CANCELED'])assert.equal((await db.request(`/api/orders/${sale.orderId}/status`,{method:'PATCH',body:JSON.stringify({status})})).status,403);
});

module.exports={attempt,payload};
