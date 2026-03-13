import { useAuth } from '../lib/auth'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

export default function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // If already logged in, go straight to dashboard
  useEffect(() => {
    if (user) navigate('/app')
  }, [user])

  function openModal(view) {
    document.getElementById('modal').classList.add('active')
    const signup = document.getElementById('modal-signup-view')
    const login  = document.getElementById('modal-login-view')
    if (view === 'login') { signup.style.display='none'; login.style.display='block' }
    else                  { signup.style.display='block'; login.style.display='none' }
    return false
  }

  function closeModal() { document.getElementById('modal').classList.remove('active') }
  function closeModalOutside(e) { if (e.target===document.getElementById('modal')) closeModal() }

  function selectPlan(el, plan) {
    document.querySelectorAll('.plan-option').forEach(o => o.classList.remove('selected'))
    el.classList.add('selected')
    window._selectedPlan = plan
  }

  function switchToLogin() {
    document.getElementById('modal-signup-view').style.display='none'
    document.getElementById('modal-login-view').style.display='block'
    return false
  }
  function switchToSignup() {
    document.getElementById('modal-signup-view').style.display='block'
    document.getElementById('modal-login-view').style.display='none'
    return false
  }

  async function handleMagicLink(emailId) {
    const email = document.getElementById(emailId).value
    if (!email) { alert('Please enter your email.'); return }
    const { error } = await import('../lib/supabase').then(m => 
      m.supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + '/app' } })
    )
    if (error) alert('Error: ' + error.message)
    else alert('✅ Magic link sent to ' + email + '! Check your inbox.')
  }

  async function handleGoogleAuth() {
    const { supabase } = await import('../lib/supabase')
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/app' } })
  }

  return (
    <>
      <style>{`
        :root {
          --bg:#080c14;--surface:#0d1420;--surface2:#111927;
          --border:rgba(255,255,255,0.07);--border-bright:rgba(255,255,255,0.14);
          --blue:#2563eb;--blue-light:#3b82f6;--blue-glow:rgba(37,99,235,0.18);
          --green:#10b981;--green-glow:rgba(16,185,129,0.12);
          --yellow:#f59e0b;--red:#ef4444;
          --text:#f0f4ff;--text-2:#8b9fc0;--text-3:#4a5c7a;
          --mono:'DM Mono',monospace;--display:'Syne',sans-serif;--body:'DM Sans',sans-serif;
          --radius:10px;
        }
        .lp *,.lp *::before,.lp *::after{box-sizing:border-box;margin:0;padding:0}
        .lp{background:var(--bg);color:var(--text);font-family:var(--body);font-size:15px;line-height:1.6;overflow-x:hidden;min-height:100vh}
        .lp-noise{position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");pointer-events:none;z-index:0}
        .lp-grid{position:fixed;inset:0;background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;z-index:0;opacity:.5}
        nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 40px;height:64px;background:rgba(8,12,20,0.8);backdrop-filter:blur(16px);border-bottom:1px solid var(--border)}
        .nav-logo{display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:13px;letter-spacing:.14em;color:var(--text);text-decoration:none}
        .nav-logo .bolt{font-size:20px;filter:drop-shadow(0 0 8px rgba(37,99,235,0.8))}
        .nav-links{display:flex;align-items:center;gap:32px;list-style:none}
        .nav-links a{font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--text-2);text-decoration:none;text-transform:uppercase;transition:color .2s;cursor:pointer}
        .nav-links a:hover{color:var(--text)}
        .nav-cta{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:8px 20px;background:var(--blue);color:white;border:none;border-radius:6px;cursor:pointer;text-decoration:none;transition:background .2s,box-shadow .2s}
        .nav-cta:hover{background:var(--blue-light);box-shadow:0 0 20px rgba(37,99,235,0.4)}
        .hero{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:120px 40px 80px;text-align:center;z-index:1}
        .hero-glow{position:absolute;top:20%;left:50%;transform:translate(-50%,-50%);width:600px;height:600px;background:radial-gradient(circle,rgba(37,99,235,0.15) 0%,transparent 70%);pointer-events:none}
        .hero-tag{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--blue-light);background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.3);padding:6px 16px;border-radius:100px;margin-bottom:32px}
        .hero-tag .dot{width:6px;height:6px;background:var(--green);border-radius:50%;animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(16,185,129,0.4)}50%{opacity:.7;box-shadow:0 0 0 4px rgba(16,185,129,0)}}
        .hero h1{font-family:var(--display);font-size:clamp(48px,7vw,96px);font-weight:800;line-height:1.0;letter-spacing:-.02em;margin-bottom:28px;max-width:900px}
        .hero h1 .accent{background:linear-gradient(135deg,var(--blue-light),#60a5fa,var(--green));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .hero-sub{font-size:18px;color:var(--text-2);max-width:560px;margin-bottom:48px;font-weight:300;line-height:1.7}
        .hero-actions{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-bottom:64px}
        .btn-primary{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:14px 32px;background:var(--blue);color:white;border:none;border-radius:8px;cursor:pointer;transition:background .2s,box-shadow .2s,transform .15s}
        .btn-primary:hover{background:var(--blue-light);box-shadow:0 0 32px rgba(37,99,235,0.5);transform:translateY(-1px)}
        .btn-outline{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:14px 32px;background:transparent;color:var(--text);border:1px solid var(--border-bright);border-radius:8px;cursor:pointer;transition:border-color .2s,background .2s}
        .btn-outline:hover{border-color:rgba(255,255,255,0.3);background:rgba(255,255,255,0.04)}
        .hero-stats{display:flex;gap:48px;justify-content:center;flex-wrap:wrap}
        .stat-item{text-align:center}
        .stat-value{font-family:var(--display);font-size:32px;font-weight:800;color:var(--text);margin-bottom:4px}
        .stat-label{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3)}
        .container{max-width:1100px;margin:0 auto;padding:0 40px}
        section{position:relative;z-index:1;padding:100px 0}
        .section-tag{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--blue-light);background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.25);padding:5px 14px;border-radius:100px;margin-bottom:20px}
        .section-title{font-family:var(--display);font-size:clamp(32px,4vw,52px);font-weight:800;letter-spacing:-.02em;line-height:1.1}
        .section-sub{color:var(--text-2);font-size:17px;font-weight:300;line-height:1.7;max-width:560px;margin-top:16px}
        .live-demo{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-top:48px}
        .demo-bar{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border);background:var(--surface2)}
        .demo-dots{display:flex;gap:6px}
        .demo-dots span{width:10px;height:10px;border-radius:50%}
        .demo-dots .red{background:#ef4444}.demo-dots .yellow{background:#f59e0b}.demo-dots .green{background:#10b981}
        .demo-title{font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--text-3);text-transform:uppercase}
        .demo-live{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10px;color:var(--green)}
        .demo-live::before{content:'';width:6px;height:6px;background:var(--green);border-radius:50%;animation:pulse 2s infinite}
        .demo-content{padding:24px 20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
        .demo-card{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:16px}
        .demo-card-label{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px}
        .demo-card-value{font-family:var(--mono);font-size:22px;font-weight:500;color:var(--text);margin-bottom:4px}
        .demo-card-change{font-family:var(--mono);font-size:11px}
        .up{color:var(--green)}.dn{color:var(--red)}
        .signal-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)}
        .signal-row:last-child{border-bottom:none}
        .signal-ticker{font-family:var(--mono);font-size:13px;font-weight:500;color:var(--text)}
        .signal-action{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:3px 10px;border-radius:4px}
        .signal-action.buy{background:rgba(16,185,129,0.15);color:var(--green)}
        .signal-action.sell{background:rgba(239,68,68,0.15);color:var(--red)}
        .signal-score{font-family:var(--mono);font-size:13px;color:var(--text-2)}
        .features-section .section-title{margin-bottom:48px}
        .features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
        .feature-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;transition:border-color .2s,transform .2s}
        .feature-card:hover{border-color:var(--border-bright);transform:translateY(-2px)}
        .feature-icon{font-size:28px;margin-bottom:16px;display:block}
        .feature-title{font-family:var(--display);font-size:18px;font-weight:700;margin-bottom:8px}
        .feature-desc{font-size:14px;color:var(--text-2);line-height:1.7}
        .pricing{background:var(--surface)}
        .pricing-header{text-align:center;margin-bottom:48px}
        .pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
        .pricing-card{background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:32px;position:relative}
        .pricing-card.featured{border-color:var(--blue);background:linear-gradient(135deg,rgba(37,99,235,0.1),var(--bg))}
        .pricing-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;background:var(--blue);color:white;padding:4px 16px;border-radius:100px}
        .pricing-tier{font-family:var(--mono);font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-2);margin-bottom:12px}
        .pricing-price{font-family:var(--display);font-size:52px;font-weight:800;color:var(--text);line-height:1}
        .pricing-price sup{font-size:24px;vertical-align:top;margin-top:8px}
        .pricing-period{font-family:var(--mono);font-size:11px;color:var(--text-3);margin-bottom:20px}
        .pricing-divider{height:1px;background:var(--border);margin:20px 0}
        .pricing-features{list-style:none;margin-bottom:28px}
        .pricing-features li{font-size:14px;color:var(--text-2);padding:6px 0;padding-left:20px;position:relative}
        .pricing-features li::before{content:'✓';position:absolute;left:0;color:var(--green);font-size:12px}
        .pricing-btn{display:block;text-align:center;font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:14px;border-radius:8px;cursor:pointer;transition:all .2s;border:none;width:100%}
        .pricing-btn.primary{background:var(--blue);color:white}
        .pricing-btn.primary:hover{background:var(--blue-light);box-shadow:0 0 24px rgba(37,99,235,0.4)}
        .pricing-btn.outline{background:transparent;color:var(--text);border:1px solid var(--border-bright)}
        .pricing-btn.outline:hover{border-color:rgba(255,255,255,0.3)}
        footer{position:relative;z-index:1;text-align:center;padding:60px 40px;border-top:1px solid var(--border)}
        .footer-logo{font-family:var(--mono);font-size:14px;letter-spacing:.2em;color:var(--text-2);margin-bottom:20px}
        .footer-links{display:flex;justify-content:center;gap:32px;margin-bottom:20px;list-style:none}
        .footer-links a{font-family:var(--mono);font-size:11px;color:var(--text-3);text-decoration:none;letter-spacing:.08em;text-transform:uppercase;transition:color .2s}
        .footer-links a:hover{color:var(--text-2)}
        .footer-copy{font-family:var(--mono);font-size:11px;color:var(--text-3)}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:1000;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s}
        .modal-overlay.active{opacity:1;pointer-events:all}
        .modal{background:var(--surface);border:1px solid var(--border-bright);border-radius:16px;padding:40px;width:100%;max-width:440px;position:relative;transform:translateY(16px);transition:transform .25s}
        .modal-overlay.active .modal{transform:translateY(0)}
        .modal-close{position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-3);font-size:18px;cursor:pointer;line-height:1;padding:4px 8px}
        .modal-close:hover{color:var(--text)}
        .modal-icon{font-size:32px;display:block;margin-bottom:16px}
        .modal-title{font-family:var(--display);font-size:28px;font-weight:800;margin-bottom:8px}
        .modal-sub{color:var(--text-2);font-size:14px;margin-bottom:24px}
        .plan-select{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
        .plan-option{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;cursor:pointer;text-align:center;transition:border-color .2s}
        .plan-option.selected{border-color:var(--blue);background:rgba(37,99,235,0.1)}
        .plan-option-name{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-2);margin-bottom:4px}
        .plan-option-price{font-family:var(--display);font-size:22px;font-weight:800;color:var(--text)}
        .plan-option-period{font-family:var(--mono);font-size:10px;color:var(--text-3)}
        .modal-input{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;color:var(--text);font-family:var(--body);font-size:14px;margin-bottom:12px;outline:none;transition:border-color .2s}
        .modal-input:focus{border-color:var(--blue)}
        .modal-input::placeholder{color:var(--text-3)}
        .modal-submit{width:100%;padding:14px;background:var(--blue);color:white;border:none;border-radius:8px;font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:background .2s,box-shadow .2s;margin-bottom:16px}
        .modal-submit:hover{background:var(--blue-light);box-shadow:0 0 24px rgba(37,99,235,0.4)}
        .modal-divider{text-align:center;color:var(--text-3);font-size:12px;margin:16px 0;position:relative}
        .modal-divider::before,.modal-divider::after{content:'';position:absolute;top:50%;width:42%;height:1px;background:var(--border)}
        .modal-divider::before{left:0}.modal-divider::after{right:0}
        .modal-google{width:100%;padding:13px;background:var(--surface2);color:var(--text);border:1px solid var(--border-bright);border-radius:8px;font-family:var(--body);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:border-color .2s,background .2s;margin-bottom:16px}
        .modal-google:hover{border-color:rgba(255,255,255,0.3);background:rgba(255,255,255,0.04)}
        .modal-legal{font-size:12px;color:var(--text-3);text-align:center;line-height:1.7}
        .modal-legal a{color:var(--blue-light);text-decoration:none}
      `}</style>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet" />

      <div className="lp">
        <div className="lp-noise" />
        <div className="lp-grid" />

        <nav>
          <a href="/" className="nav-logo"><span className="bolt">⚡</span> ANKUSHAI</a>
          <ul className="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#pricing">Pricing</a></li>
            <li><a onClick={() => openModal('login')}>Sign In</a></li>
          </ul>
          <a className="nav-cta" onClick={() => openModal('signup')}>Get Access →</a>
        </nav>

        <section className="hero">
          <div className="hero-glow" />
          <div className="hero-tag"><span className="dot" /> Live Trading Intelligence</div>
          <h1>Institutional edge,<br /><span className="accent">built for traders.</span></h1>
          <p className="hero-sub">Real-time signals, AI-powered thesis generation, and portfolio analytics — everything a serious trader needs, in one platform.</p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => openModal('signup')}>Start Free Trial →</button>
            <button className="btn-outline" onClick={() => openModal('login')}>Sign In</button>
          </div>
          <div className="hero-stats">
            <div className="stat-item"><div className="stat-value">847</div><div className="stat-label">Active Signals</div></div>
            <div className="stat-item"><div className="stat-value">94.2%</div><div className="stat-label">Signal Accuracy</div></div>
            <div className="stat-item"><div className="stat-value">12ms</div><div className="stat-label">Avg Latency</div></div>
            <div className="stat-item"><div className="stat-value">$2.4B</div><div className="stat-label">Volume Tracked</div></div>
          </div>
        </section>

        <section id="features" className="features-section" style={{position:'relative',zIndex:1,padding:'100px 0'}}>
          <div className="container">
            <div className="section-tag">Platform Features</div>
            <div className="section-title">Everything you need to trade smarter</div>
            <div className="section-sub">Built on institutional infrastructure, accessible to every serious trader.</div>
            <div className="features-grid" style={{marginTop:'48px'}}>
              {[
                {icon:'📡',title:'Live Signal Feed',desc:'Proprietary scoring engine analyzes 50+ technical and macro indicators. Every signal includes confidence score, entry/exit levels, and real-time P&L tracking.'},
                {icon:'🤖',title:'AI Thesis Generator',desc:'Describe any trade setup and get a structured investment thesis, risk/reward analysis, and historical analogues — powered by a fine-tuned financial model.'},
                {icon:'📊',title:'Portfolio Analytics',desc:'Real-time P&L tracking, drawdown analysis, sector exposure, and Sharpe ratio calculation across your entire portfolio.'},
                {icon:'📰',title:'Sentiment Intelligence',desc:'NLP analysis of 10,000+ news sources, earnings transcripts, and Fed communications. Real-time sentiment scores for every major ticker.'},
                {icon:'🔄',title:'Strategy Backtesting',desc:'Backtest any signal combination on 20+ years of tick data. Walk-forward optimization, Monte Carlo simulation, and slippage modeling.'},
                {icon:'▲',title:'Supabase Real-Time',desc:'Every table syncs live across all browser sessions instantly — no refresh needed. Built on institutional-grade Postgres infrastructure.'},
              ].map(f => (
                <div className="feature-card" key={f.title}>
                  <span className="feature-icon">{f.icon}</span>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pricing" id="pricing">
          <div className="container">
            <div className="pricing-header">
              <div className="section-tag">Pricing</div>
              <div className="section-title">Simple, transparent access</div>
              <div style={{color:'var(--text-2)',fontSize:'15px',marginTop:'12px',textAlign:'center'}}>Cancel anytime. No lock-in. Start with a free trial.</div>
            </div>
            <div className="pricing-grid">
              <div className="pricing-card">
                <div className="pricing-tier">Starter</div>
                <div className="pricing-price"><sup>$</sup>29</div>
                <div className="pricing-period">per month</div>
                <div className="pricing-divider" />
                <ul className="pricing-features">
                  {['Signal feed (50 signals/day)','Portfolio tracker','News sentiment','Basic backtesting','Trade journal','Email support'].map(i=><li key={i}>{i}</li>)}
                </ul>
                <button className="pricing-btn outline" onClick={()=>openModal('signup')}>Get Started →</button>
              </div>
              <div className="pricing-card featured">
                <div className="pricing-badge">Most Popular</div>
                <div className="pricing-tier">Pro</div>
                <div className="pricing-price"><sup>$</sup>99</div>
                <div className="pricing-period">per month</div>
                <div className="pricing-divider" />
                <ul className="pricing-features">
                  {['Unlimited signals','AI Thesis Generator (unlimited)','AI Journal Pattern Coach','Advanced backtesting','Price charts + EMA/RSI','Macro calendar','Real-time alerts','Priority support'].map(i=><li key={i}>{i}</li>)}
                </ul>
                <button className="pricing-btn primary" onClick={()=>openModal('signup')}>Start Free Trial →</button>
              </div>
              <div className="pricing-card">
                <div className="pricing-tier">Enterprise</div>
                <div className="pricing-price" style={{fontSize:'38px'}}>Custom</div>
                <div className="pricing-period">annual contract</div>
                <div className="pricing-divider" />
                <ul className="pricing-features">
                  {['Everything in Pro','Multi-user seats','API access','Custom signal engines','Dedicated infrastructure','SLA + white-glove onboarding'].map(i=><li key={i}>{i}</li>)}
                </ul>
                <button className="pricing-btn outline">Contact Sales →</button>
              </div>
            </div>
          </div>
        </section>

        <footer>
          <div className="footer-logo">⚡ ANKUSHAI</div>
          <div className="footer-links">
            <a href="#">Privacy</a><a href="#">Terms</a><a href="#">Support</a>
          </div>
          <div className="footer-copy">© 2026 AnkushAI. All rights reserved.</div>
        </footer>

        {/* MODAL */}
        <div className="modal-overlay" id="modal" onClick={closeModalOutside}>
          <div className="modal">
            <button className="modal-close" onClick={closeModal}>✕</button>
            <span className="modal-icon">⚡</span>
            <div id="modal-signup-view">
              <div className="modal-title">Get Access</div>
              <div className="modal-sub">Start your 7-day free trial. No credit card required.</div>
              <div className="plan-select">
                <div className="plan-option selected" onClick={e=>selectPlan(e.currentTarget,'pro')}>
                  <div className="plan-option-name">Pro</div>
                  <div className="plan-option-price">$99</div>
                  <div className="plan-option-period">/month</div>
                </div>
                <div className="plan-option" onClick={e=>selectPlan(e.currentTarget,'starter')}>
                  <div className="plan-option-name">Starter</div>
                  <div className="plan-option-price">$29</div>
                  <div className="plan-option-period">/month</div>
                </div>
              </div>
              <input className="modal-input" type="email" placeholder="Email address" id="modal-email" />
              <button className="modal-submit" onClick={()=>handleMagicLink('modal-email')}>Send Magic Link →</button>
              <div className="modal-divider">or</div>
              <button className="modal-google" onClick={handleGoogleAuth}>
                <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.07 0-3.83-1.4-4.46-3.27H1.85v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.52 10.54A4.8 4.8 0 0 1 4.27 9c0-.53.09-1.05.25-1.54V5.39H1.85A8 8 0 0 0 .98 9c0 1.29.31 2.51.87 3.61l2.67-2.07z"/><path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.13 4.39l2.67 2.07c.63-1.87 2.4-3.27 4.46-3.27z"/></svg>
                Continue with Google
              </button>
              <div className="modal-legal">
                By signing up you agree to our <a href="#" style={{color:'var(--blue-light)'}}>Terms of Service</a> and <a href="#" style={{color:'var(--blue-light)'}}>Privacy Policy</a>.<br/>
                Already have an account? <a href="#" style={{color:'var(--blue-light)'}} onClick={e=>{e.preventDefault();switchToLogin()}}>Sign in</a>
              </div>
            </div>
            <div id="modal-login-view" style={{display:'none'}}>
              <div className="modal-title">Welcome back</div>
              <div className="modal-sub">Sign in to your AnkushAI account.</div>
              <input className="modal-input" type="email" placeholder="Email address" id="modal-login-email" />
              <button className="modal-submit" onClick={()=>handleMagicLink('modal-login-email')}>Send Magic Link →</button>
              <div className="modal-divider">or</div>
              <button className="modal-google" onClick={handleGoogleAuth}>
                <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.07 0-3.83-1.4-4.46-3.27H1.85v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.52 10.54A4.8 4.8 0 0 1 4.27 9c0-.53.09-1.05.25-1.54V5.39H1.85A8 8 0 0 0 .98 9c0 1.29.31 2.51.87 3.61l2.67-2.07z"/><path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.13 4.39l2.67 2.07c.63-1.87 2.4-3.27 4.46-3.27z"/></svg>
                Continue with Google
              </button>
              <div className="modal-legal">
                Don't have an account? <a href="#" style={{color:'var(--blue-light)'}} onClick={e=>{e.preventDefault();switchToSignup()}}>Get access</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
