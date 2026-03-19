/**
 * POST /api/create-portal
 * Creates a Stripe Customer Portal session for billing management.
 * Users can update payment method, cancel, etc.
 */
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { customerId, returnUrl = 'https://ankushai.org/app' } = req.body || {}
  if (!customerId) return res.status(400).json({ error: 'customerId required' })

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    return res.status(200).json({ url: session.url })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
