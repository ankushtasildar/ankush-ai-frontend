import { useAuth } from '../lib/auth'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const TICKER_DATA = [
  {s:'SPY',p:'648.57',c:'+0.42%',up:true},{s:'QQQ',p:'582.06',c:'-0.18%',up:false},
  {s:'NVDA',p:'875.32',c:'+2.14%',up:true},{s:'AAPL',p:'189.45',c:'+0.67%',up:true},
  {s:'TSLA',p:'241.88',c:'-1.23%',up:false},{s:'MSFT',p:'415.20',c:'+0.88%',up:true},
  {s:'META',p:'528.76',c:'+1.45%',up:true},{s:'AMZN',p:'187.34',c:'-0.31%',up:false},
  {s:'GOOGL',p:'172.18',c:'+0.55%',up:true},{s:'VIX',p:'26.78',c:'+8.2%',up:false},
]

const HEADLINES = [
  'Institutional edge,\nbuilt for traders.',
  'Real-time signals,\npowered by AI.',
  'Thesis generation\nin seconds.',
]

const FEATURES = [
  {icon:'⚡',title:'Alpha Intelligence',desc:'AI thesis generation with institutional-grade leading indicators. VIX term structure, credit spreads, VWAP anchors — signals that move before price does.'},
  {icon:'📡',title:'Live Signal Feed',desc:'100+ analyst frameworks scanning 60+ symbols continuously. Every setup includes entry zones, targets, stop loss, and R/R ratio grounded to real-time prices.'},
  {icon:'📊',title:'Portfolio Analytics',desc:'Real-time P&L tracking, drawdown analysis, sector exposure and win rate calculation across your full portfolio history.'},
  {icon:'📰',title:'Sentiment Intelligence',desc:'NLP analysis across news, earnings transcripts, and macro events. Segmented sentiment for today, 7d, 30d, 90d — no more noise.'},
  {icon:'🔄',title:'Strategy Backtesting',desc:'Backtest any signal combination against historical data. Walk-forward optimization and Monte Carlo simulation built in.'},
  {icon:'🧠',title:'ML Training Engine',desc:'Every prediction resolves against real outcomes. The system learns what works, weights patterns higher, and gets sharper over time.'},
]

function ParticleCanvas() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W = canvas.width = window.innerWidth
    let H = canvas.height = window.innerHeight
    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight }
    window.addEventListener('resize', onResize)
    const N = 60
    const pts = Array.from({length:N}, () => ({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*.3, vy: (Math.random()-.5)*.3,
      r: Math.random()*1.5+.5
    }))
    let raf
    const draw = () => {
      ctx.clearRect(0,0,W,H)
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if(p.x<0||p.x>W) p.vx*=-1
        if(p.y<0||p.y>H) p.vy*=-1
        ctx.beginPath()
        ctx.arc(p.x,p.y,p.r,0,Math.PI*2)
        ctx.fillStyle='rgba(59,130,246,0.5)'
        ctx.fill()
      })
      for(let i=0;i<N;i++) for(let j=i+1;j<N;j++) {
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y
        const d=Math.sqrt(dx*dx+dy*dy)
        if(d<140) {
          ctx.beginPath()
          ctx.moveTo(pts[i].x,pts[i].y)
          ctx.lineTo(pts[j].x,pts[j].y)
          ctx.strokeStyle=`rgba(59,130,246,${.12*(1-d/140)})`
          ctx.lineWidth=.6
          ctx.stroke()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])
  return <canvas ref={ref} style={{position:'fixed',inset:0,zIndex:0,pointerEvents:'none'}} />
}

function useCountUp(target, duration=2000, trigger=false) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!trigger) return
    let start = null
    const step = ts => {
      if (!start) start = ts
      const p = Math.min((ts-start)/duration,1)
      const ease = 1-Math.pow(1-p,3)
      setVal(Math.floor(ease*target))
      if (p<1) requestAnimationFrame(step)
      else setVal(target)
    }
    requestAnimationFrame(step)
  }, [trigger, target, duration])
  return val
}

function useTypewriter(lines, speed=60, pause=2200) {
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState('typing')
  useEffect(() => {
    const line = lines[idx]
    if (phase==='typing') {
      if (text.length<line.length) {
        const t=setTimeout(()=>setText(line.slice(0,text.length+1)),speed)
        return ()=>clearTimeout(t)
      } else { const t=setTimeout(()=>setPhase('pausing'),pause); return ()=>clearTimeout(t) }
    }
    if (phase==='pausing') { const t=setTimeout(()=>setPhase('erasing'),300); return ()=>clearTimeout(t) }
    if (phase==='erasing') {
      if (text.length>0) { const t=setTimeout(()=>setText(t=>t.slice(0,-1)),30); return ()=>clearTimeout(t) }
      else { setIdx(i=>(i+1)%lines.length); setPhase('typing') }
    }
  }, [text, phase, idx, lines, speed, pause])
  return text
}

function useInView(ref, threshold=0.15) {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if(e.isIntersecting) setInView(true) }, {threshold})
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [ref, threshold])
  return inView
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" style={{flexShrink:0}}>
    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.07 0-3.83-1.4-4.46-3.27H1.85v2.07A8 8 0 0 0 8.98 17z"/>
    <path fill="#FBBC05" d="M4.52 10.54A4.8 4.8 0 0 1 4.27 9c0-.53.09-1.05.25-1.54V5.39H1.85A8 8 0 0 0 .98 9c0 1.29.31 2.51.87 3.61l2.67-2.07z"/>
    <path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.13 4.39l2.67 2.07c.63-1.87 2.4-3.27 4.46-3.27z"/>
  </svg>
)

export default function LandingPage() {
  const { user, signInWithGoogle, signInWithMagicLink } = useAuth()
  const navigate = useNavigate()
  const [modal, setModal] = useState(false)
  const [modalView, setModalView] = useState('signin')
  const [email, setEmail] = useState('')
  const [gLoading, setGLoading] = useState(false)
  const [mLoading, setMLoading] = useState(false)
  const [error, setError] = useState('')
  const [statsVisible, setStatsVisible] = useState(false)
  const [mousePos, setMousePos] = useState({x:0,y:0})
  const heroRef = useRef(null)
  const featRef = useRef(null)
  const emailRef = useRef(null)

  const headline = useTypewriter(HEADLINES)
  const statSignals = useCountUp(847, 1800, statsVisible)
  const statAccuracy = useCountUp(942, 2000, statsVisible)
  const statVolume = useCountUp(24, 1600, statsVisible)
  const statLatency = useCountUp(12, 1400, statsVisible)
  const featInView = useInView(featRef)

  useEffect(() => { if(user) navigate('/app/overview',{replace:true}) }, [user,navigate])
  useEffect(() => { if(modal && emailRef.current) setTimeout(()=>emailRef.current?.focus(),60) }, [modal])

  // Stats trigger on scroll
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if(e.isIntersecting) setStatsVisible(true) },{threshold:0.3})
    if(heroRef.current) obs.observe(heroRef.current)
    return ()=>obs.disconnect()
  },[])

  // Magnetic button
  const handleMouseMove = useCallback((e) => {
    setMousePos({x:e.clientX, y:e.clientY})
  },[])

  const openModal = () => { setModal(true); setModalView('signin'); setEmail(''); setError('') }
  const closeModal = () => { if(gLoading||mLoading) return; setModal(false) }

  async function handleGoogle() {
    setError(''); setGLoading(true)
    try { await signInWithGoogle() } catch(e) { setGLoading(false); setError(e.message||'Google sign in failed') }
  }

  async function handleEmail(e) {
    e?.preventDefault()
    const t = email.trim().toLowerCase()
    if(!t) { setError('Enter your email'); return }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) { setError('Enter a valid email'); return }
    setError(''); setMLoading(true)
    try {
      const {error:err} = await supabase.auth.signInWithOtp({
        email:t, options:{shouldCreateUser:false, emailRedirectTo:window.location.origin+'/auth/callback'}
      })
      if(err) {
        const msg = err.message?.toLowerCase()||''
        if(msg.includes('not found')||err.status===422) { setError('No account found. Sign up with Google.'); setMLoading(false); return }
        if(msg.includes('google')||msg.includes('oauth')) { setMLoading(false); setModalView('google_redirect'); return }
        throw err
      }
      setMLoading(false); setModalView('magic_sent')
    } catch(e) {
      setMLoading(false)
      const msg=(e.message||'').toLowerCase()
      if(msg.includes('google')||msg.includes('oauth')) { setModalView('google_redirect'); return }
      setError(e.message||'Failed. Try again.')
    }
  }

  const tickerDbl = [...TICKER_DATA,...TICKER_DATA]

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth}
        body{background:#060a12;color:#f0f4ff;font-family:'DM Sans',sans-serif;overflow-x:hidden}

        /* Ticker */
        .ticker-wrap{overflow:hidden;background:rgba(8,12,20,0.9);border-bottom:1px solid rgba(255,255,255,0.06);padding:10px 0;position:fixed;top:0;left:0;right:0;z-index:200}
        .ticker-inner{display:flex;gap:40px;animation:tickerScroll 40s linear infinite;white-space:nowrap;width:max-content}
        @keyframes tickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .ticker-item{display:inline-flex;align-items:center;gap:8px;font-family:'DM Mono',monospace;font-size:11px}
        .t-sym{color:#8b9fc0;letter-spacing:.06em}
        .t-price{color:#f0f4ff;font-weight:500}
        .t-chg.up{color:#10b981}.t-chg.dn{color:#ef4444}

        /* Nav */
        nav{position:fixed;top:41px;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 48px;height:64px;background:rgba(6,10,18,0.75);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.05)}
        .nav-logo{font-family:'DM Mono',monospace;font-size:14px;letter-spacing:.16em;color:#f0f4ff;text-decoration:none;font-weight:600;display:flex;align-items:center;gap:8px}
        .logo-dot{width:8px;height:8px;background:#10b981;border-radius:50%;animation:logoPulse 2s infinite;box-shadow:0 0 8px rgba(16,185,129,0.6)}
        @keyframes logoPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.7}}
        .nav-links{display:flex;align-items:center;gap:32px;list-style:none}
        .nav-links a{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.1em;color:#8b9fc0;text-decoration:none;text-transform:uppercase;transition:color .2s;cursor:pointer}
        .nav-links a:hover{color:#f0f4ff}
        .nav-cta{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:9px 22px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;border:none;border-radius:7px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
        .nav-cta::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.12),transparent);opacity:0;transition:opacity .2s}
        .nav-cta:hover::before{opacity:1}
        .nav-cta:hover{box-shadow:0 0 24px rgba(37,99,235,0.5);transform:translateY(-1px)}

        /* Hero */
        .hero{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:180px 48px 100px;text-align:center;z-index:1}
        .hero-glow-1{position:absolute;top:10%;left:30%;width:600px;height:600px;background:radial-gradient(circle,rgba(37,99,235,0.1) 0%,transparent 70%);pointer-events:none;animation:glowFloat1 8s ease-in-out infinite}
        .hero-glow-2{position:absolute;bottom:20%;right:20%;width:400px;height:400px;background:radial-gradient(circle,rgba(16,185,129,0.07) 0%,transparent 70%);pointer-events:none;animation:glowFloat2 10s ease-in-out infinite}
        @keyframes glowFloat1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-30px,20px) scale(1.1)}}
        @keyframes glowFloat2{0%,100%{transform:translate(0,0)}50%{transform:translate(20px,-30px)}}
        .hero-tag{display:inline-flex;align-items:center;gap:8px;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#3b82f6;background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.25);padding:7px 18px;border-radius:100px;margin-bottom:36px;animation:fadeSlideDown .6s ease both}
        .blink{animation:blink .8s step-end infinite}.active-dot{width:6px;height:6px;background:#10b981;border-radius:50%}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes fadeSlideDown{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
        h1{font-family:'Syne',sans-serif;font-size:clamp(48px,6.5vw,92px);font-weight:800;line-height:1.02;letter-spacing:-.03em;margin-bottom:28px;min-height:2.2em;animation:fadeSlideUp .7s ease .2s both;white-space:pre-line}
        .cursor{display:inline-block;width:3px;height:.85em;background:#3b82f6;margin-left:3px;vertical-align:-.05em;animation:cursorBlink .7s step-end infinite}
        @keyframes cursorBlink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes fadeSlideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        .accent{background:linear-gradient(135deg,#3b82f6 0%,#60a5fa 50%,#10b981 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .hero-sub{font-size:18px;color:#8b9fc0;max-width:540px;margin-bottom:52px;font-weight:300;line-height:1.8;animation:fadeSlideUp .7s ease .4s both}

        /* CTA */
        .cta-wrap{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-bottom:80px;animation:fadeSlideUp .7s ease .5s both}
        .btn-primary{position:relative;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:15px 36px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;border:none;border-radius:9px;cursor:pointer;transition:all .25s;overflow:hidden}
        .btn-primary::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.12),transparent);opacity:0;transition:opacity .2s}
        .btn-primary:hover::after{opacity:1}
        .btn-primary:hover{box-shadow:0 0 40px rgba(37,99,235,.6);transform:translateY(-2px) scale(1.02)}
        .btn-secondary{font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:15px 36px;background:rgba(255,255,255,0.04);color:#f0f4ff;border:1px solid rgba(255,255,255,.12);border-radius:9px;cursor:pointer;transition:all .2s}
        .btn-secondary:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.25);transform:translateY(-1px)}

        /* Stats */
        .stats-row{display:flex;gap:56px;justify-content:center;flex-wrap:wrap;animation:fadeSlideUp .7s ease .6s both}
        .stat-val{font-family:'Syne',sans-serif;font-size:36px;font-weight:800;color:#f0f4ff;margin-bottom:4px;line-height:1}
        .stat-label{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#4a5c7a}

        /* Beam sweep */
        .beam{position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(59,130,246,0.04),transparent);animation:beamSweep 6s ease-in-out infinite;pointer-events:none}
        @keyframes beamSweep{0%{left:-50%}100%{left:150%}}

        /* Features */
        section{position:relative;z-index:1;padding:100px 0}
        .container{max-width:1140px;margin:0 auto;padding:0 48px}
        .sec-label{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#3b82f6;margin-bottom:16px}
        .sec-title{font-family:'Syne',sans-serif;font-size:clamp(32px,4vw,50px);font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-bottom:16px}
        .sec-sub{color:#8b9fc0;font-size:17px;font-weight:300;line-height:1.75;max-width:520px}
        .feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:56px}
        .feat-card{background:rgba(13,20,32,0.8);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:32px;transition:all .3s;position:relative;overflow:hidden;backdrop-filter:blur(8px)}
        .feat-card::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(59,130,246,0.05),transparent);opacity:0;transition:opacity .3s}
        .feat-card:hover{border-color:rgba(59,130,246,0.3);transform:translateY(-4px);box-shadow:0 20px 40px rgba(0,0,0,0.3),0 0 0 1px rgba(59,130,246,0.1)}
        .feat-card:hover::before{opacity:1}
        .feat-icon{font-size:32px;margin-bottom:18px;display:block}
        .feat-title{font-family:'Syne',sans-serif;font-size:19px;font-weight:700;margin-bottom:10px;color:#f0f4ff}
        .feat-desc{font-size:14px;color:#6b7a90;line-height:1.75}
        .fade-in{opacity:0;transform:translateY(32px);transition:opacity .6s ease,transform .6s ease}
        .fade-in.visible{opacity:1;transform:translateY(0)}

        /* Pricing */
        .pricing-sec{background:linear-gradient(180deg,#060a12 0%,#080c14 100%)}
        .pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:20px;margin-top:56px}
        .price-card{background:rgba(8,12,20,0.9);border:1px solid rgba(255,255,255,0.07);border-radius:18px;padding:36px;position:relative;transition:all .3s;backdrop-filter:blur(12px)}
        .price-card:hover{border-color:rgba(255,255,255,0.15);transform:translateY(-3px)}
        .price-card.featured{border-color:rgba(37,99,235,0.4);background:linear-gradient(135deg,rgba(37,99,235,0.06),rgba(8,12,20,0.95));box-shadow:0 0 60px rgba(37,99,235,0.1)}
        .price-badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:5px 18px;border-radius:100px}
        .price-tier{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#8b9fc0;margin-bottom:14px}
        .price-amount{font-family:'Syne',sans-serif;font-size:56px;font-weight:800;color:#f0f4ff;line-height:1}
        .price-amount sup{font-size:24px;vertical-align:top;margin-top:10px}
        .price-period{font-family:'DM Mono',monospace;font-size:11px;color:#4a5c7a;margin-bottom:24px}
        .price-divider{height:1px;background:rgba(255,255,255,0.06);margin:24px 0}
        .price-feats{list-style:none;margin-bottom:32px}
        .price-feats li{font-size:14px;color:#8b9fc0;padding:7px 0 7px 24px;position:relative;line-height:1.5}
        .price-feats li::before{content:'+';position:absolute;left:0;color:#10b981;font-size:13px;font-weight:700}
        .price-btn{display:block;text-align:center;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:15px;border-radius:10px;cursor:pointer;transition:all .2s;border:none;width:100%}
        .price-btn.pri{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white}
        .price-btn.pri:hover{box-shadow:0 0 28px rgba(37,99,235,0.5);transform:translateY(-1px)}
        .price-btn.out{background:rgba(255,255,255,0.04);color:#f0f4ff;border:1px solid rgba(255,255,255,.12)}
        .price-btn.out:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.25)}
        .strike{text-decoration:line-through;opacity:.35;font-size:.7em;margin-right:4px}

        /* Footer */
        footer{position:relative;z-index:1;text-align:center;padding:64px 48px;border-top:1px solid rgba(255,255,255,0.05)}
        .foot-logo{font-family:'DM Mono',monospace;font-size:15px;letter-spacing:.22em;color:#4a5c7a;margin-bottom:24px}
        .foot-links{display:flex;justify-content:center;gap:32px;margin-bottom:20px;list-style:none}
        .foot-links a{font-family:'DM Mono',monospace;font-size:11px;color:#2d3d50;text-decoration:none;letter-spacing:.08em;text-transform:uppercase;transition:color .2s}
        .foot-links a:hover{color:#8b9fc0}
        .foot-copy{font-family:'DM Mono',monospace;font-size:11px;color:#2d3d50}

        /* Modal */
        .auth-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(16px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .15s ease}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .auth-modal{background:rgba(11,17,27,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:22px;padding:44px;width:100%;max-width:420px;position:relative;animation:slideUp .22s ease;box-shadow:0 40px 80px rgba(0,0,0,0.6)}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .auth-close{position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.06);border:none;color:#8b9fc0;width:34px;height:34px;border-radius:9px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .auth-close:hover{background:rgba(255,255,255,.1);color:#f0f4ff}
        .auth-title{font-family:'Syne',sans-serif;font-size:27px;font-weight:800;margin-bottom:6px;color:#f0f4ff}
        .auth-sub{color:#8b9fc0;font-size:14px;margin-bottom:30px;line-height:1.5}
        .auth-google{width:100%;padding:14px 16px;background:#fff;color:#1a1a1a;border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:all .15s;margin-bottom:20px}
        .auth-google:hover:not(:disabled){background:#f5f5f5;box-shadow:0 6px 24px rgba(0,0,0,0.35);transform:translateY(-1px)}
        .auth-google:disabled{opacity:0.6;cursor:not-allowed}
        .auth-divider{display:flex;align-items:center;gap:12px;margin-bottom:20px;color:#4a5c7a;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.05em}
        .auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,0.07)}
        .auth-input{width:100%;background:#0d1520;border:1.5px solid rgba(255,255,255,0.08);border-radius:11px;padding:14px 16px;color:#f0f4ff;font-family:'DM Sans',sans-serif;font-size:15px;outline:none;transition:border-color .15s;margin-bottom:12px}
        .auth-input:focus{border-color:#2563eb}
        .auth-input::placeholder{color:#4a5c7a}
        .auth-submit{width:100%;padding:14px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;border:none;border-radius:11px;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .15s;margin-bottom:20px;display:flex;align-items:center;justify-content:center;gap:8px}
        .auth-submit:hover:not(:disabled){box-shadow:0 6px 24px rgba(37,99,235,0.45);transform:translateY(-1px)}
        .auth-submit:disabled{opacity:0.6;cursor:not-allowed}
        .auth-error{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:9px;padding:11px 14px;color:#fca5a5;font-size:13px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
        .auth-legal{font-size:12px;color:#4a5c7a;text-align:center;line-height:1.8}
        .auth-legal a{color:#3b82f6;cursor:pointer;text-decoration:none}
        .auth-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin .6s linear infinite;flex-shrink:0}
        @keyframes spin{to{transform:rotate(360deg)}}
        .auth-sent-icon{font-size:52px;display:block;text-align:center;margin-bottom:20px}
        .auth-sent-title{font-family:'Syne',sans-serif;font-size:24px;font-weight:800;text-align:center;margin-bottom:10px}
        .auth-sent-body{color:#8b9fc0;font-size:14px;text-align:center;line-height:1.75;margin-bottom:26px}
        .google-nudge{background:rgba(37,99,235,0.07);border:1px solid rgba(37,99,235,0.2);border-radius:14px;padding:26px;text-align:center;margin-bottom:18px}
        .google-nudge-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#f0f4ff;margin-bottom:8px}
        .google-nudge-body{color:#8b9fc0;font-size:13px;line-height:1.65}

        @media(max-width:640px){
          nav{padding:0 20px}
          .hero{padding:140px 20px 80px}
          .container{padding:0 20px}
          h1{font-size:clamp(36px,11vw,60px)}
          .hero-sub{font-size:16px}
          .stats-row{gap:28px}
          .btn-primary,.btn-secondary{padding:12px 22px;font-size:11px}
        }
      `}</style>

      <ParticleCanvas />

      {/* Live Ticker */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {tickerDbl.map((t,i) => (
            <span key={i} className="ticker-item">
              <span className="t-sym">{t.s}</span>
              <span className="t-price">{t.p}</span>
              <span className={`t-chg ${t.up?'up':'dn'}`}>{t.c}</span>
              <span style={{color:'#1e2a3a',marginLeft:8}}>|</span>
            </span>
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav>
        <a href="/" className="nav-logo">
          <span className="logo-dot" />
          ANKUSHAI
        </a>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a onClick={openModal}>Sign In</a></li>
        </ul>
        <button className="nav-cta" onClick={openModal}>Get Access →</button>
      </nav>

      {/* Hero */}
      <div className="hero" ref={heroRef} onMouseMove={handleMouseMove}>
        <div className="beam" />
        <div className="hero-glow-1" />
        <div className="hero-glow-2" />

        <div className="hero-tag">
          <span className="active-dot" />
          Live Trading Intelligence
          <span className="blink" style={{color:'#3b82f6'}}>_</span>
        </div>

        <h1>
          {headline.includes('\n')
            ? headline.split('\n').map((l,i) => <span key={i}>{i===0 ? l : <><br/><span className="accent">{l}</span></>}</span>)
            : <>{headline.split(' ').slice(0,-1).join(' ')} <span className="accent">{headline.split(' ').slice(-1)[0]}</span></>
          }
          <span className="cursor" />
        </h1>

        <p className="hero-sub">
          Real-time signals, AI-powered thesis generation, and ML that learns from every trade — everything a serious trader needs, sharpening itself every session.
        </p>

        <div className="cta-wrap">
          <button className="btn-primary" onClick={openModal}>
            Start Free Trial →
          </button>
          <button className="btn-secondary" onClick={openModal}>
            Sign In
          </button>
        </div>

        <div className="stats-row">
          {[
            [statSignals,'Active Signals',''],
            [statAccuracy/10,'Signal Accuracy','%'],
            [statVolume/10,'Volume Tracked','B'],
            [statLatency,'Avg Latency','ms'],
          ].map(([v,label,suffix]) => (
            <div key={label} style={{textAlign:'center'}}>
              <div className="stat-val">{typeof v==='number'?v.toFixed(suffix==='%'?1:0):v}{suffix}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="features" ref={featRef}>
        <div className="container">
          <div className="sec-label">Platform Features</div>
          <div className="sec-title">Built different.<br />Trades different.</div>
          <p className="sec-sub">Institutional signals at retail speed. Every feature compounds on the others.</p>
          <div className="feat-grid">
            {FEATURES.map((f,i) => (
              <div key={f.title}
                className={`feat-card fade-in ${featInView?'visible':''}`}
                style={{transitionDelay:`${i*80}ms`}}>
                <span className="feat-icon">{f.icon}</span>
                <div className="feat-title">{f.title}</div>
                <div className="feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="pricing-sec" id="pricing">
        <div className="container">
          <div style={{textAlign:'center',marginBottom:8}}>
            <div className="sec-label">Pricing</div>
            <div className="sec-title">Simple, transparent.</div>
            <p style={{color:'#8b9fc0',fontSize:'15px',marginTop:'12px'}}>Cancel anytime. No lock-in. Start with a free trial.</p>
          </div>
          <div className="pricing-grid">
            <div className="price-card">
              <div className="price-tier">Starter</div>
              <div className="price-amount"><sup>$</sup>0</div>
              <div className="price-period">free forever</div>
              <div className="price-divider" />
              <ul className="price-feats">
                {['3 AI scans per day','Top Setups (3 visible)','Portfolio tracker','Trade journal','News sentiment'].map(i=><li key={i}>{i}</li>)}
              </ul>
              <button className="price-btn out" onClick={openModal}>Get Started →</button>
            </div>
            <div className="price-card featured">
              <div className="price-badge">Most Popular</div>
              <div className="price-tier">Pro</div>
              <div className="price-amount"><span className="strike">$49</span><sup>$</sup>29</div>
              <div className="price-period">per month · 3-day free trial</div>
              <div className="price-divider" />
              <ul className="price-feats">
                {['Unlimited AI scans','All Top Setups unlocked','Alpha Intelligence (AI thesis)','AI Journal Coach','Advanced backtesting','ML Training Engine access','Macro calendar','Priority support'].map(i=><li key={i}>{i}</li>)}
              </ul>
              <button className="price-btn pri" onClick={openModal}>Start Free Trial →</button>
            </div>
            <div className="price-card">
              <div className="price-tier">Enterprise</div>
              <div className="price-amount" style={{fontSize:'40px'}}>Custom</div>
              <div className="price-period">annual contract</div>
              <div className="price-divider" />
              <ul className="price-feats">
                {['Everything in Pro','Multi-user seats','API access','Custom signal engines','Dedicated infrastructure','SLA + white-glove onboarding'].map(i=><li key={i}>{i}</li>)}
              </ul>
              <a href="mailto:ankushtasildar2@gmail.com" className="price-btn out" style={{textDecoration:'none',display:'block'}}>Contact Sales →</a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="foot-logo">⚡ ANKUSHAI</div>
        <ul className="foot-links">
          <li><a href="#">Privacy</a></li>
          <li><a href="#">Terms</a></li>
          <li><a href="#">Support</a></li>
        </ul>
        <div className="foot-copy">© 2026 AnkushAI. All rights reserved.</div>
      </footer>

      {/* Auth Modal */}
      {modal && (
        <div className="auth-overlay" onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div className="auth-modal">
            <button className="auth-close" onClick={closeModal}>✕</button>

            {modalView==='google_redirect' ? (
              <>
                <div className="google-nudge">
                  <div style={{fontSize:36,marginBottom:12}}>🔗</div>
                  <div className="google-nudge-title">You have a Google account</div>
                  <div className="google-nudge-body"><strong style={{color:'#f0f4ff'}}>{email}</strong> is linked to Google. Sign in with Google to continue.</div>
                </div>
                <button className={`auth-google${gLoading?' loading':''}`} onClick={handleGoogle} disabled={gLoading}>
                  {gLoading?<><div className="auth-spinner" style={{borderTopColor:'#1a1a1a',borderColor:'rgba(0,0,0,0.2)'}} />Redirecting...</>:<><GoogleIcon />Continue with Google</>}
                </button>
                <button className="auth-submit" onClick={()=>{setModalView('signin');setError('')}} style={{background:'rgba(255,255,255,0.05)',color:'#8b9fc0',border:'1px solid rgba(255,255,255,0.08)'}}>← Use a different email</button>
              </>
            ) : modalView==='magic_sent' ? (
              <>
                <span className="auth-sent-icon">📬</span>
                <div className="auth-sent-title">Check your email</div>
                <div className="auth-sent-body">We sent a sign in link to <strong style={{color:'#f0f4ff'}}>{email}</strong>. Click the link to sign in — it expires in 10 minutes.</div>
                <button className="auth-submit" onClick={()=>{setModalView('signin');setEmail('');setError('')}} style={{background:'rgba(255,255,255,0.05)',color:'#f0f4ff',border:'1px solid rgba(255,255,255,0.1)'}}>← Use a different email</button>
                <div className="auth-legal">Didn't get it? Check spam, or <a onClick={handleEmail}>resend</a>.</div>
              </>
            ) : (
              <>
                <div className="auth-title">Sign in to AnkushAI</div>
                <div className="auth-sub">3-day free trial. No credit card required.</div>
                <button className={`auth-google${gLoading?' loading':''}`} onClick={handleGoogle} disabled={gLoading||mLoading}>
                  {gLoading?<><div className="auth-spinner" style={{borderTopColor:'#1a1a1a',borderColor:'rgba(0,0,0,0.2)'}} />Redirecting to Google...</>:<><GoogleIcon />Continue with Google</>}
                </button>
                <div className="auth-divider">or sign in with email</div>
                {error&&<div className="auth-error"><span>⚠</span>{error}</div>}
                <form onSubmit={handleEmail} noValidate>
                  <input ref={emailRef} className="auth-input" type="email" placeholder="you@example.com"
                    value={email} onChange={e=>{setEmail(e.target.value);setError('')}}
                    disabled={gLoading||mLoading} autoComplete="email" autoCapitalize="none" />
                  <button type="submit" className="auth-submit" disabled={gLoading||mLoading}>
                    {mLoading?<><div className="auth-spinner"/>Sending...</>:'Continue with email →'}
                  </button>
                </form>
                <div className="auth-legal">By continuing you agree to our <a href="#">Terms</a> and <a href="#">Privacy</a>.</div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}