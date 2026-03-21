import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const QUICK = ['SPY','QQQ','NVDA','AAPL','MSFT','META','TSLA','AMZN','GOOGL','AMD','PLTR','CRWD','COIN','JPM','GS','IWM','XLK','MSTR']
const TF = ['1m','5m','15m','1h','4h','1D','1W','1M']
const TF_TV = { '1m':'1','5m':'5','15m':'15','1h':'60','4h':'240','1D':'D','1W':'W','1M':'M' }

function TVChart({ symbol, interval }) {
  const ref = useRef(null)
  const widgetRef = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    // Remove old widget
    if (widgetRef.current) { ref.current.innerHTML = '' }
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    s.async = true
    s.innerHTML = JSON.stringify({
      symbol: symbol,
      interval: TF_TV[interval] || 'D',
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      backgroundColor: 'rgba(8,11,18,1)',
      gridColor: 'rgba(30,40,64,0.3)',
      width: '100%',
      height: '100%',
    })
    const container = document.createElement('div')
    container.className = 'tradingview-widget-container'
    container.style.cssText = 'width:100%;height:100%;'
    const inner = document.createElement('div')
    inner.className = 'tradingview-widget-container__widget'
    inner.style.cssText = 'width:100%;height:100%;'
    container.appendChild(inner)
    container.appendChild(s)
    ref.current.innerHTML = ''
    ref.current.appendChild(container)
    widgetRef.current = container
  }, [symbol, interval])

  return <div ref={ref} style={{ width:'100%', height:'100%' }} />
}

function AnalysisPanel({ symbol, onClose }) {
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState(null)
  const [autoLoad, setAutoLoad] = useState(false)

  const run = useCallback(async () => {
    setLoading(true); setError(null); setAnalysis(null)
    try {
      const r = await fetch('/api/analysis?action=snapshot&symbol=' + symbol, { signal: AbortSignal.timeout(90000) })
      const d = await r.json()
      d.error ? setError(d.error) : setAnalysis(d)
    } catch(e) { setError(e.message) }
    setLoading(false)
  }, [symbol])

  useEffect(() => { if (autoLoad) run() }, [symbol])

  const sc = analysis && analysis.sentiment
    ? (analysis.sentiment === 'bullish' ? '#10b981' : analysis.sentiment === 'bearish' ? '#ef4444' : '#f59e0b')
    : 'var(--text-muted)'

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'var(--bg-card)', borderLeft:'1px solid var(--border)' }}>
      {/* Panel header */}
      <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>AI Analysis</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>{symbol}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={run} disabled={loading}
                  style={{ background:'linear-gradient(135deg,#7c3aed,#3b82f6)', color:'#fff', border:'none',
                           borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:600 }}>
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
          <button onClick={onClose}
                  style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:16, padding:'4px 6px', lineHeight:1 }}>
            x
          </button>
        </div>
      </div>

      {/* Panel body — scrollable */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px' }}>
        {!analysis && !loading && !error && (
          <div style={{ textAlign:'center', padding:'40px 20px' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>AI</div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', marginBottom:8 }}>AnkushAI Analysis</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.7, marginBottom:20 }}>
              Get AI-powered technical analysis,<br/>key levels, and trade setups for {symbol}
            </div>
            <button onClick={run}
                    style={{ background:'linear-gradient(135deg,#7c3aed,#3b82f6)', color:'#fff', border:'none',
                             borderRadius:8, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
              Run Analysis
            </button>
          </div>
        )}

        {loading && (
          <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--text-muted)' }}>
            <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:8 }}>Analyzing {symbol}...</div>
            <div style={{ fontSize:12, lineHeight:1.8 }}>
              Scanning technicals<br/>Checking market context<br/>Building trade thesis
            </div>
          </div>
        )}

        {error && (
          <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
                        borderRadius:8, padding:12, color:'#ef4444', fontSize:12 }}>
            {error}
          </div>
        )}

        {analysis && !loading && (
          <div>
            {/* Sentiment + price */}
            <div style={{ background:'var(--bg-elevated)', borderRadius:8, padding:12, marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:16, fontWeight:700 }}>{symbol}</span>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:4, textTransform:'uppercase',
                               background: sc + '20', color:sc }}>{analysis.sentiment}</span>
              </div>
              {analysis.price && (
                <div style={{ fontSize:20, fontWeight:700, fontFamily:'var(--font-mono)', color:'var(--text-primary)', marginBottom:4 }}>
                  ${Number(analysis.price).toFixed(2)}
                </div>
              )}
              {analysis.confidence && (
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>Confidence: <span style={{color:'var(--text-secondary)',fontWeight:600}}>{analysis.confidence}%</span></div>
              )}
            </div>

            {/* Summary */}
            {analysis.summary && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Analysis</div>
                <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.7 }}>{analysis.summary}</div>
              </div>
            )}

            {/* Key levels */}
            {(analysis.keyLevels || analysis.support || analysis.resistance) && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Key Levels</div>
                {analysis.resistance && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border-dim)', fontSize:12 }}>
                    <span style={{color:'var(--text-muted)'}}>Resistance</span>
                    <span style={{color:'#ef4444', fontFamily:'var(--font-mono)', fontWeight:600}}>${Number(analysis.resistance).toFixed(2)}</span>
                  </div>
                )}
                {analysis.support && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12 }}>
                    <span style={{color:'var(--text-muted)'}}>Support</span>
                    <span style={{color:'#10b981', fontFamily:'var(--font-mono)', fontWeight:600}}>${Number(analysis.support).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Setup */}
            {analysis.setup && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Trade Setup</div>
                <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.6 }}>{analysis.setup}</div>
              </div>
            )}

            {/* Risk */}
            {(analysis.entry || analysis.target || analysis.stop) && (
              <div style={{ background:'var(--bg-elevated)', borderRadius:8, padding:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>Levels</div>
                {[['Entry', analysis.entry, 'var(--text-primary)'], ['Target', analysis.target, '#10b981'], ['Stop', analysis.stop, '#ef4444']].filter(([,v])=>v).map(([l,v,c])=>(
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12 }}>
                    <span style={{color:'var(--text-muted)'}}>{l}</span>
                    <span style={{color:c, fontFamily:'var(--font-mono)', fontWeight:600}}>${Number(v).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:12, textAlign:'right' }}>
              {analysis.timestamp ? new Date(analysis.timestamp).toLocaleTimeString() : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Charts() {
  const [params] = useSearchParams()
  const [sym, setSym] = useState(params.get('symbol') || 'SPY')
  const [input, setInput] = useState(params.get('symbol') || 'SPY')
  const [tf, setTf] = useState('1D')
  const [showAnalysis, setShowAnalysis] = useState(true)

  function go(s) {
    const v = (s || input).trim().toUpperCase()
    if (!v) return
    setSym(v); setInput(v)
  }

  return (
    // Fill entire viewport height minus the 200px sidebar header area
    // Use dvh for mobile compatibility
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg-base)', fontFamily:'var(--font)', color:'var(--text-primary)', overflow:'hidden' }}>

      {/* Top control bar — compact, fixed height */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderBottom:'1px solid var(--border)', background:'var(--bg-card)', flexShrink:0, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <input value={input} onChange={e=>setInput(e.target.value.toUpperCase())}
                 onKeyDown={e=>e.key==='Enter'&&go()} placeholder='SPY'
                 style={{ width:80, padding:'5px 10px', background:'var(--bg-elevated)', border:'1px solid var(--border)',
                          borderRadius:6, color:'var(--text-primary)', fontSize:14, fontWeight:700, textTransform:'uppercase' }} />
          <button onClick={()=>go()} style={{ padding:'5px 14px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600 }}>Go</button>
        </div>
        <div style={{ display:'flex', gap:3 }}>
          {TF.map(t => (
            <button key={t} onClick={()=>setTf(t)}
                    style={{ padding:'4px 10px', borderRadius:5, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                             background: tf===t ? 'var(--accent)' : 'var(--bg-elevated)',
                             color: tf===t ? '#fff' : 'var(--text-muted)' }}>{t}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {QUICK.map(s => (
            <button key={s} onClick={()=>go(s)}
                    style={{ padding:'3px 8px', borderRadius:5, border:'1px solid var(--border)', cursor:'pointer', fontSize:11,
                             background: sym===s ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                             color: sym===s ? 'var(--accent)' : 'var(--text-muted)',
                             fontWeight: sym===s ? 700 : 400 }}>{s}</button>
          ))}
        </div>
        <button onClick={()=>setShowAnalysis(v=>!v)}
                style={{ marginLeft:'auto', padding:'5px 14px', borderRadius:6, border:'1px solid rgba(124,58,237,0.4)',
                         cursor:'pointer', fontSize:12, fontWeight:600,
                         background: showAnalysis ? 'rgba(124,58,237,0.15)' : 'var(--bg-elevated)',
                         color: showAnalysis ? '#a78bfa' : 'var(--text-muted)' }}>
          {showAnalysis ? 'Hide AI' : 'AI Analysis'}
        </button>
      </div>

      {/* Main content — flex row, fills remaining height */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>

        {/* LEFT: TradingView chart — fills all available space */}
        <div style={{ flex:1, minWidth:0, position:'relative', overflow:'hidden' }}>
          <TVChart symbol={sym} interval={tf} />
        </div>

        {/* RIGHT: AI Analysis panel — fixed 340px, full height, slides in/out */}
        {showAnalysis && (
          <div style={{ width:340, flexShrink:0, height:'100%', overflow:'hidden' }}>
            <AnalysisPanel symbol={sym} onClose={()=>setShowAnalysis(false)} />
          </div>
        )}
      </div>
    </div>
  )
}