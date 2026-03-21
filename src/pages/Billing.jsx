import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    color: '#4a5c7a',
    features: [
      '5 AI scans per day',
      'Overview + Market data',
      'Journal (10 trades)',
      'Basic charts',
      'Community access',
    ],
    limits: ['No shared scan cache priority', 'No EOD debrief', 'No intelligence patterns'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 39,
    period: '/month',
    color: '#2563eb',
    highlight: true,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
    features: [
      'Unlimited AI scans',
      'Shared scan cache (instant results)',
      'All 11 pages unlocked',
      'EOD debrief + daily recaps',
      'Intelligence learning engine',
      'Full journal + portfolio P&L',
      'Price alerts (Supabase-backed)',
      'CSV export',
      'Options strategy recommendations',
      'Priority market data',
    ],
    limits: [],
  },
  {
    id: 'institutional',
    name: 'Institutional',
    price: 199,
    period: '/month',
    color: '#f59e0b',
    features: [
      'Everything in Pro',
      'Real-time sector rotation alerts',
      'Custom scan universes (500+ stocks)',
      'API access for your own integrations',
      'Webhook alerts to Slack/Discord',
      'White-label options',
      'Priority support',
      'Custom frameworks',
    ],
    cta: 'Contact Us',
    limits: [],
  },
]

export default function Billing() {
  const [user, setUser] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState(false)
  const [managingBilling, setManagingBilling] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        const { data } = await supabase.from('subscriptions')
          .select('*').eq('user_id', user.id).single()
        setSubscription(data)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function startCheckout(plan) {
    if (plan.cta === 'Contact Us') {
      window.location.href = 'mailto:ankushtasildar2@gmail.com?subject=AnkushAI Institutional Plan'
      return
    }
    if (!user) { window.location.href = '/login'; return }
    setCheckingOut(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer '+session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: plan.priceId })
      })
      const d = await r.json()
      if (d.url) window.location.href = d.url
    } catch(e) { alert('Checkout error: '+e.message) }
    setCheckingOut(false)
  }

  async function manageSubscription() {
    setManagingBilling(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer '+session.access_token }
      })
      const d = await r.json()
      if (d.url) window.location.href = d.url
    } catch(e) { alert('Portal error: '+e.message) }
    setManagingBilling(false)
  }

  const isPro = subscription?.status === 'active'
  const currentPlan = isPro ? 'pro' : 'free'

  return (
    <div style={{padding:'28px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif',maxWidth:900,margin:'0 auto'}}>
      <div style={{textAlign:'center',marginBottom:36}}>
        <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:28,fontWeight:800,margin:'0 0 8px'}}>Plans & Pricing</h1>
        <p style={{color:'#4a5c7a',fontSize:13}}>Institutional-grade trading intelligence. Cancel anytime.</p>
        {isPro && (
          <div style={{display:'inline-flex',alignItems:'center',gap:8,marginTop:12,padding:'8px 16px',background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:20}}>
            <span style={{color:'#10b981',fontSize:12,fontWeight:700}}>✓ PRO ACTIVE</span>
            <button onClick={manageSubscription} disabled={managingBilling} style={{background:'none',border:'none',color:'#10b981',textDecoration:'underline',fontSize:11,cursor:'pointer'}}>
              {managingBilling?'Loading...':'Manage billing'}
            </button>
          </div>
        )}
      </div>

      {/* Plans */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16,marginBottom:32}}>
        {PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan
          const isUpgrade = plan.id === 'pro' && currentPlan === 'free'
          return (
            <div key={plan.id} style={{
              background: plan.highlight ? 'linear-gradient(160deg,rgba(37,99,235,0.12),rgba(13,20,32,1))' : '#0d1420',
              border:`2px solid ${isCurrent?'rgba(16,185,129,0.5)':plan.highlight?'rgba(37,99,235,0.4)':'rgba(255,255,255,0.08)'}`,
              borderRadius:16,padding:24,position:'relative',
            }}>
              {plan.highlight && !isCurrent && <div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',background:'#2563eb',borderRadius:20,padding:'3px 14px',fontSize:9,fontWeight:800,color:'#fff',fontFamily:'"DM Mono",monospace',letterSpacing:'.1em'}}>MOST POPULAR</div>}
              {isCurrent && <div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',background:'#10b981',borderRadius:20,padding:'3px 14px',fontSize:9,fontWeight:800,color:'#fff',fontFamily:'"DM Mono",monospace',letterSpacing:'.1em'}}>CURRENT PLAN</div>}

              <div style={{marginBottom:16}}>
                <div style={{color:plan.color,fontFamily:'"DM Mono",monospace',fontSize:11,fontWeight:700,marginBottom:4}}>{plan.name.toUpperCase()}</div>
                <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                  <span style={{fontSize:32,fontWeight:800,fontFamily:'"Syne",sans-serif'}}>{plan.price===0?'$0':'$'+plan.price}</span>
                  <span style={{color:'#4a5c7a',fontSize:12}}>{plan.period}</span>
                </div>
              </div>

              <div style={{marginBottom:20}}>
                {plan.features.map((f,i)=>(
                  <div key={i} style={{display:'flex',gap:8,marginBottom:6,fontSize:12,alignItems:'flex-start'}}>
                    <span style={{color:'#10b981',marginTop:1}}>✓</span><span style={{color:'#9ab'}}>{f}</span>
                  </div>
                ))}
                {plan.limits.map((f,i)=>(
                  <div key={i} style={{display:'flex',gap:8,marginBottom:6,fontSize:11,alignItems:'flex-start'}}>
                    <span style={{color:'#3d4e62',marginTop:1}}>✗</span><span style={{color:'#3d4e62'}}>{f}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={()=>isCurrent?null:startCheckout(plan)}
                disabled={isCurrent||checkingOut}
                style={{
                  width:'100%',padding:'11px',borderRadius:10,fontSize:12,fontWeight:700,cursor:isCurrent?'default':'pointer',
                  fontFamily:'"DM Mono",monospace',letterSpacing:'.04em',
                  background: isCurrent?'rgba(16,185,129,0.1)':isUpgrade?'linear-gradient(135deg,#2563eb,#1d4ed8)':plan.id==='institutional'?'linear-gradient(135deg,#d97706,#b45309)':'rgba(255,255,255,0.05)',
                  border: isCurrent?'1px solid rgba(16,185,129,0.3)':'none',
                  color: isCurrent?'#10b981':'#fff',
                  opacity: checkingOut?0.7:1,
                }}>
                {isCurrent ? '✓ Current Plan' : checkingOut ? 'Loading...' : plan.cta || (plan.price===0?'Get Started':'Upgrade to '+plan.name)}
              </button>
            </div>
          )
        })}
      </div>

      {/* Trust section */}
      <div style={{textAlign:'center',borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:24}}>
        <div style={{display:'flex',justifyContent:'center',gap:32,flexWrap:'wrap',marginBottom:12}}>
          {['🔒 Stripe secured','📊 Cancel anytime','⚡ Instant access','🧠 Claude AI powered'].map(t=>(
            <span key={t} style={{color:'#3d4e62',fontSize:11}}>{t}</span>
          ))}
        </div>
        <p style={{color:'#2d3d50',fontSize:10}}>Prices in USD. Subscriptions auto-renew monthly. Cancel in one click from billing portal.</p>
      </div>
    </div>
  )
}
