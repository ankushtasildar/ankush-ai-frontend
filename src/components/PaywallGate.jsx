/**
 * PaywallGate — wraps any page/component and blocks access
 * unless user has plan=trial (within trial period) or plan=pro.
 *
 * Access states:
 * - plan=pro, subscription_status=active → ✅ full access
 * - plan=trial, trial_ends_at > now → ✅ access + trial banner
 * - plan=trial, trial_ends_at < now → ❌ trial expired wall
 * - plan=expired OR subscription_status=canceled → ❌ expired wall
 * - plan=trial, payment_method_valid=false → ⚠️ card issue wall
 * - anything else → ❌ signup wall
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

function daysLeft(trialEndsAt) {
  if (!trialEndsAt) return 0
  const diff = new Date(trialEndsAt) - new Date()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function hoursLeft(trialEndsAt) {
  if (!trialEndsAt) return 0
  const diff = new Date(trialEndsAt) - new Date()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60)))
}

async function startCheckout(user) {
  try {
    const r = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        userId: user.id,
        returnUrl: window.location.origin,
      })
    })
    const d = await r.json()
    if (d.url) window.location.href = d.url
    else alert('Could not start checkout: ' + (d.error || 'unknown error'))
  } catch(e) {
    alert('Checkout error: ' + e.message)
  }
}

async function openBillingPortal(customerId) {
  try {
    const r = await fetch('/api/create-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, returnUrl: window.location.href })
    })
    const d = await r.json()
    if (d.url) window.location.href = d.url
  } catch(e) {
    alert('Billing portal error: ' + e.message)
  }
}

// ── Wall screens ──────────────────────────────────────────────────────────────
function Wall({ icon, title, subtitle, cta, onCta, cta2, onCta2, urgent }) {
  const [loading, setLoading] = useState(false)
  return (
    <div style={{ minHeight:'100vh', background:'#080c14', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"DM Mono",monospace', padding:24 }}>
      <div style={{ maxWidth:480, width:'100%', textAlign:'center' }}>
        {/* Logo */}
        <div style={{ color:'#e2e8f0', fontWeight:700, fontSize:18, letterSpacing:'0.1em', marginBottom:32, opacity:0.6 }}>⚡ ANKUSHAI</div>

        <div style={{ fontSize:52, marginBottom:20 }}>{icon}</div>
        <h1 style={{ color:'#e2e8f0', fontSize:22, fontWeight:700, margin:'0 0 12px' }}>{title}</h1>
        <p style={{ color:'#4a5c7a', fontSize:14, lineHeight:1.7, margin:'0 0 32px' }}>{subtitle}</p>

        {cta && (
          <button
            onClick={async () => { setLoading(true); await onCta(); setLoading(false) }}
            disabled={loading}
            style={{ display:'block', width:'100%', padding:'16px 24px', background: urgent ? '#dc2626' : '#2563eb', color:'white', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit', marginBottom:12, opacity:loading?0.7:1 }}>
            {loading ? 'Loading...' : cta}
          </button>
        )}
        {cta2 && (
          <button
            onClick={onCta2}
            style={{ display:'block', width:'100%', padding:'12px 24px', background:'transparent', color:'#4a5c7a', border:'1px solid #1e2d3d', borderRadius:10, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
            {cta2}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Trial banner (shown while trial is active) ────────────────────────────────
function TrialBanner({ profile, onUpgrade }) {
  const days = daysLeft(profile.trial_ends_at)
  const hours = hoursLeft(profile.trial_ends_at)
  const urgent = days <= 1
  const display = days === 0 ? `${hours}h` : `${days}d`
  const [loading, setLoading] = useState(false)

  return (
    <div style={{
      background: urgent ? 'rgba(220,38,38,0.12)' : 'rgba(245,158,11,0.1)',
      borderBottom: `1px solid ${urgent ? 'rgba(220,38,38,0.3)' : 'rgba(245,158,11,0.25)'}`,
      padding: '8px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontFamily: '"DM Mono",monospace',
      fontSize: 12,
      flexWrap: 'wrap',
      gap: 8,
    }}>
      <span style={{ color: urgent ? '#f87171' : '#f59e0b' }}>
        {urgent ? '⚠️' : '⏳'} <strong>Trial ends in {display}</strong>
        {!profile.payment_method_last4
          ? ' — Add a card to keep access'
          : ` — Card ending ${profile.payment_method_last4} will be charged`}
      </span>
      <button
        onClick={async () => { setLoading(true); await onUpgrade(); setLoading(false) }}
        disabled={loading}
        style={{ padding:'5px 14px', background: urgent ? '#dc2626' : '#d97706', border:'none', borderRadius:6, color:'white', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:loading?0.7:1 }}>
        {loading ? '...' : profile.payment_method_last4 ? 'Manage Billing' : 'Add Card Now'}
      </button>
    </div>
  )
}

// ── Main gate ─────────────────────────────────────────────────────────────────
export default function PaywallGate({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    if (!user) { setProfileLoading(false); return }
    supabase
      .from('profiles')
      .select('plan,subscription_status,trial_ends_at,stripe_customer_id,payment_method_last4,payment_method_valid')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { setProfile(data); setProfileLoading(false) })
      .catch(() => setProfileLoading(false))
  }, [user])

  // Loading
  if (authLoading || profileLoading) {
    return (
      <div style={{ minHeight:'100vh', background:'#080c14', display:'flex', alignItems:'center', justifyContent:'center', color:'#4a5c7a', fontFamily:'"DM Mono",monospace', fontSize:13 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:26, marginBottom:10, animation:'spin 1.2s linear infinite', display:'inline-block' }}>⚡</div>
          <div>Loading...</div>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  // Not logged in → redirect to landing
  if (!user) {
    window.location.href = '/'
    return null
  }

  const plan = profile?.plan || 'none'
  const status = profile?.subscription_status
  const trialEnd = profile?.trial_ends_at
  const isTrialActive = plan === 'trial' && trialEnd && new Date(trialEnd) > new Date()
  const isActive = plan === 'pro' && (status === 'active' || status === 'trialing')
  const cardInvalid = profile?.payment_method_valid === false
  const customerId = profile?.stripe_customer_id

  // ✅ Active subscriber
  if (isActive) {
    return <>{children}</>
  }

  // ✅ Trial active
  if (isTrialActive) {
    // Card invalid during trial → urgent warning but still let them in
    if (cardInvalid) {
      return (
        <>
          <div style={{ background:'rgba(220,38,38,0.15)', borderBottom:'1px solid rgba(220,38,38,0.4)', padding:'10px 20px', fontFamily:'"DM Mono",monospace', fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ color:'#f87171' }}>⚠️ <strong>Payment method failed.</strong> Update your card to keep access after trial.</span>
            <button onClick={() => customerId && openBillingPortal(customerId)}
              style={{ padding:'5px 14px', background:'#dc2626', border:'none', borderRadius:6, color:'white', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              Fix Card
            </button>
          </div>
          {children}
        </>
      )
    }
    return (
      <>
        <TrialBanner
          profile={profile}
          onUpgrade={() => customerId ? openBillingPortal(customerId) : startCheckout(user)}
        />
        {children}
      </>
    )
  }

  // ❌ Trial expired
  if (plan === 'trial' && trialEnd && new Date(trialEnd) <= new Date()) {
    return (
      <Wall
        icon="⏰"
        title="Your 3-day trial has ended"
        subtitle="Your trial period is up. Your card on file will be charged when you activate — no new card needed."
        cta={customerId ? "Activate Subscription →" : "Start Subscription →"}
        onCta={() => customerId ? openBillingPortal(customerId) : startCheckout(user)}
        urgent
      />
    )
  }

  // ❌ Canceled / expired subscription
  if (plan === 'expired' || status === 'canceled') {
    return (
      <Wall
        icon="📊"
        title="Subscription inactive"
        subtitle="Your AnkushAI subscription is no longer active. Reactivate to regain full access to market intelligence, signals, and your AI trading coach."
        cta="Reactivate Subscription →"
        onCta={() => customerId ? openBillingPortal(customerId) : startCheckout(user)}
        cta2="Sign out"
        onCta2={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
      />
    )
  }

  // ❌ Payment failed / past due
  if (status === 'past_due' || cardInvalid) {
    return (
      <Wall
        icon="💳"
        title="Payment issue — action needed"
        subtitle="We couldn't charge your card. Update your payment method to restore access. Your data is safe."
        cta="Update Payment Method →"
        onCta={() => customerId && openBillingPortal(customerId)}
        urgent
      />
    )
  }

  // ❌ No plan (never signed up / new user with no checkout)
  return (
    <Wall
      icon="⚡"
      title="Start your 3-day free trial"
      subtitle="Full access to market signals, AI analysis, live P&L tracking, and your trading journal. No charge for 3 days — cancel anytime."
      cta="Start Free Trial →"
      onCta={() => startCheckout(user)}
      cta2="Sign out"
      onCta2={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
    />
  )
}
