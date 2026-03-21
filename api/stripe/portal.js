// api/stripe/portal.js — Customer billing portal
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await supabase.from('profiles')
    .select('stripe_customer_id').eq('id', user.id).single();

  if (!profile?.stripe_customer_id) return res.status(400).json({ error: 'No billing account found' });

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${req.headers.origin || 'https://www.ankushai.org'}/app/billing`,
  });
  return res.json({ url: session.url });
}
