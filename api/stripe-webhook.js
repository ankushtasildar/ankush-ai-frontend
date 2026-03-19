import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const body = await getRawBody(req);
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId || session.client_reference_id;
        if (userId) {
          await supabase.from('profiles').update({
            plan: 'pro',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            subscription_status: 'active',
            updated_at: new Date().toISOString()
          }).eq('id', userId);

          await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_subscription_id: session.subscription,
            stripe_customer_id: session.customer,
            plan: 'pro',
            status: 'active',
            updated_at: new Date().toISOString()
          }, { onConflict: 'stripe_subscription_id' });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const status = sub.status;
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_subscription_id', sub.id)
          .single();
        if (profiles?.id) {
          await supabase.from('profiles').update({
            plan: status === 'active' ? 'pro' : 'free',
            subscription_status: status,
            updated_at: new Date().toISOString()
          }).eq('id', profiles.id);
          await supabase.from('subscriptions').update({
            status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          }).eq('stripe_subscription_id', sub.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_subscription_id', sub.id)
          .single();
        if (profiles?.id) {
          await supabase.from('profiles').update({
            plan: 'free',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString()
          }).eq('id', profiles.id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await supabase.from('subscriptions').update({
            status: 'past_due',
            updated_at: new Date().toISOString()
          }).eq('stripe_subscription_id', invoice.subscription);
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Handler failed' });
  }
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export const config = { api: { bodyParser: false } };
