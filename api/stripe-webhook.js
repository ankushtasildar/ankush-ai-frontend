/**
 * POST /api/stripe-webhook
 * Handles Stripe webhook events to keep profiles table in sync.
 *
 * Events handled:
 * - checkout.session.completed → set plan=trial, trial_ends_at, save payment method
 * - customer.subscription.trial_will_end → send warning (3 days out)
 * - customer.subscription.updated → update subscription_status + plan
 * - customer.subscription.deleted → set plan=expired
 * - invoice.payment_failed → mark payment_method_valid=false, notify
 * - payment_method.updated → refresh card details
 */
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function updateProfile(stripeCustomerId, updates) {
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('stripe_customer_id', stripeCustomerId)
  if (error) console.error('Profile update error:', error.message)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const sig = req.headers['stripe-signature']
  let event

  try {
    const rawBody = await new Promise((resolve, reject) => {
      let data = ''
      req.on('data', chunk => { data += chunk })
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch(e) {
    console.error('Webhook signature error:', e.message)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  try {
    switch(event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'subscription') break
        const customerId = session.customer
        const subId = session.subscription

        // Get subscription + payment method details
        const sub = await stripe.subscriptions.retrieve(subId, { expand: ['default_payment_method'] })
        const pm = sub.default_payment_method
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null

        await updateProfile(customerId, {
          stripe_subscription_id: subId,
          subscription_status: sub.status, // 'trialing'
          plan: 'trial',
          trial_started_at: new Date().toISOString(),
          trial_ends_at: trialEnd,
          payment_method_id: pm?.id || null,
          payment_method_last4: pm?.card?.last4 || null,
          payment_method_brand: pm?.card?.brand || null,
          payment_method_exp_month: pm?.card?.exp_month || null,
          payment_method_exp_year: pm?.card?.exp_year || null,
          payment_method_valid: true,
        })
        console.log(`Trial started for customer ${customerId}, ends ${trialEnd}`)
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object
        const customerId = sub.customer
        const isActive = sub.status === 'active'
        const isTrialing = sub.status === 'trialing'

        await updateProfile(customerId, {
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
          plan: isActive ? 'pro' : isTrialing ? 'trial' : 'expired',
          trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        })
        console.log(`Subscription updated: ${customerId} → ${sub.status}`)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await updateProfile(sub.customer, {
          subscription_status: 'canceled',
          plan: 'expired',
        })
        console.log(`Subscription canceled: ${sub.customer}`)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = invoice.customer
        await updateProfile(customerId, {
          payment_method_valid: false,
          subscription_status: 'past_due',
        })
        console.log(`Payment failed: ${customerId}`)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        if (invoice.billing_reason === 'subscription_cycle' || invoice.billing_reason === 'subscription_create') {
          await updateProfile(invoice.customer, {
            payment_method_valid: true,
            subscription_status: 'active',
            plan: 'pro',
          })
        }
        break
      }

      case 'payment_method.updated':
      case 'payment_method.attached': {
        const pm = event.data.object
        if (!pm.customer) break
        await updateProfile(pm.customer, {
          payment_method_id: pm.id,
          payment_method_last4: pm.card?.last4,
          payment_method_brand: pm.card?.brand,
          payment_method_exp_month: pm.card?.exp_month,
          payment_method_exp_year: pm.card?.exp_year,
          payment_method_valid: true,
        })
        break
      }

      default:
        console.log(`Unhandled event: ${event.type}`)
    }
  } catch(e) {
    console.error('Webhook handler error:', e.message)
    return res.status(500).json({ error: e.message })
  }

  return res.status(200).json({ received: true })
}

export const config = { api: { bodyParser: false } }
