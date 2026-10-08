/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');

function backend() {
  const orders = new Map(), mailboxes = new Map(), intents = new Map(), events = [];
  let consumed = 0, consumeCalls = 0, stripeCreates = 0, stockError = null, loseStripeResponse = false;
  const copy = row => row ? [{ ...row }] : [];
  const paid = row => row?.payment_provider === 'stripe' && row.paid_at && ['NEW', 'IN_PROGRESS', 'READY', 'DONE'].includes(row.status);
  const sql = async (strings, ...v) => {
    const q = strings.join('');
    if (/CREATE |ALTER /.test(q)) return [];
    if (q.includes('WHERE id LIKE')) return [...orders.values()].filter(row => row.id.startsWith(v[0].slice(0, -1))).sort((a,b) => b.id.localeCompare(a.id)).slice(0,1).map(row => ({ id: row.id }));
    if (q.includes('WHERE pos_card_key')) return copy([...orders.values()].find(row => row.pos_card_key === v[0]));
    if (q.includes('INSERT INTO orders')) {
      if (orders.has(v[0]) || [...orders.values()].some(row => row.pos_card_key === v[5])) return [];
      const row = { id:v[0],event_id:v[1],event_name:v[2],payment:'card',amount_cents:v[3],items:JSON.parse(v[4]),pos_card_key:v[5],pos_card_fingerprint:v[6],pos_card_user_id:v[7],pos_card_username:v[8],pos_card_state:'creating',status:'PENDING_PAYMENT',currency:'eur',stripe_payment_intent_id:null };
      orders.set(row.id,row);return copy(row);
    }
    if (q.includes("pos_card_state = 'ready'")) { const row=orders.get(v[0]);row.pos_card_state='ready';return copy(row); }
    if (q.includes("pos_card_state = 'failed'")) { Object.assign(orders.get(v[0]),{pos_card_state:'failed',status:'CANCELED'});return []; }
    if (q.includes('SET stripe_pi_started_at')) { const row=orders.get(v[0]);if(row.status!=='PENDING_PAYMENT')return [];row.stripe_pi_started_at ||= new Date().toISOString();return copy(row); }
    if (q.includes('UPDATE orders') && q.includes('stripe_payment_intent_id = COALESCE')) {
      if (q.includes('paid_at =')) {
        const row=orders.get(v[1]);
        if(!row || row.status!=='PENDING_PAYMENT' || row.stripe_payment_intent_id!==v[2] || row.amount_cents!==v[3] || row.currency!==v[4]) return [];
        Object.assign(row,{paid_at:new Date().toISOString(),payment_provider:'stripe',status:'NEW'});return copy(row);
      }
      const row=orders.get(v[2]);if(row.stripe_payment_intent_id && row.stripe_payment_intent_id!==v[0])return [];
      Object.assign(row,{stripe_payment_intent_id:v[0],amount_cents:v[1],currency:'eur',payment_provider:'stripe'});return copy(row);
    }
    if (q.includes('UPDATE orders') && q.includes("payment_provider = 'stripe'")) { orders.get(v[1]).payment_provider='stripe';return []; }
    if (q.includes('INSERT INTO terminal_active_orders')) {
      const old=mailboxes.get(v[0]);
      if(old && old.order_id!==v[3] && !(paid(orders.get(old.order_id)) && orders.get(old.order_id).stripe_payment_intent_id===old.payment_intent_id)) return [];
      const row={username:v[0],user_id:v[1],event_name:v[2],order_id:v[3],payment_intent_id:v[4],updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+900000).toISOString()};mailboxes.set(v[0],row);return copy(row);
    }
    if (q.includes('DELETE FROM terminal_active_orders')) {
      for (const [username,row] of mailboxes) if ((!v.length || (username===v[0] && row.order_id===v[1])) && paid(orders.get(row.order_id))) mailboxes.delete(username);
      return [];
    }
    if (q.includes('FROM terminal_active_orders')) return copy(mailboxes.get(v[0]));
    if (q.includes('WHERE stripe_payment_intent_id')) return copy([...orders.values()].find(row=>row.stripe_payment_intent_id===v[0]));
    if (q.includes('WHERE id =')) return copy(orders.get(v[0]));
    throw new Error('Unmocked SQL: '+q);
  };
  const mocks={
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    '@/lib/db':{sql},'@/lib/orders-schema':{ensureOrdersSchema:async()=>{}},
    '@/lib/order-events':{publishOrderEvent:event=>events.push(event)},
    '@/lib/menu-settings':{
      getStoreConfig:async()=>({events:[{id:'event-a',name:'Event A'}]}),getPaymentConfig:async()=>({cardEnabled:true}),
      getResolvedMenuSections:async()=>[{id:'food',items:[{id:'meal',name:{de:'Meal'},price:10,visible:true},{id:'hidden',name:{de:'Hidden'},price:10,visible:false}]},{id:'dips',items:[{id:'dip-green',name:{de:'Green'},price:7,visible:true},{id:'dip-chili',name:{de:'Chili'},price:7,visible:true}]}],
      consumeItemAvailability:async()=>{consumeCalls++;if(stockError)throw stockError;consumed++;},restoreItemAvailability:async()=>{throw Error('Unexpected stock restore');},
    },
    '@/lib/stripe-server':{
      stripeGet:async path=>{const pi=[...intents.values()].find(pi=>path.endsWith(pi.id));assert.ok(pi);return {...pi};},
      stripePost:async(path,data,key)=>{
        assert.equal(path,'/payment_intents');assert.ok(key);
        if(!intents.has(key)){stripeCreates++;intents.set(key,{id:'pi_'+stripeCreates,client_secret:'temporary-sdk-secret',amount:data.amount,currency:data.currency,status:'requires_payment_method',metadata:{order_id:data['metadata[order_id]']}});}
        await Promise.resolve();
        if(loseStripeResponse){loseStripeResponse=false;throw Error('Stripe response lost');}
        return {...intents.get(key)};
      },
    },
  };
  const cache=new Map();
  const post=load('src/app/api/orders/route.ts',mocks,cache), pi=load('src/app/api/stripe/terminal/payment-intent/route.ts',mocks,cache), terminal=load('src/app/api/terminal-active-order/route.ts',mocks,cache), webhook=load('src/app/api/stripe/webhook/route.ts',mocks,cache), status=load('src/app/api/orders/[id]/status/route.ts',mocks,cache);
  const request=async(url,options={})=>{
    const req=new Request('http://localhost'+url,options);
    if(url.startsWith('/api/orders?'))return post.GET(req);
    if(url==='/api/orders')return post.POST(req);
    if(url==='/api/stripe/terminal/payment-intent')return pi.POST(req);
    if(url==='/api/terminal-active-order')return terminal.POST(req);
    if(url.startsWith('/api/terminal-active-order?'))return terminal.GET(req);
    if(url.endsWith('/status'))return status.PATCH(req,{params:Promise.resolve({id:url.split('/')[3]})});
    throw Error('Unexpected request '+url);
  };
  return {request,orders,mailboxes,intents,events,webhook,terminal:load('src/lib/terminal-active-orders.ts',mocks,cache),get consumed(){return consumed;},get consumeCalls(){return consumeCalls;},get stripeCreates(){return stripeCreates;},set stockError(value){stockError=value;},set loseStripeResponse(value){loseStripeResponse=value;}};
}
module.exports={backend};
