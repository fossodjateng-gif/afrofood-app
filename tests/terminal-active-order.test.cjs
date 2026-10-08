/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict');
const {backend}=require('./card-backend-harness.cjs');
function order(db,id){db.orders.set(id,{id,payment:'card',status:'PENDING_PAYMENT',stripe_payment_intent_id:'pi_'+id});return {username:'kasse',userId:'user-a',eventName:'Event A',orderId:id,paymentIntentId:'pi_'+id};}
test('I/J: same order may resume; concurrent different unresolved order cannot overwrite',async()=>{
 const db=backend(),a=order(db,'a'),b=order(db,'b');const results=await Promise.allSettled([db.terminal.setTerminalActiveOrder(a),db.terminal.setTerminalActiveOrder(b)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const winner=db.mailboxes.get('kasse').order_id;
 await db.terminal.setTerminalActiveOrder(winner==='a'?a:b);assert.equal(db.mailboxes.get('kasse').order_id,winner);
});
test('expired unresolved mailbox still protects against another sale and unsafe clear',async()=>{
 const db=backend(),a=order(db,'a'),b=order(db,'b');await db.terminal.setTerminalActiveOrder(a);db.mailboxes.get('kasse').expires_at='2000-01-01T00:00:00Z';
 assert.equal((await db.terminal.getTerminalActiveOrder('kasse')).orderId,'a');await assert.rejects(db.terminal.setTerminalActiveOrder(b));
 await db.terminal.clearTerminalActiveOrder({username:'kasse',orderId:'a'});assert.equal(db.mailboxes.get('kasse').order_id,'a');
});
test('confirmed paid mailbox may be replaced or cleared by existing mobile flow',async()=>{
 const db=backend(),a=order(db,'a'),b=order(db,'b');await db.terminal.setTerminalActiveOrder(a);Object.assign(db.orders.get('a'),{status:'READY',payment_provider:'stripe',paid_at:'2026-10-08'});
 await db.terminal.setTerminalActiveOrder(b);assert.equal(db.mailboxes.get('kasse').order_id,'b');Object.assign(db.orders.get('b'),{status:'NEW',payment_provider:'stripe',paid_at:'2026-10-08'});
 await db.terminal.clearTerminalActiveOrder({username:'kasse',orderId:'b'});assert.equal(db.mailboxes.size,0);
});
test('server rejects mismatched PI or POS username/user/event relationship',async()=>{
 const db=backend(),a=order(db,'a');Object.assign(db.orders.get('a'),{pos_card_key:'key',pos_card_username:'kasse',pos_card_user_id:'user-a',event_name:'Event A',pos_card_state:'ready'});
 for(const patch of [{paymentIntentId:'other'},{username:'other'},{userId:'other'},{eventName:'other'}])await assert.rejects(db.terminal.setTerminalActiveOrder({...a,...patch}));
 assert.equal(db.mailboxes.size,0);
});
