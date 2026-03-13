import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  starter: { monthly: 2900 },
  pro: { monthly: 9900 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { plan, userId, email, successUrl, cancelUrl } = req.body;
  const amount = PRICES[plan]?.monthly;
  if (!amount) return res.status(400).json({ error: 'Invalid plan' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'AnkushAI ' + plan.charAt(0).toUpperCase() + plan.slice(1) },
          unit_amount: amount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: { user_id: userId, plan },
      success_url: successUrl || 'https://www.ankushai.org/app?subscribed=1',
      cancel_url: cancelUrl || 'https://www.ankushai.org/#pricing',
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
