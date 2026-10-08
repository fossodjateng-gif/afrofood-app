/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {backend}=require('./card-backend-harness.cjs');
function setup(){const db=backend();db.orders.set('20261008-006',{id:'20261008-006',payment:'card',status:'PENDING_PAYMENT',stripe_payment_intent_id:'pi_expected',amount_cents:1000,currency:'eur'});return db;}
async function deliver(db,patch={},validSignature=true){
 const old=process.env.STRIPE_WEBHOOK_SECRET;const secret='mock-webhook-secret';process.env.STRIPE_WEBHOOK_SECRET=secret;
 try{const payload=JSON.stringify({id:'evt_mock',type:'payment_intent.succeeded',data:{object:{id:'pi_expected',status:'succeeded',amount_received:1000,currency:'eur',metadata:{order_id:'20261008-006'},...patch}}});
 const t=String(Math.floor(Date.now()/1000)),sig=crypto.createHmac('sha256',secret).update(t+'.'+payload).digest('hex');
 return await db.webhook.POST(new Request('http://localhost/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${validSignature?sig:'bad'}`},body:payload}));
 }finally{if(old===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=old;}
}
for(const [name,patch] of [['PI',{id:'pi_other'}],['amount',{amount_received:999}],['currency',{currency:'usd'}],['metadata',{metadata:{order_id:'other'}}],['missing metadata',{metadata:{}}],['status',{status:'processing'}]])test('S/T: mismatched '+name+' cannot validate order',async()=>{
 const db=setup();const response=await deliver(db,patch);if(name==='metadata')assert.equal((await response.json()).ignored,true);else assert.equal(response.status,400);
 assert.equal(db.orders.get('20261008-006').status,'PENDING_PAYMENT');assert.equal(db.events.length,0);
});
test('non-card and invalid signature refused',async()=>{
 const db=setup();db.orders.get('20261008-006').payment='cash';assert.equal((await deliver(db)).status,400);
 assert.equal((await deliver(setup(),{},false)).status,400);
});
test('U: valid signed webhook validates once; duplicate preserves kitchen progress',async()=>{
 const db=setup();assert.equal((await deliver(db)).status,200);assert.equal(db.orders.get('20261008-006').status,'NEW');assert.ok(db.orders.get('20261008-006').paid_at);
 assert.equal(db.events.filter(e=>e.type==='PAYMENT_VALIDATED').length,1);db.orders.get('20261008-006').status='READY';await deliver(db);assert.equal(db.orders.get('20261008-006').status,'READY');assert.equal(db.events.filter(e=>e.type==='PAYMENT_VALIDATED').length,1);
});
test('late webhook never resurrects CANCELED order',async()=>{const db=setup();db.orders.get('20261008-006').status='CANCELED';await deliver(db);assert.equal(db.orders.get('20261008-006').status,'CANCELED');assert.equal(db.events.length,0);});
