// api/stripe/webhook.js — Handle Stripe webhooks to update Supabase
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(e) {
    return res.status(400).json({ error: 'Webhook signature failed' });
  }

  const data = event.data.object;

  switch(event.type) {
    case 'checkout.session.completed': {
      const userId = data.metadata?.user_id;
      if (userId) {
        await supabase.from('subscriptions').upsert({
          user_id: userId, status: 'active', plan: 'pro',
          stripe_subscription_id: data.subscription,
          stripe_customer_id: data.customer,
          current_period_end: null,
          updated_at: new Date().toISOString()
        });
      }
      break;
    }
    case 'customer.subscription.updated': {
      const { data: profiles } = await supabase.from('profiles')
        .select('id').eq('stripe_customer_id', data.customer);
      if (profiles?.[0]) {
        await supabase.from('subscriptions').upsert({
          user_id: profiles[0].id,
          status: data.status === 'active' ? 'active' : 'inactive',
          plan: 'pro', stripe_subscription_id: data.id,
          current_period_end: new Date(data.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const { data: profiles } = await supabase.from('profiles')
        .select('id').eq('stripe_customer_id', data.customer);
      if (profiles?.[0]) {
        await supabase.from('subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('user_id', profiles[0].id);
      }
      break;
    }
  }

  return res.json({ received: true });
}
