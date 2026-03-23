import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

const QUICK = ['SPY','QQQ','NVDA','AAPL','MSFT','META','TSLA','AMZN','GOOGL','AMD','PLTR','CRWD','COIN','JPM','GS','IWM','XLK','MSTR']
const TF = ['1m','5m','15m','1h','4h','1D','1W','1M']
const TV_INTERVAL = {'1m':'1','5m':'5','15m':'15','1h':'60','4h':'240','1D':'D','1W':'W','1M':'M'}

// TradingView widget with full drawing tools
function TVChart({ symbol, interval }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.style.cssText = 'width:100%;height:100%;'
    wrap.className = 'tradingview-widget-container'
    const inner = document.createElement('div')
    inner.className = 'tradingview-widget-container__widget'
    inner.style.cssText = 'width:100%;height:100%;'
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    s.async = true
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: TV_INTERVAL[interval] || 'D',
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: true,
      backgroundColor: 'rgba(8,11,18,1)',
      gridColor: 'rgba(30,40,64,0.25)',
      studies: ['MASimple@tv-basicstudies', 'VWAP@tv-basicstudies', 'RSI@tv-basicstudies'],
    })
    wrap.appendChild(inner)
    wrap.appendChild(s)
    ref.current.appendChild(wrap)
  }, [symbol, interval])
  return <div ref={ref} style={{ width:'100%', height:'100%' }} />
}

// AI text analysis panel (uses analysis.js ?action=single)
function AITextPanel({ symbol }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [cached, setCached] = useState(false)

  const run = useCallback(async (force) => {
    setLoading(true); setError(null)
    try {
      const url = '/api/analysis?action=single&symbol=' + symbol + (force ? '&force=1' : '')
      const r = await fetch(url, { signal: AbortSignal.timeout(90000) })
      const d = await r.json()
      if (d.error) { setError(d.error) } else { setData(d); setCached(!!d._cached) }
    } catch(e) { setError(e.message) }
    setLoading(false)
  }, [symbol])

  // Auto-load on mount
  useEffect(() => { run(false) }, [run])

  const sc = !data ? 'var(--text-muted)'
    : data.bias === 'bullish' ? '#10b981'
    : data.bias === 'bearish' ? '#ef4444' : '#f59e0b'

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:700 }}>AI Analysis
            {cached && <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:6, fontWeight:400 }}>cached</span>}
          </div>
          <div style={{ fontSize:10, color:'var(--text-muted)' }}>{symbol}</div>
        </div>
        <button onClick={() => run(true)} disabled={loading}
                style={{ background:'linear-gradient(135deg,#7c3aed,#3b82f6)', color:'#fff', border:'none',
                         borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
          {loading ? '...' : 'Refresh'}
        </button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
        {loading && !data && (
          <div style={{ textAlign:'center', padding:'30px 10px', color:'var(--text-muted)' }}>
            <div style={{ fontSize:12, marginBottom:6 }}>Analyzing {symbol}...</div>
            <div style={{ fontSize:11 }}>Checking cache then running AI</div>
          </div>
        )}
        {error && <div style={{ color:'#ef4444', fontSize:12, padding:'8px', background:'rgba(239,68,68,0.1)', borderRadius:6 }}>{error}</div>}
        {data && (
          <div>
            <div style={{ background:'var(--bg-elevated)', borderRadius:7, padding:10, marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ fontWeight:700, fontSize:14 }}>{symbol}</span>
                <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:3,
                               background: sc+'22', color:sc, textTransform:'uppercase' }}>
                  {data.bias}
                </span>
              </div>
              {data.price && <div style={{ fontSize:18, fontWeight:700, fontFamily:'var(--font-mono)' }}>${Number(data.price).toFixed(2)}</div>}
              {(data.confidence || data.signals?.momentum) && (
                <div>
                  {data.confidence && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>Confidence: {data.confidence}%</div>}
                  {data.signals?.momentum && (
                    <div style={{display:'flex',gap:10,marginTop:3,flexWrap:'wrap'}}>
                      {[['5d',data.signals.momentum.roc5],['20d',data.signals.momentum.roc20],['60d',data.signals.momentum.roc60]].filter(([,v])=>v!=null).map(([lbl,val])=>(
                        <span key={lbl} style={{fontSize:10,color:val>=0?'#10b981':'#ef4444',fontWeight:700}}>{lbl}: {val>=0?'+':''}{val}%</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {data.summary && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:5 }}>Analysis</div>
                <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 }}>{data.summary}</div>
              </div>
            )}
            {(data.support || data.resistance) && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:5 }}>Key Levels</div>
                {data.resistance && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border-dim)', fontSize:12 }}>
                    <span style={{color:'var(--text-muted)'}}>Resistance</span>
                    <span style={{color:'#ef4444', fontFamily:'var(--font-mono)', fontWeight:600}}>${Number(data.resistance).toFixed(2)}</span>
                  </div>
                )}
                {data.support && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12 }}>
                    <span style={{color:'var(--text-muted)'}}>Support</span>
                    <span style={{color:'#10b981', fontFamily:'var(--font-mono)', fontWeight:600}}>${Number(data.support).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
            {data.setup && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:5 }}>Setup</div>
                <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6 }}>{data.setup}</div>
              </div>
            )}
            {(data.tradeSetup || data.entry) && (
              <div style={{ background:'var(--bg-elevated)', borderRadius:7, padding:8, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1 }}>Trade Levels</div>
                  {(data.tradeSetup?.rrRatio || 0) > 0 && <span style={{fontSize:10,color:'#10b981',fontWeight:700}}>{data.tradeSetup.rrRatio}:1 R:R</span>}
                </div>
                {[
                  ['Entry', data.tradeSetup?.entry ?? data.entry, 'var(--text-primary)'],
                  ['Stop',  data.tradeSetup?.stop  ?? data.stop,  '#ef4444'],
                  ['T1',    data.tradeSetup?.target1 ?? data.target, '#10b981'],
                  ['T2',    data.tradeSetup?.target2, '#10b981'],
                ].filter(([,v])=>v).map(([l,v,c])=>(
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12 }}>
                    <span style={{color:'var(--text-muted)'}}>{l}</span>
                    <span style={{color:c, fontFamily:'var(--font-mono)'}}>{'$'+(v?.toFixed(2))}</span>
                  </div>
                ))}
                {data.tradeSetup?.rationale && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,lineHeight:1.4}}>{data.tradeSetup.rationale}</div>}
              </div>
            )}&& (
              <div style={{ background:'var(--bg-elevated)', borderRadius:7, padding:8, marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Trade Levels</div>
                {[['Entry',data.entry,'var(--text-primary)'],['Target',data.target,'#10b981'],['Stop',data.stop,'#ef4444']].filter(([,v])=>v).map(([l,v,c])=>(
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12 }}>
                    <span style={{color:'var(--text-muted)'}}>{l}</span>
                    <span style={{color:c, fontFamily:'var(--font-mono)', fontWeight:600}}>${Number(v).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {data._cached && <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:8 }}>Cached {data._cacheAge} ago - Auto-refreshes every 4h</div>}
            {!data._cached && data.timestamp && <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:8 }}>Generated {new Date(data.timestamp).toLocaleTimeString()}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// AI chart overlay panel (uses chart-analysis.js)
function AIOverlayPanel({ symbol, onClose }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const run = useCallback(async (force) => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/chart-analysis?symbol=' + symbol + (force ? '&force=1' : ''), { signal: AbortSignal.timeout(90000) })
      const d = await r.json()
      d.error ? setError(d.error) : setData(d)
    } catch(e) { setError(e.message) }
    setLoading(false)
  }, [symbol])

  useEffect(() => { run(false) }, [run])

  const biasColor = !data ? 'var(--text-muted)' : data.bias === 'bullish' ? '#10b981' : data.bias === 'bearish' ? '#ef4444' : '#f59e0b'

  const Section = ({ title, children }) => (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{title}</div>
      {children}
    </div>
  )

  const LevelRow = ({ label, value, color }) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border-dim)', fontSize:12 }}>
      <span style={{ color:'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: color||'var(--text-primary)', fontFamily:'var(--font-mono)', fontWeight:600 }}>${Number(value).toFixed(2)}</span>
    </div>
  )

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'var(--bg-card)', borderLeft:'1px solid var(--border)' }}>
      <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:'#a78bfa' }}>AI Chart Levels
            {data && data._cached && <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:6 }}>cached {data._cacheAge}</span>}
          </div>
          <div style={{ fontSize:10, color:'var(--text-muted)' }}>Fibonacci, S/D Zones, Key Levels</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => run(true)} disabled={loading}
                  style={{ background:'rgba(124,58,237,0.2)', color:'#a78bfa', border:'1px solid rgba(124,58,237,0.3)', borderRadius:5, padding:'4px 10px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
            {loading ? '...' : 'Refresh'}
          </button>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:14, lineHeight:1 }}>x</button>
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
        {loading && !data && (
          <div style={{ textAlign:'center', padding:'30px 10px', color:'var(--text-muted)' }}>
            <div style={{ fontSize:12, marginBottom:4 }}>Computing AI levels...</div>
            <div style={{ fontSize:11 }}>Fibonacci, S/D zones, VWAP anchors</div>
          </div>
        )}
        {error && <div style={{ color:'#ef4444', fontSize:12, padding:'8px', background:'rgba(239,68,68,0.1)', borderRadius:6, marginBottom:8 }}>{error}</div>}
        {data && !loading && (
          <div>
            <div style={{ background:'var(--bg-elevated)', borderRadius:7, padding:'8px 10px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700 }}>{symbol}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>${Number(data.currentPrice||0).toFixed(2)}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:4, background: biasColor+'22', color:biasColor, textTransform:'uppercase' }}>{data.bias}</span>
            </div>
            {data.priceVsLevels && (
              <div style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:12, padding:'8px', background:'rgba(124,58,237,0.08)', borderRadius:6, borderLeft:'2px solid #7c3aed' }}>
                {data.priceVsLevels}
              </div>
            )}
            <Section title='Key Resistance'>
              {(data.keyResistance||[]).map((v,i) => <LevelRow key={i} label={'R' + (i+1)} value={v} color='#ef4444' />)}
            </Section>
            <Section title='Key Support'>
              {(data.keySupport||[]).map((v,i) => <LevelRow key={i} label={'S' + (i+1)} value={v} color='#10b981' />)}
            </Section>
            {(data.supplyZones||[]).length > 0 && (
              <Section title='Supply Zones'>
                {data.supplyZones.map((z,i) => (
                  <div key={i} style={{ padding:'5px 8px', marginBottom:4, borderRadius:5, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)' }}>
                    <div style={{ fontSize:11, color:'#ef4444', fontWeight:600 }}>{z.label||('Supply Zone '+(i+1))}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>${z.bottom} - ${z.top}</div>
                  </div>
                ))}
              </Section>
            )}
            {(data.demandZones||[]).length > 0 && (
              <Section title='Demand Zones'>
                {data.demandZones.map((z,i) => (
                  <div key={i} style={{ padding:'5px 8px', marginBottom:4, borderRadius:5, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.15)' }}>
                    <div style={{ fontSize:11, color:'#10b981', fontWeight:600 }}>{z.label||('Demand Zone '+(i+1))}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>${z.bottom} - ${z.top}</div>
                  </div>
                ))}
              </Section>
            )}
            {data.fibonacci && (
              <Section title='Fibonacci Levels'>
                {[['0% (Low)', data.fibonacci.fib_0||data.low90,'var(--text-muted)'],
                  ['23.6%', data.fibonacci.fib_236||'','var(--text-secondary)'],
                  ['38.2%', data.fibonacci.fib_382||'','#f59e0b'],
                  ['50%',   data.fibonacci.fib_500||'','#f59e0b'],
                  ['61.8%', data.fibonacci.fib_618||'','var(--accent)'],
                  ['78.6%', data.fibonacci.fib_786||'','var(--accent)'],
                  ['100% (High)', data.fibonacci.fib_1000||data.high90,'var(--text-muted)'],
                ].filter(([,v])=>v).map(([l,v,c]) => <LevelRow key={l} label={l} value={v} color={c} />)}
              </Section>
            )}
            {data.emas && data.emas.length > 0 && (
              <Section title='EMAs'>
                {data.emas.filter(e=>e.value).map(e => <LevelRow key={e.period} label={'EMA ' + e.period} value={e.value} color='var(--text-secondary)' />)}
              </Section>
            )}
            {data.vwap && (
              <Section title='VWAP Anchors'>
                {data.vwap['20d'] && <LevelRow label='VWAP 20d' value={data.vwap['20d']} color='#a78bfa' />}
                {data.vwap['90d'] && <LevelRow label='VWAP 90d' value={data.vwap['90d']} color='#7c3aed' />}
              </Section>
            )}
            {(data.immediateTarget || data.invalidationLevel) && (
              <Section title='Trade Plan'>
                {data.immediateTarget && <LevelRow label='Immediate Target' value={data.immediateTarget} color='#10b981' />}
                {data.invalidationLevel && <LevelRow label='Invalidation' value={data.invalidationLevel} color='#ef4444' />}
              </Section>
            )}
            <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:8, textAlign:'right' }}>
              Auto-refresh every 4h - All levels from Polygon real prices
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
  const [mode, setMode] = useState('analysis') // 'analysis' | 'overlay' | 'none'

  function go(s) { const v = (s||input).trim().toUpperCase(); if (!v) return; setSym(v); setInput(v) }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg-base)', fontFamily:'var(--font)', color:'var(--text-primary)', overflow:'hidden' }}>
      {/* Top bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderBottom:'1px solid var(--border)', background:'var(--bg-card)', flexShrink:0, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
          <input value={input} onChange={e=>setInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&go()}
                 placeholder='SPY' style={{ width:75, padding:'5px 9px', background:'var(--bg-elevated)', border:'1px solid var(--border)',
                 borderRadius:5, color:'var(--text-primary)', fontSize:14, fontWeight:700, textTransform:'uppercase' }} />
          <button onClick={()=>go()} style={{ padding:'5px 12px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:5, cursor:'pointer', fontSize:12, fontWeight:600 }}>Go</button>
        </div>
        <div style={{ display:'flex', gap:3 }}>
          {TF.map(t => (
            <button key={t} onClick={()=>setTf(t)} style={{ padding:'4px 9px', borderRadius:4, border:'none', cursor:'pointer', fontSize:11, fontWeight:600,
                    background: tf===t ? 'var(--accent)' : 'var(--bg-elevated)', color: tf===t ? '#fff' : 'var(--text-muted)' }}>{t}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
          {QUICK.map(s => (
            <button key={s} onClick={()=>go(s)} style={{ padding:'3px 7px', borderRadius:4, border:'1px solid var(--border)', cursor:'pointer', fontSize:11,
                    background: sym===s ? 'var(--accent-dim)' : 'var(--bg-elevated)', color: sym===s ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: sym===s ? 700 : 400 }}>{s}</button>
          ))}
        </div>
        {/* Mode buttons */}
        <div style={{ marginLeft:'auto', display:'flex', gap:5 }}>
          <button onClick={()=>setMode(m => m==='analysis' ? 'none' : 'analysis')}
                  style={{ padding:'5px 12px', borderRadius:5, border:'1px solid rgba(59,130,246,0.4)', cursor:'pointer', fontSize:11, fontWeight:600,
                           background: mode==='analysis' ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
                           color: mode==='analysis' ? 'var(--accent)' : 'var(--text-muted)' }}>
            AI Analysis
          </button>
          <button onClick={()=>setMode(m => m==='overlay' ? 'none' : 'overlay')}
                  style={{ padding:'5px 12px', borderRadius:5, border:'1px solid rgba(124,58,237,0.4)', cursor:'pointer', fontSize:11, fontWeight:600,
                           background: mode==='overlay' ? 'rgba(124,58,237,0.15)' : 'var(--bg-elevated)',
                           color: mode==='overlay' ? '#a78bfa' : 'var(--text-muted)' }}>
            AI Levels
          </button>
        </div>
      </div>
      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>
        {/* Chart fills remaining space */}
        <div style={{ flex:1, minWidth:0, position:'relative', overflow:'hidden' }}>
          <TVChart symbol={sym} interval={tf} />
        </div>
        {/* Right panel — 320px */}
        {mode === 'analysis' && (
          <div style={{ width:320, flexShrink:0, height:'100%', overflow:'hidden', background:'var(--bg-card)', borderLeft:'1px solid var(--border)' }}>
            <AITextPanel symbol={sym} />
          </div>
        )}
        {mode === 'overlay' && (
          <div style={{ width:320, flexShrink:0, height:'100%', overflow:'hidden' }}>
            <AIOverlayPanel symbol={sym} onClose={()=>setMode('none')} />
          </div>
        )}
      </div>
    </div>
  )
}