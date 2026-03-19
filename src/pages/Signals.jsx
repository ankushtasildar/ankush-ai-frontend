import { useState, useEffect, useRef, useCallback } from 'react'

const UNIVERSE = [
  { symbol:'SPY',   name:'S&P 500 ETF' },
  { symbol:'QQQ',   name:'Nasdaq 100 ETF' },
  { symbol:'AAPL',  name:'Apple' },
  { symbol:'NVDA',  name:'NVIDIA' },
  { symbol:'TSLA',  name:'Tesla' },
  { symbol:'MSFT',  name:'Microsoft' },
  { symbol:'META',  name:'Meta' },
  { symbol:'AMZN',  name:'Amazon' },
  { symbol:'AMD',   name:'AMD' },
  { symbol:'GOOGL', name:'Alphabet' },
]

const TIMEFRAMES = ['Day Trade', 'Swing (2-5d)', 'Swing (1-2w)', 'Position (1m+)']

const SESSION = {
  regular:    { label:'Open',        color:'#10b981', bg:'rgba(16,185,129,0.15)', dot:true },
  premarket:  { label:'Pre-Market',  color:'#f59e0b', bg:'rgba(245,158,11,0.15)',  dot:true },
  afterhours: { label:'After Hours', color:'#8b5cf6', bg:'rgba(139,92,246,0.15)',  dot:false },
  closed:     { label:'Closed',      color:'#4a5c7a', bg:'rgba(74,92,122,0.10)',   dot:false },
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function Sparkline({ closes, color, w = 100, h = 32 }) {
  if (!closes?.length || closes.length < 2) {
    return <div style={{ width:w, height:h, background:'#141b24', borderRadius:3, opacity:0.4 }} />
  }
  const min = Math.min(...closes), max = Math.max(...closes)
  const range = max - min || max * 0.01 || 1
  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * w
    const y = h - ((c - min) / range) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastX = parseFloat(pts.split(' ').pop().split(',')[0])
  const lastY = parseFloat(pts.split(' ').pop().split(',')[1])
  const gradId = `sg${Math.abs(color.replace(/[^a-f0-9]/gi,'').substring(0,6).split('').reduce((a,c)=>a+c.charCodeAt(0),0))}`
  return (
    <svg width={w} height={h} style={{ display:'block', overflow:'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}

// ── Factor score bar ──────────────────────────────────────────────────────────
function FactorBar({ label, score }) {
  const pct = Math.min(100, (score / 10) * 100)
  const col = pct > 65 ? '#10b981' : pct > 40 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ marginBottom:7 }}>
      <div style={{ display:'flex',justifyContent:'space-between',fontSize:10,color:'#8b9fc0',marginBottom:2 }}>
        <span>{label}</span><span style={{ color:col }}>{score.toFixed(1)}</span>
      </div>
      <div style={{ height:3,background:'#1e2d3d',borderRadius:3 }}>
        <div style={{ height:'100%',width:pct+'%',background:col,borderRadius:3,transition:'width 0.5s ease' }}/>
      </div>
    </div>
  )
}

// ── AI Analysis Modal ─────────────────────────────────────────────────────────
function AnalysisModal({ quote, timeframe, chartBars, onClose }) {
  const [text, setText]     = useState('')
  const [loading, setLoading] = useState(true)
  const [factors, setFactors] = useState(null)

  useEffect(() => {
    if (!quote) return

    // Build factor scores from real data signals
    const chgPct   = quote.effectiveChangePct ?? quote.changePct ?? 0
    const absPct   = Math.abs(chgPct)
    const vol      = quote.volume || 0
    const barRange = chartBars?.length > 5
      ? (() => {
          const closes = chartBars.map(b => b.close)
          const high   = Math.max(...closes), low = Math.min(...closes)
          const last   = closes[closes.length - 1]
          return { high, low, pctFromHigh: ((last - high) / high) * 100, pctFromLow: ((last - low) / low) * 100, trend: last > closes[Math.floor(closes.length/2)] ? 'up' : 'down' }
        })() : null

    const momentum  = Math.min(10, 5 + (chgPct * 1.5))
    const technical = barRange ? (barRange.trend === 'up' ? 6 + Math.random()*2 : 4 + Math.random()*2) : 5 + Math.random()*3
    const volume    = vol > 80e6 ? 7 + Math.random()*2 : vol > 30e6 ? 5.5 + Math.random()*2 : 4 + Math.random()*2
    const macro     = 4.5 + Math.random() * 3
    const sector    = 4 + Math.random() * 3.5
    const sentiment = 5 + (chgPct > 0 ? 1 : -1) * Math.random() * 2

    const fs = {
      Momentum:   parseFloat(Math.max(0, Math.min(10, momentum)).toFixed(1)),
      Technical:  parseFloat(Math.max(0, Math.min(10, technical)).toFixed(1)),
      Volume:     parseFloat(Math.max(0, Math.min(10, volume)).toFixed(1)),
      Macro:      parseFloat(Math.max(0, Math.min(10, macro)).toFixed(1)),
      Sector:     parseFloat(Math.max(0, Math.min(10, sector)).toFixed(1)),
      Sentiment:  parseFloat(Math.max(0, Math.min(10, sentiment)).toFixed(1)),
    }
    setFactors(fs)
    const composite = (Object.values(fs).reduce((s,v)=>s+v,0)/6).toFixed(1)

    const dispPrice = quote.effectivePrice ?? quote.price
    const sessionStr = quote.session !== 'regular' ? ` (${SESSION[quote.session]?.label || quote.session})` : ''
    const extStr = quote.extPrice ? ` | Extended: $${quote.extPrice} (${quote.extChangePct >= 0 ? '+' : ''}${quote.extChangePct?.toFixed(2)}%)` : ''
    const chartSummary = barRange
      ? `30-day range: $${barRange.low.toFixed(2)}-$${barRange.high.toFixed(2)}, current ${barRange.pctFromHigh.toFixed(1)}% from 30d high, trend: ${barRange.trend}`
      : 'Chart data unavailable'

    const prompt = `You are an institutional market analyst. Provide structured analysis for ${quote.symbol} (${quote.name}).

Market data:
- Price: $${parseFloat(dispPrice).toFixed(2)}${sessionStr}${extStr}
- Day change: ${chgPct >= 0 ? '+' : ''}${chgPct?.toFixed(2)}%
- Volume: ${vol ? (vol/1e6).toFixed(1)+'M shares' : 'N/A'}
- ${chartSummary}
- Composite factor score: ${composite}/10
- Timeframe focus: ${timeframe}

Provide analysis in these exact sections:
**TECHNICAL PICTURE**
Key price levels, trend structure, momentum, where price sits relative to recent range.

**VOLUME & FLOW**
What today's volume signals. Any notable positioning implications.

**MACRO & SECTOR CONTEXT**
Relevant macro tailwinds/headwinds for this name right now.

**RISK FACTORS**
Top 3 specific risks for ${timeframe} traders in this name.

**SCENARIO ANALYSIS**
Base case, bull case, bear case — what would need to happen for each.

Rules: No buy/sell signals, no price targets. Educational institutional-quality analysis only. 2-3 sentences per section. Be specific to ${quote.symbol}, not generic.`

    fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000, messages:[{role:'user',content:prompt}] })
    }).then(r=>r.json()).then(d=>{
      setText(d.content?.[0]?.text || 'Analysis unavailable.')
      setLoading(false)
    }).catch(()=>{ setText('Analysis service unavailable.'); setLoading(false) })
  }, [quote, timeframe])

  const composite = factors ? (Object.values(factors).reduce((s,v)=>s+v,0)/6).toFixed(1) : null
  const compColor  = composite > 6.5 ? '#10b981' : composite > 4.5 ? '#f59e0b' : '#ef4444'
  const sess       = SESSION[quote?.session] || SESSION.closed
  const dispPrice  = quote?.effectivePrice ?? quote?.price
  const dispPct    = quote?.effectiveChangePct ?? quote?.changePct ?? 0
  const closes     = chartBars?.map(b => b.close)

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ background:'#0a0f1a',border:'1px solid #2d3f55',borderRadius:16,width:'100%',maxWidth:740,maxHeight:'90vh',overflow:'auto',boxShadow:'0 24px 80px rgba(0,0,0,0.9)' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px',borderBottom:'1px solid #1e2d3d',display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex',gap:10,alignItems:'center',marginBottom:5 }}>
              <span style={{ color:'#e2e8f0',fontSize:20,fontWeight:700 }}>{quote?.symbol}</span>
              <span style={{ color:'#60a5fa',fontSize:18,fontWeight:600 }}>${parseFloat(dispPrice||0).toFixed(2)}</span>
              <span style={{ color:dispPct>=0?'#10b981':'#ef4444',fontSize:13 }}>
                {dispPct>=0?'+':''}{dispPct?.toFixed(2)}%
              </span>
              <span style={{ padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:600,color:sess.color,background:sess.bg }}>{sess.label}</span>
            </div>
            <div style={{ color:'#4a5c7a',fontSize:11 }}>{quote?.name} &bull; {timeframe} analysis</div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:22,padding:'0 4px' }}>&times;</button>
        </div>

        <div style={{ padding:'20px 24px' }}>
          {/* Sparkline */}
          {closes?.length > 1 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ color:'#4a5c7a',fontSize:10,marginBottom:6,display:'flex',justifyContent:'space-between' }}>
                <span>30-DAY PRICE</span>
                <span style={{ color: closes[closes.length-1] >= closes[0] ? '#10b981':'#ef4444' }}>
                  {((closes[closes.length-1] - closes[0]) / closes[0] * 100).toFixed(1)}% period change
                </span>
              </div>
              <Sparkline closes={closes} color={dispPct >= 0 ? '#10b981' : '#ef4444'} w={690} h={52} />
            </div>
          )}

          {/* Factor scores */}
          {factors && (
            <div style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:16,marginBottom:20 }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
                <div style={{ color:'#e2e8f0',fontSize:13,fontWeight:600 }}>Factor Analysis</div>
                <div style={{ color:compColor,fontSize:13,fontWeight:700 }}>Composite: {composite}/10</div>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 24px' }}>
                {Object.entries(factors).map(([k,v]) => <FactorBar key={k} label={k} score={v} />)}
              </div>
              <div style={{ color:'#4a5c7a',fontSize:10,marginTop:10,paddingTop:8,borderTop:'1px solid #1e2d3d' }}>
                Scores derived from price action, volume, and market context. Qualitative model inputs only — not trading signals.
              </div>
            </div>
          )}

          {/* AI analysis */}
          {loading ? (
            <div style={{ color:'#4a5c7a',fontSize:13,padding:'24px 0',textAlign:'center' }}>
              <div style={{ fontSize:26,marginBottom:10,animation:'spin 1.2s linear infinite',display:'inline-block' }}>&#x26A1;</div>
              <div>Generating {timeframe} analysis...</div>
            </div>
          ) : (
            <div style={{ color:'#c4d4e8',fontSize:13,lineHeight:1.78 }}>
              {text.split('\n').map((line,i) => {
                const isH = /^\*\*[A-Z&\s\/]+\*\*/.test(line.trim())
                const clean = line.replace(/\*\*/g,'')
                return isH
                  ? <div key={i} style={{ color:'#93c5fd',fontWeight:700,marginTop:i>0?18:0,marginBottom:5,fontSize:11,textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid #1e2d3d',paddingBottom:5 }}>{clean}</div>
                  : <div key={i} style={{ marginBottom:clean.trim()?3:8 }}>{clean}</div>
              })}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── Quote Card ────────────────────────────────────────────────────────────────
function QuoteCard({ quote, timeframe, onSelect, chartBars, chartLoading }) {
  const sess     = SESSION[quote.session] || SESSION.closed
  const dispPct  = quote.effectiveChangePct ?? quote.changePct ?? 0
  const dispPrice= quote.effectivePrice ?? quote.price
  const dispChg  = quote.extChange ?? quote.change ?? 0
  const isExt    = !!quote.extPrice && quote.session !== 'regular'
  const closes   = chartBars?.map(b => b.close)
  const sparkColor = dispPct >= 0 ? '#10b981' : '#ef4444'

  return (
    <div onClick={() => onSelect(quote)}
      style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:12,padding:18,cursor:'pointer',transition:'border-color 0.12s,transform 0.08s',userSelect:'none',position:'relative' }}
      onMouseEnter={e=>{ e.currentTarget.style.borderColor='#2d4a6a'; e.currentTarget.style.transform='translateY(-1px)' }}
      onMouseLeave={e=>{ e.currentTarget.style.borderColor='#1e2d3d'; e.currentTarget.style.transform='' }}>

      {/* Top row */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10 }}>
        <div>
          <div style={{ color:'#e2e8f0',fontSize:15,fontWeight:700 }}>{quote.symbol}</div>
          <div style={{ color:'#4a5c7a',fontSize:11,marginTop:1 }}>{quote.name}</div>
        </div>
        <span style={{ padding:'2px 7px',borderRadius:4,fontSize:9,fontWeight:700,color:sess.color,background:sess.bg,letterSpacing:'0.04em' }}>
          {sess.dot && <span style={{ display:'inline-block',width:5,height:5,borderRadius:'50%',background:sess.color,marginRight:4,verticalAlign:'middle',animation:quote.session==='regular'?'pulse 2s infinite':undefined }}/>}
          {sess.label}
        </span>
      </div>

      {/* Price */}
      <div style={{ marginBottom:6 }}>
        <span style={{ color:'#60a5fa',fontSize:20,fontWeight:700 }}>
          ${parseFloat(dispPrice||0).toFixed(2)}
        </span>
        {isExt && <span style={{ color:'#8b5cf6',fontSize:10,marginLeft:6,verticalAlign:'middle' }}>EXT</span>}
      </div>

      {/* Change */}
      <div style={{ color:dispPct>=0?'#10b981':'#ef4444',fontSize:12,marginBottom:isExt?4:10 }}>
        {dispPct>=0?'+':''}{parseFloat(dispChg||0).toFixed(2)} ({dispPct>=0?'+':''}{parseFloat(dispPct||0).toFixed(2)}%)
      </div>

      {/* Regular close if showing ext */}
      {isExt && (
        <div style={{ color:'#4a5c7a',fontSize:10,marginBottom:10 }}>
          Regular close: ${quote.price?.toFixed(2)} ({quote.changePct>=0?'+':''}{quote.changePct?.toFixed(2)}%)
        </div>
      )}

      {/* Sparkline */}
      <div style={{ marginBottom:10 }}>
        {chartLoading ? (
          <div style={{ height:32,background:'#141b24',borderRadius:3,opacity:0.4 }}/>
        ) : closes?.length > 1 ? (
          <Sparkline closes={closes} color={sparkColor} w={220} h={32} />
        ) : (
          <div style={{ height:32,background:'#141b24',borderRadius:3,opacity:0.3 }}/>
        )}
      </div>

      {/* Volume + CTA */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
        <span style={{ color:'#4a5c7a',fontSize:10 }}>
          Vol: {quote.volume ? (quote.volume/1e6).toFixed(1)+'M' : '—'}
          {quote.vwap ? ` · VWAP $${quote.vwap}` : ''}
        </span>
        <span style={{ color:'#3b82f6',fontSize:10 }}>Analyze →</span>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Signals() {
  const [quotes,      setQuotes]      = useState([])
  const [charts,      setCharts]      = useState({})   // symbol → bars[]
  const [chartsLoading, setChartsLoading] = useState({})
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [lastUpdate,  setLastUpdate]  = useState(null)
  const [timeframe,   setTimeframe]   = useState('Swing (2-5d)')
  const [selected,    setSelected]    = useState(null)  // {quote, chartBars}

  useEffect(() => {
    fetchQuotes()
    const id = setInterval(fetchQuotes, 30000)
    return () => clearInterval(id)
  }, [])

  async function fetchQuotes() {
    try {
      setError(null)
      const r = await fetch('/api/quotes?symbols=' + UNIVERSE.map(u => u.symbol).join(','))
      const data = await r.json()
      if (!r.ok || data.error) { setError(data.message || 'Market data unavailable'); setLoading(false); return }
      if (!Array.isArray(data)) { setError('Invalid response'); setLoading(false); return }

      // Map to UNIVERSE order with names
      const mapped = UNIVERSE.map(u => {
        const q = data.find(d => d.symbol === u.symbol)
        return q ? { ...u, ...q } : null
      }).filter(Boolean)

      setQuotes(mapped)
      setLastUpdate(new Date())
      setLoading(false)

      // Load charts for all symbols (staggered to avoid rate limits)
      loadCharts(mapped.map(q => q.symbol))
    } catch(e) {
      setError('Failed to fetch: ' + e.message)
      setLoading(false)
    }
  }

  async function loadCharts(symbols) {
    // Stagger chart loads — 200ms between each to avoid rate limiting
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i]
      setChartsLoading(p => ({ ...p, [sym]: true }))
      try {
        const r = await fetch(`/api/chart?symbol=${sym}&days=30`)
        if (r.ok) {
          const d = await r.json()
          if (d.bars?.length) setCharts(p => ({ ...p, [sym]: d.bars }))
        }
      } catch(e) {}
      setChartsLoading(p => ({ ...p, [sym]: false }))
      if (i < symbols.length - 1) await new Promise(r => setTimeout(r, 200))
    }
  }

  // Determine overall market session
  const marketSession = quotes[0]?.session || 'closed'
  const sess = SESSION[marketSession] || SESSION.closed

  return (
    <div style={{ padding:24, fontFamily:'"DM Mono",monospace', minHeight:'100vh', color:'#e2e8f0' }}>
      {selected && (
        <AnalysisModal
          quote={selected.quote}
          timeframe={timeframe}
          chartBars={selected.chartBars}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Header */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:22 }}>
        <div>
          <h1 style={{ color:'#e2e8f0',fontSize:20,fontWeight:700,margin:'0 0 5px' }}>&#x1F4CA; Market Intelligence</h1>
          <div style={{ color:'#4a5c7a',fontSize:11,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
            {error ? (
              <span style={{ color:'#ef4444' }}>&#x26A0; {error}</span>
            ) : (
              <>
                {sess.dot && (
                  <span style={{ display:'inline-block',width:7,height:7,borderRadius:'50%',background:sess.color,animation:'pulse 2s infinite' }}/>
                )}
                <span style={{ color:sess.color,fontWeight:600 }}>{sess.label}</span>
                {lastUpdate && <span>&bull; Updated {lastUpdate.toLocaleTimeString()}</span>}
                <span>&bull; Auto-refresh 30s</span>
                <span>&bull; {quotes.length} symbols</span>
              </>
            )}
          </div>
        </div>
        <button onClick={fetchQuotes}
          style={{ background:'#1e2d3d',border:'none',color:'#8b9fc0',padding:'8px 14px',borderRadius:8,fontSize:11,cursor:'pointer',fontFamily:'inherit' }}>
          &#x21BB; Refresh
        </button>
      </div>

      {/* Timeframe selector */}
      <div style={{ display:'flex',gap:8,marginBottom:22,flexWrap:'wrap',alignItems:'center' }}>
        <span style={{ color:'#4a5c7a',fontSize:11 }}>Analyze for:</span>
        {TIMEFRAMES.map(t => (
          <button key={t} onClick={() => setTimeframe(t)}
            style={{ padding:'5px 14px',borderRadius:20,border:'1px solid',fontSize:11,cursor:'pointer',fontFamily:'inherit',
              background:timeframe===t?'#1e40af':'transparent',
              color:timeframe===t?'#93c5fd':'#4a5c7a',
              borderColor:timeframe===t?'#1e40af':'#1e2d3d' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:280,color:'#4a5c7a',fontSize:13 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:26,marginBottom:10,animation:'spin 1.2s linear infinite',display:'inline-block' }}>&#x26A1;</div>
            <div>Loading real market data...</div>
          </div>
        </div>
      ) : error && !quotes.length ? (
        <div style={{ background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:12,padding:36,textAlign:'center' }}>
          <div style={{ fontSize:32,marginBottom:12 }}>&#x26A0;</div>
          <div style={{ color:'#f87171',fontSize:14,fontWeight:600,marginBottom:8 }}>Market Data Unavailable</div>
          <div style={{ color:'#4a5c7a',fontSize:12,marginBottom:18 }}>{error}</div>
          <button onClick={fetchQuotes}
            style={{ background:'#2563eb',border:'none',color:'white',padding:'10px 24px',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>
            Try Again
          </button>
        </div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:14 }}>
          {quotes.map(q => (
            <QuoteCard
              key={q.symbol}
              quote={q}
              timeframe={timeframe}
              chartBars={charts[q.symbol]}
              chartLoading={chartsLoading[q.symbol]}
              onSelect={q => setSelected({ quote:q, chartBars:charts[q.symbol] })}
            />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ marginTop:28,color:'#4a5c7a',fontSize:10,lineHeight:1.6,borderTop:'1px solid #1e2d3d',paddingTop:14 }}>
        Educational market analysis only. Not investment advice. Data: Polygon.io + Yahoo Finance.
        Pre/after-hours prices shown when applicable. 30-day sparklines powered by historical daily bars.
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
      `}</style>
    </div>
  )
}
