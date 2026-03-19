/**
 * POST /api/create-checkout
 * Creates a Stripe Checkout session.
 * - 3-day free trial
 * - Captures payment method (no charge during trial)
 * - Auto-subscribes after trial
 * - On success: redirect to /auth/callback?checkout=success
 */
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
const PRICE_ID = process.env.STRIPE_PRICE_ID // set in Vercel env

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { email, userId, returnUrl = 'https://ankushai.org' } = req.body || {}
  if (!email) return res.status(400).json({ error: 'email required' })

  try {
    // Upsert Stripe customer
    let customer
    const existing = await stripe.customers.list({ email, limit: 1 })
    if (existing.data.length) {
      customer = existing.data[0]
    } else {
      customer = await stripe.customers.create({ email, metadata: { supabase_user_id: userId || '' } })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: 3,
        metadata: { supabase_user_id: userId || '' },
      },
      payment_method_collection: 'always', // capture card even during trial
      success_url: `${returnUrl}/auth/callback?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}/?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata: { supabase_user_id: userId || '', email },
    })

    return res.status(200).json({ url: session.url, sessionId: session.id })
  } catch(e) {
    console.error('Checkout error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
