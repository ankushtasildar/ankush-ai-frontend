import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Billing() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        supabase.from('subscriptions').select('*').eq('user_id', user.id).single()
          .then(({ data }) => { setSubscription(data); setLoading(false) })
          .catch(() => setLoading(false))
      } else setLoading(false)
    })
  }, [])

  async function handleUpgrade() {
    setUpgrading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: process.env.REACT_APP_STRIPE_PRICE_ID || 'price_default' })
      })
      const { url } = await r.json()
      if (url) window.location.href = url
    } catch(e) {
      alert('Error starting checkout: ' + e.message)
    }
    setUpgrading(false)
  }

  async function handlePortal() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session.access_token }
      })
      const { url } = await r.json()
      if (url) window.location.href = url
    } catch(e) { alert(e.message) }
  }

  const isPro = subscription?.status === 'active'
  const isCancelled = subscription?.cancel_at_period_end

  const features = [
    ['', 'AI Scan Engine', 'Full 100-framework market scan with shared cache - results in <1s'],
    ['', 'Trade Journal', 'Complete P&L tracking, win rate analytics, CSV export'],
    ['', 'Advanced Charts', 'RSI, MACD, Bollinger Bands, EMA stack with live data'],
    ['', 'Signals & Alerts', 'Price alerts, unusual volume detection, setup monitoring'],
    ['', 'Earnings Intelligence', 'IV rank, expected moves, historical beat rates for 200+ stocks'],
    ['', 'Sector Heatmap', 'Real-time sector rotation with regime detection'],
    ['', 'Risk Calculator', 'Kelly criterion, position sizing, EV calculation'],
    ['', 'EOD Debrief', 'Daily AI-generated market recap saved to your account'],
    ['', 'Intelligence Engine', 'Self-learning pattern recognition that improves with every scan'],
    ['', 'Portfolio Tracking', 'Live P&L, position management, performance snapshots'],
  ]

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif',maxWidth:900,margin:'0 auto'}}>
      <div style={{marginBottom:32}}>
        <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:28,fontWeight:800,margin:'0 0 6px'}}>AnkushAI Pro</h1>
        <p style={{color:'#4a5c7a',fontSize:13}}>Institutional-grade trading intelligence for retail traders</p>
      </div>

      {/* Current status */}
      {!loading && (
        <div style={{background:isPro?'rgba(16,185,129,0.06)':'rgba(37,99,235,0.06)',border:`1px solid ${isPro?'rgba(16,185,129,0.2)':'rgba(37,99,235,0.2)'}`,borderRadius:12,padding:'16px 20px',marginBottom:28,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:isPro?'#10b981':'#60a5fa'}}>
              {isPro ? ' Pro Active' : 'Free Plan'}
            </div>
            <div style={{color:'#4a5c7a',fontSize:12,marginTop:2}}>
              {isPro && subscription?.current_period_end
                ? (isCancelled ? `Cancels ${new Date(subscription.current_period_end*1000).toLocaleDateString()}` : `Renews ${new Date(subscription.current_period_end*1000).toLocaleDateString()}`)
                : isPro ? 'Pro subscription active' : 'Upgrade to unlock all features'}
            </div>
          </div>
          {isPro ? (
            <button onClick={handlePortal} style={{padding:'8px 18px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'#f0f6ff',fontSize:12,cursor:'pointer'}}>Manage Subscription</button>
          ) : (
            <button onClick={handleUpgrade} disabled={upgrading} style={{padding:'10px 24px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:8,color:'#fff',fontSize:13,cursor:'pointer',fontWeight:700}}>
              {upgrading?'Loading...':'Upgrade to Pro - $29/mo'}
            </button>
          )}
        </div>
      )}

      {/* Pricing cards */}
      {!isPro && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:32}}>
          {/* Free */}
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:24}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:4,color:'#6b7a90'}}>Free</div>
            <div style={{fontFamily:'"DM Mono",monospace',fontSize:32,fontWeight:800,marginBottom:16}}>$0<span style={{fontSize:14,color:'#4a5c7a'}}>/mo</span></div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {['3 scans per day','Basic chart view','Journal (10 trades/mo)','Sector overview'].map(f=>(
                <div key={f} style={{display:'flex',gap:8,alignItems:'center',fontSize:12,color:'#4a5c7a'}}>
                  <span style={{color:'#3d4e62'}}></span>{f}
                </div>
              ))}
              {['AI Intelligence Engine','Unlimited scans','Real-time alerts','Portfolio P&L tracking','EOD Debrief','Earnings calendar'].map(f=>(
                <div key={f} style={{display:'flex',gap:8,alignItems:'center',fontSize:12,color:'#2d3d50'}}>
                  <span></span>{f}
                </div>
              ))}
            </div>
          </div>
          {/* Pro */}
          <div style={{background:'rgba(37,99,235,0.06)',border:'2px solid rgba(37,99,235,0.3)',borderRadius:14,padding:24,position:'relative'}}>
            <div style={{position:'absolute',top:-10,right:16,background:'#2563eb',borderRadius:20,padding:'3px 12px',fontSize:9,fontWeight:700,fontFamily:'"DM Mono",monospace'}}>RECOMMENDED</div>
            <div style={{fontSize:13,fontWeight:700,marginBottom:4,color:'#60a5fa'}}>Pro</div>
            <div style={{fontFamily:'"DM Mono",monospace',fontSize:32,fontWeight:800,marginBottom:16}}>$29<span style={{fontSize:14,color:'#4a5c7a'}}>/mo</span></div>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
              {['Everything in Free','Unlimited AI scans (shared cache)','Real-time price alerts','Complete journal + P&L analytics','Portfolio tracking + snapshots','EOD AI debrief (daily)','Earnings intelligence','Sector rotation heatmap','Intelligence engine (self-learning)','Priority support'].map(f=>(
                <div key={f} style={{display:'flex',gap:8,alignItems:'center',fontSize:12,color:'#a5b4fc'}}>
                  <span style={{color:'#60a5fa'}}></span>{f}
                </div>
              ))}
            </div>
            <button onClick={handleUpgrade} disabled={upgrading} style={{width:'100%',padding:'12px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:10,color:'#fff',fontSize:14,cursor:'pointer',fontWeight:700}}>
              {upgrading?'Redirecting...':'Get Pro - $29/mo'}
            </button>
            <div style={{color:'#3d4e62',fontSize:10,textAlign:'center',marginTop:8}}>Cancel anytime. No contracts.</div>
          </div>
        </div>
      )}

      {/* Feature grid */}
      <div>
        <div style={{fontSize:13,fontWeight:600,color:'#4a5c7a',marginBottom:14,fontFamily:'"DM Mono",monospace'}}>WHAT'S INCLUDED IN PRO</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
          {features.map(([icon,title,desc])=>(
            <div key={title} style={{display:'flex',gap:12,padding:'12px 14px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10}}>
              <span style={{fontSize:20,flexShrink:0}}>{icon}</span>
              <div>
                <div style={{fontSize:12,fontWeight:600,marginBottom:3}}>{title}</div>
                <div style={{fontSize:11,color:'#4a5c7a',lineHeight:1.5}}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
