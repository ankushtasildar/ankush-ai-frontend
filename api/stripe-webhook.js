import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL||'https://cyjotqirydjilovbslvw.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY);
export const config={api:{bodyParser:false}};
async function buffer(r){const c=[];for await(const ch of r)c.push(typeof ch==='string'?Buffer.from(ch):ch);return Buffer.concat(c);}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  let event;
  try{const buf=await buffer(req);event=stripe.webhooks.constructEvent(buf,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);}
  catch(e){console.error('Webhook sig error:',e.message);return res.status(400).send('Webhook Error: '+e.message);}
  const obj=event.data.object;
  try{
    if(event.type==='checkout.session.completed'){
      const{user_id:uid,plan}=obj.metadata||{};
      if(uid){
        await supabase.from('profiles').update({plan,subscription_status:'active',stripe_customer_id:obj.customer,stripe_subscription_id:obj.subscription,updated_at:new Date().toISOString()}).eq('id',uid);
        await supabase.from('subscriptions').upsert({user_id:uid,stripe_subscription_id:obj.subscription,stripe_customer_id:obj.customer,plan,status:'active',updated_at:new Date().toISOString()},{onConflict:'stripe_subscription_id'});
      }
    }
    if(event.type==='customer.subscription.updated'||event.type==='customer.subscription.deleted'){
      const s=obj;
      await supabase.from('subscriptions').upsert({stripe_subscription_id:s.id,stripe_customer_id:s.customer,plan:s.metadata?.plan,status:s.status,current_period_start:new Date(s.current_period_start*1000).toISOString(),current_period_end:new Date(s.current_period_end*1000).toISOString(),updated_at:new Date().toISOString()},{onConflict:'stripe_subscription_id'});
      if(s.status==='canceled'||s.status==='unpaid')await supabase.from('profiles').update({plan:'free',subscription_status:s.status,updated_at:new Date().toISOString()}).eq('stripe_subscription_id',s.id);
    }
  }catch(e){console.error('Handler error:',e);return res.status(500).json({error:e.message});}
  res.json({received:true});
}