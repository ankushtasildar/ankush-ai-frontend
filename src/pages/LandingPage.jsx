import { useAuth } from '../lib/auth'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

export default function LandingPage() {

  const { user, signInWithGoogle, signInWithMagicLink } = useAuth()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalView, setModalView] = useState('signup')
  const [selectedPlan, setSelectedPlan] = useState('pro')
  const [email, setEmail] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { if (user) navigate('/app') }, [user])

  function openModal(view) { setModalView(view); setModalOpen(true); setMsg('') }

  async function handleMagicLink(e) {
    e.preventDefault()
    const addr = modalView === 'login' ? loginEmail : email
    if (!addr) { setMsg('Please enter your email.'); return }
    setLoading(true)
    const { error } = await signInWithMagicLink(addr)
    setLoading(false)
    if (error) setMsg('Error: ' + error.message)
    else setMsg('Check your inbox for a magic link!')
  }

  async function handleGoogle() {
    setLoading(true)
    await signInWithGoogle()
  }

  const GoogleSVG = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{flexShrink:0}}>
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.07 0-3.83-1.4-4.46-3.27H1.85v2.07A8 8 0 0 0 8.98 17z"/>
      <path fill="#FBBC05" d="M4.52 10.54A4.8 4.8 0 0 1 4.27 9c0-.53.09-1.05.25-1.54V5.39H1.85A8 8 0 0 0 .98 9c0 1.29.31 2.51.87 3.61l2.67-2.07z"/>
      <path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.13 4.39l2.67 2.07c.63-1.87 2.4-3.27 4.46-3.27z"/>
    </svg>
  )

  const s = {
    overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' },
    modal: { background:'#0d1420', border:'1px solid rgba(255,255,255,0.14)', borderRadius:'16px', padding:'40px', width:'100%', maxWidth:'440px', position:'relative', color:'#f0f4ff', fontFamily:"'DM Sans',sans-serif" },
    close: { position:'absolute', top:'16px', right:'16px', background:'none', border:'none', color:'#4a5c7a', fontSize:'20px', cursor:'pointer' },
    title: { fontFamily:"'Syne',sans-serif", fontSize:'28px', fontWeight:800, marginBottom:'8px' },
    sub: { color:'#8b9fc0', fontSize:'14px', marginBottom:'24px', lineHeight:1.5 },
    plans: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'20px' },
    plan: (active) => ({ background: active ? 'rgba(37,99,235,0.15)' : '#111927', border: active ? '2px solid #2563eb' : '2px solid rgba(255,255,255,0.07)', borderRadius:'8px', padding:'14px', cursor:'pointer', textAlign:'center', transition:'all .2s' }),
    planName: { fontFamily:"'DM Mono',monospace", fontSize:'10px', letterSpacing:'.1em', textTransform:'uppercase', color:'#8b9fc0', marginBottom:'4px' },
    planPrice: { fontFamily:"'Syne',sans-serif", fontSize:'22px', fontWeight:800, color:'#f0f4ff' },
    planPeriod: { fontFamily:"'DM Mono',monospace", fontSize:'10px', color:'#4a5c7a' },
    input: { width:'100%', background:'#111927', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'8px', padding:'12px 16px', color:'#f0f4ff', fontFamily:"'DM Sans',sans-serif", fontSize:'14px', marginBottom:'12px', outline:'none', boxSizing:'border-box' },
    submit: { width:'100%', padding:'14px', background:'#2563eb', color:'white', border:'none', borderRadius:'8px', fontFamily:"'DM Mono',monospace", fontSize:'12px', letterSpacing:'.1em', textTransform:'uppercase', cursor:'pointer', marginBottom:'16px', transition:'background .2s', opacity: loading ? 0.6 : 1 },
    divider: { textAlign:'center', color:'#4a5c7a', fontSize:'12px', margin:'16px 0' },
    google: { width:'100%', padding:'13px', background:'#111927', color:'#f0f4ff', border:'1px solid rgba(255,255,255,0.14)', borderRadius:'8px', fontFamily:"'DM Sans',sans-serif", fontSize:'14px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', marginBottom:'16px', transition:'all .2s', opacity: loading ? 0.6 : 1 },
    msg: { fontSize:'13px', color:'#10b981', textAlign:'center', marginBottom:'12px', minHeight:'18px' },
    msgErr: { fontSize:'13px', color:'#ef4444', textAlign:'center', marginBottom:'12px', minHeight:'18px' },
    legal: { fontSize:'12px', color:'#4a5c7a', textAlign:'center', lineHeight:1.7 },
    legalLink: { color:'#3b82f6', cursor:'pointer', textDecoration:'none' },
  }

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:#080c14;color:#f0f4ff;font-family:'DM Sans',sans-serif;overflow-x:hidden}
        .lp-noise{position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");pointer-events:none;z-index:0}
        .lp-grid{position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.07) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;z-index:0;opacity:.5}
        nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 40px;height:64px;background:rgba(8,12,20,0.85);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,0.07)}
        .nav-logo{font-family:'DM Mono',monospace;font-size:13px;letter-spacing:.14em;color:#f0f4ff;text-decoration:none;font-weight:600}
        .nav-links{display:flex;align-items:center;gap:32px;list-style:none}
        .nav-links a{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.1em;color:#8b9fc0;text-decoration:none;text-transform:uppercase;transition:color .2s;cursor:pointer}
        .nav-links a:hover{color:#f0f4ff}
        .nav-cta{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;transition:all .2s}
        .nav-cta:hover{background:#3b82f6;box-shadow:0 0 20px rgba(37,99,235,0.4)}
        .hero{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:120px 40px 80px;text-align:center;z-index:1}
        .hero-glow{position:absolute;top:20%;left:50%;transform:translate(-50%,-50%);width:700px;height:700px;background:radial-gradient(circle,rgba(37,99,235,0.12) 0%,transparent 70%);pointer-events:none}
        .hero-tag{display:inline-flex;align-items:center;gap:8px;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#3b82f6;background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.3);padding:6px 16px;border-radius:100px;margin-bottom:32px}
        .dot{width:6px;height:6px;background:#10b981;border-radius:50%;animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(16,185,129,0.4)}50%{opacity:.7;box-shadow:0 0 0 4px rgba(16,185,129,0)}}
        h1{font-family:'Syne',sans-serif;font-size:clamp(48px,7vw,96px);font-weight:800;line-height:1;letter-spacing:-.02em;margin-bottom:28px;max-width:900px}
        .accent{background:linear-gradient(135deg,#3b82f6,#60a5fa,#10b981);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .hero-sub{font-size:18px;color:#8b9fc0;max-width:560px;margin-bottom:48px;font-weight:300;line-height:1.7}
        .hero-btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-bottom:64px}
        .btn-pri{font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:14px 32px;background:#2563eb;color:white;border:none;border-radius:8px;cursor:pointer;transition:all .2s}
        .btn-pri:hover{background:#3b82f6;box-shadow:0 0 32px rgba(37,99,235,0.5);transform:translateY(-1px)}
        .btn-out{font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:14px 32px;background:transparent;color:#f0f4ff;border:1px solid rgba(255,255,255,0.14);border-radius:8px;cursor:pointer;transition:all .2s}
        .btn-out:hover{border-color:rgba(255,255,255,0.3);background:rgba(255,255,255,0.04)}
        .stats{display:flex;gap:48px;justify-content:center;flex-wrap:wrap}
        .stat-v{font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:#f0f4ff;margin-bottom:4px}
        .stat-l{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#4a5c7a}
        section{position:relative;z-index:1;padding:100px 0}
        .container{max-width:1100px;margin:0 auto;padding:0 40px}
        .sec-tag{display:inline-block;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#3b82f6;background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.25);padding:5px 14px;border-radius:100px;margin-bottom:20px}
        .sec-title{font-family:'Syne',sans-serif;font-size:clamp(32px,4vw,52px);font-weight:800;letter-spacing:-.02em;line-height:1.1}
        .sec-sub{color:#8b9fc0;font-size:17px;font-weight:300;line-height:1.7;max-width:560px;margin-top:16px}
        .feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:48px}
        .feat-card{background:#0d1420;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:28px;transition:all .2s}
        .feat-card:hover{border-color:rgba(255,255,255,0.14);transform:translateY(-2px)}
        .feat-icon{font-size:28px;margin-bottom:16px;display:block}
        .feat-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;margin-bottom:8px}
        .feat-desc{font-size:14px;color:#8b9fc0;line-height:1.7}
        .pricing-sec{background:#0d1420}
        .pricing-hdr{text-align:center;margin-bottom:48px}
        .pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
        .price-card{background:#080c14;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:32px;position:relative;transition:all .2s}
        .price-card:hover{border-color:rgba(255,255,255,0.14);transform:translateY(-2px)}
        .price-card.featured{border-color:#2563eb;background:linear-gradient(135deg,rgba(37,99,235,0.08),#080c14)}
        .price-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;background:#2563eb;color:white;padding:4px 16px;border-radius:100px;white-space:nowrap}
        .price-tier{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#8b9fc0;margin-bottom:12px}
        .price-amt{font-family:'Syne',sans-serif;font-size:52px;font-weight:800;color:#f0f4ff;line-height:1}
        .price-amt sup{font-size:24px;vertical-align:top;margin-top:8px}
        .price-period{font-family:'DM Mono',monospace;font-size:11px;color:#4a5c7a;margin-bottom:20px}
        .price-div{height:1px;background:rgba(255,255,255,0.07);margin:20px 0}
        .price-feats{list-style:none;margin-bottom:28px}
        .price-feats li{font-size:14px;color:#8b9fc0;padding:6px 0 6px 22px;position:relative}
        .price-feats li::before{content:'+';position:absolute;left:0;color:#10b981;font-size:12px;font-weight:700}
        .price-btn{display:block;text-align:center;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:14px;border-radius:8px;cursor:pointer;transition:all .2s;border:none;width:100%}
        .price-btn.pri{background:#2563eb;color:white}
        .price-btn.pri:hover{background:#3b82f6;box-shadow:0 0 24px rgba(37,99,235,0.4)}
        .price-btn.out{background:transparent;color:#f0f4ff;border:1px solid rgba(255,255,255,0.14)}
        .price-btn.out:hover{border-color:rgba(255,255,255,0.3)}
        footer{position:relative;z-index:1;text-align:center;padding:60px 40px;border-top:1px solid rgba(255,255,255,0.07)}
        .foot-logo{font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.2em;color:#8b9fc0;margin-bottom:20px}
        .foot-links{display:flex;justify-content:center;gap:32px;margin-bottom:20px;list-style:none}
        .foot-links a{font-family:'DM Mono',monospace;font-size:11px;color:#4a5c7a;text-decoration:none;letter-spacing:.08em;text-transform:uppercase;transition:color .2s}
        .foot-copy{font-family:'DM Mono',monospace;font-size:11px;color:#4a5c7a}
        @media(max-width:640px){nav{padding:0 20px}.hero{padding:100px 20px 60px}.container{padding:0 20px}h1{font-size:clamp(36px,10vw,64px)}.hero-sub{font-size:16px}.stats{gap:24px}.btn-pri,.btn-out{padding:12px 20px;font-size:11px}}
      `}</style>

      <div className="lp-noise" />
      <div className="lp-grid" />

      <nav>
        <a href="/" className="nav-logo">⚡ ANKUSHAI</a>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a onClick={() => openModal('login')}>Sign In</a></li>
        </ul>
        <button className="nav-cta" onClick={() => openModal('signup')}>Get Access →</button>
      </nav>

      <div className="hero">
        <div className="hero-glow" />
        <div className="hero-tag"><span className="dot" /> Live Trading Intelligence</div>
        <h1>Institutional edge,<br /><span className="accent">built for traders.</span></h1>
        <p className="hero-sub">Real-time signals, AI-powered thesis generation, and portfolio analytics - everything a serious trader needs, in one platform.</p>
        <div className="hero-btns">
          <button className="btn-pri" onClick={() => openModal('signup')}>Start Free Trial →</button>
          <button className="btn-out" onClick={() => openModal('signup')}>Sign In</button>
        </div>
        <div className="stats">
          {[['847','Active Signals'],['94.2%','Signal Accuracy'],['12ms','Avg Latency'],['$2.4B','Volume Tracked']].map(([v,l]) => (
            <div key={l}><div className="stat-v">{v}</div><div className="stat-l">{l}</div></div>
          ))}
        </div>
      </div>

      <section id="features">
        <div className="container">
          <div className="sec-tag">Platform Features</div>
          <div className="sec-title">Everything you need to trade smarter</div>
          <p className="sec-sub">Built on institutional infrastructure, accessible to every serious trader.</p>
          <div className="feat-grid">
            {[
              ['>>>','Live Signal Feed','Proprietary scoring engine analyzes 50+ technical and macro indicators. Every signal includes confidence score, entry/exit levels, and real-time P&L tracking.'],
              ['[AI]','AI Thesis Generator','Describe any trade setup and get a structured investment thesis, risk/reward analysis, and historical analogues - powered by a fine-tuned financial model.'],
              ['[~]','Portfolio Analytics','Real-time P&L tracking, drawdown analysis, sector exposure, and Sharpe ratio calculation across your entire portfolio.'],
              ['[i]','Sentiment Intelligence','NLP analysis of 10,000+ news sources and earnings transcripts. Real-time sentiment scores for every major ticker.'],
              ['🔄','Strategy Backtesting','Backtest any signal combination on 20+ years of tick data. Walk-forward optimization and Monte Carlo simulation.'],
              ['⚡','Real-Time Sync','Every table syncs live across all sessions instantly. Built on institutional-grade Postgres infrastructure.'],
            ].map(([icon,title,desc]) => (
              <div className="feat-card" key={title}>
                <span className="feat-icon">{icon}</span>
                <div className="feat-title">{title}</div>
                <div className="feat-desc">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-sec" id="pricing">
        <div className="container">
          <div className="pricing-hdr">
            <div className="sec-tag">Pricing</div>
            <div className="sec-title">Simple, transparent access</div>
            <p style={{color:'#8b9fc0',fontSize:'15px',marginTop:'12px'}}>Cancel anytime. No lock-in. Start with a free trial.</p>
          </div>
          <div className="pricing-grid">
            <div className="price-card">
              <div className="price-tier">Starter</div>
              <div className="price-amt"><sup>$</sup>29</div>
              <div className="price-period">per month</div>
              <div className="price-div" />
              <ul className="price-feats">
                {['Signal feed (50/day)','Portfolio tracker','News sentiment','Basic backtesting','Trade journal','Email support'].map(i=><li key={i}>{i}</li>)}
              </ul>
              <button className="price-btn out" onClick={() => openModal('signup')}>Get Started →</button>
            </div>
            <div className="price-card featured">
              <div className="price-badge">Most Popular</div>
              <div className="price-tier">Pro</div>
              <div className="price-amt"><sup>$</sup>99</div>
              <div className="price-period">per month</div>
              <div className="price-div" />
              <ul className="price-feats">
                {['Unlimited signals','AI Thesis Generator','AI Journal Coach','Advanced backtesting','Price charts + EMA/RSI','Macro calendar','Real-time alerts','Priority support'].map(i=><li key={i}>{i}</li>)}
              </ul>
              <button className="price-btn pri" onClick={() => openModal('signup')}>Start Free Trial →</button>
            </div>
            <div className="price-card">
              <div className="price-tier">Enterprise</div>
              <div className="price-amt" style={{fontSize:'38px'}}>Custom</div>
              <div className="price-period">annual contract</div>
              <div className="price-div" />
              <ul className="price-feats">
                {['Everything in Pro','Multi-user seats','API access','Custom signal engines','Dedicated infrastructure','SLA + white-glove onboarding'].map(i=><li key={i}>{i}</li>)}
              </ul>
              <a href="mailto:ankushtasildar2@gmail.com" className="price-btn out" style={{textDecoration:'none'}}>Contact Sales -></a>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="foot-logo">⚡ ANKUSHAI</div>
        <div className="foot-links"><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Support</a></div>
        <div className="foot-copy">© 2026 AnkushAI. All rights reserved.</div>
      </footer>

      {modalOpen && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div style={s.modal}>
            <button style={s.close} onClick={() => setModalOpen(false)}>x</button>
            <span style={{fontSize:'32px',display:'block',marginBottom:'16px'}}>⚡</span>

            {modalView === 'signup' ? (<>
              <div style={s.title}>Get Access</div>
              <div style={s.sub}>Start your 7-day free trial. No credit card required.</div>
              <div style={s.plans}>
                {[{id:'pro',name:'Pro',price:'$99'},{id:'starter',name:'Starter',price:'$29'}].map(p => (
                  <div key={p.id} style={s.plan(selectedPlan===p.id)} onClick={() => setSelectedPlan(p.id)}>
                    <div style={s.planName}>{p.name}</div>
                    <div style={s.planPrice}>{p.price}</div>
                    <div style={s.planPeriod}>/month</div>
                  </div>
                ))}
              </div>
              {msg && <div style={msg.startsWith('Error') ? s.msgErr : s.msg}>{msg}</div>}
              <input style={s.input} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==='Enter' && handleMagicLink(e)} />
              <button style={s.submit} onClick={handleMagicLink} disabled={loading}>{loading ? 'Sending...' : 'Send Magic Link ->'}</button>
              <div style={s.divider}>or</div>
              <button style={s.google} onClick={handleGoogle} disabled={loading}><GoogleSVG />Continue with Google</button>
              <div style={s.legal}>
                By signing up you agree to our <a href="#" style={s.legalLink}>Terms</a> and <a href="#" style={s.legalLink}>Privacy Policy</a>.<br />
                Already have an account? <a style={s.legalLink} onClick={() => { setModalView('login'); setMsg('') }}>Sign in</a>
              </div>
            </>) : (<>
              <div style={s.title}>Welcome back</div>
              <div style={s.sub}>Sign in to your AnkushAI account.</div>
              {msg && <div style={msg.startsWith('Error') ? s.msgErr : s.msg}>{msg}</div>}
              <input style={s.input} type="email" placeholder="Email address" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} onKeyDown={e => e.key==='Enter' && handleMagicLink(e)} />
              <button style={s.submit} onClick={handleMagicLink} disabled={loading}>{loading ? 'Sending...' : 'Send Magic Link ->'}</button>
              <div style={s.divider}>or</div>
              <button style={s.google} onClick={handleGoogle} disabled={loading}><GoogleSVG />Continue with Google</button>
              <div style={s.legal}>No account? <a style={s.legalLink} onClick={() => { setModalView('signup'); setMsg('') }}>Get access -></a></div>
            </>)}
          </div>
        </div>
      )}
    </>
  )
}
