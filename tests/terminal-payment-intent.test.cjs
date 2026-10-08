/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict');
const {backend}=require('./card-backend-harness.cjs');
const {load}=require('./ui-harness.cjs');
const {randomUUID}=require('node:crypto');
const card=load('src/lib/pos-card.ts');
async function create(db){const sale={key:randomUUID(),userId:'user-a',username:'kasse',role:'cashier',eventId:'event-a',items:[{id:'meal',qty:1}]};sale.fingerprint=await card.makeCardFingerprint(sale);const result=await(await db.request('/api/orders',{method:'POST',headers:{'x-staff-role':'cashier'},body:JSON.stringify({...sale,posCardKey:sale.key,payment:'card'})})).json();return result.order.id;}
const prepare=(db,id)=>db.request('/api/stripe/terminal/payment-intent',{method:'POST',body:JSON.stringify({orderId:id})});
test('G/H: concurrent and repeated preparation uses one Stripe PaymentIntent',async()=>{
 const db=backend(),id=await create(db);const results=await Promise.all([prepare(db,id),prepare(db,id)]);const data=await Promise.all(results.map(r=>r.json()));
 assert.ok(data.every(r=>r.ok));assert.equal(data[0].paymentIntentId,data[1].paymentIntentId);assert.equal(db.stripeCreates,1);
 const retry=await(await prepare(db,id)).json();assert.equal(retry.reused,true);assert.equal(retry.paymentIntentId,data[0].paymentIntentId);
});
test('lost Stripe response reuses stable key; expired uncertain request refuses a new intent',async()=>{
 const db=backend(),id=await create(db);db.loseStripeResponse=true;assert.equal((await prepare(db,id)).status,500);
 assert.equal((await prepare(db,id)).status,200);assert.equal(db.stripeCreates,1);
 const other=backend(),otherId=await create(other);other.orders.get(otherId).stripe_pi_started_at=new Date(Date.now()-25*3600000).toISOString();assert.equal((await prepare(other,otherId)).status,409);assert.equal(other.stripeCreates,0);
});
test('canceled or mismatched existing intent is never replaced',async()=>{
 const db=backend(),id=await create(db);await prepare(db,id);const pi=[...db.intents.values()][0];pi.status='canceled';assert.equal((await prepare(db,id)).status,400);assert.equal(db.stripeCreates,1);
});
test('cashier requests receive no client secret; native default remains compatible',async()=>{
 const db=backend(),id=await create(db);
 const web=await(await db.request('/api/stripe/terminal/payment-intent',{method:'POST',body:JSON.stringify({orderId:id,includeClientSecret:false})})).json();
 assert.equal(web.clientSecret,undefined);
 const native=await(await prepare(db,id)).json();assert.ok(native.clientSecret);assert.equal(native.paymentIntentId,web.paymentIntentId);assert.equal(db.stripeCreates,1);
});
test('Stripe helper sends server idempotency header without changing other calls',async()=>{
 const previous=global.fetch,oldKey=process.env.STRIPE_SECRET_KEY;
 try{process.env.STRIPE_SECRET_KEY='mock-only';const calls=[];global.fetch=async(url,options)=>{calls.push(options);return Response.json({id:'pi_mock'});};
 const {stripePost}=load('src/lib/stripe-server.ts');await stripePost('/payment_intents',{amount:1000},'stable-key');await stripePost('/terminal/connection_tokens',{});
 assert.equal(calls[0].headers['Idempotency-Key'],'stable-key');assert.equal(calls[1].headers['Idempotency-Key'],undefined);
 }finally{global.fetch=previous;if(oldKey===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=oldKey;}
});
