import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No auth token' });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });
    
    const origin = req.headers.origin || 'https://www.ankushai.org';
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return res.status(500).json({ error: 'Stripe price ID not configured' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app/billing?canceled=true`,
      metadata: { user_id: user.id, email: user.email },
      subscription_data: {
        metadata: { user_id: user.id }
      },
      allow_promotion_codes: true,
    });

    return res.json({ url: session.url, sessionId: session.id });
  } catch(e) {
    console.error('Checkout error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
