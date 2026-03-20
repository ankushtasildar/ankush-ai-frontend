import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const TFS = [
  { label: '1D', ts: 'minute', m: 1, days: 1, lim: 390 },
  { label: '5D', ts: 'minute', m: 5, days: 5, lim: 390 },
  { label: '1M', ts: 'day', m: 1, days: 30, lim: 30 },
  { label: '3M', ts: 'day', m: 1, days: 90, lim: 90 },
  { label: '6M', ts: 'day', m: 1, days: 180, lim: 180 },
  { label: '1Y', ts: 'day', m: 1, days: 365, lim: 365 },
  { label: '2Y', ts: 'week', m: 1, days: 730, lim: 104 },
]
const OVS = ['EMA9','EMA21','EMA50','EMA200','VWAP']
const COLS = { EMA9:'#f59e0b', EMA21:'#3b82f6', EMA50:'#8b5cf6', EMA200:'#ef4444', VWAP:'#10b981' }

function calcEMA(data, p) {
  const k = 2/(p+1); let e = data[0]?.close
  return data.map((d,i) => { if(i===0) return {time:d.time,value:e}; e=d.close*k+e*(1-k); return {time:d.time,value:parseFloat(e.toFixed(4))} })
}
function calcVWAP(data) {
  let cPV=0,cV=0
  return data.map(c => { const tp=(c.high+c.low+c.close)/3; cPV+=tp*(c.volume||1); cV+=(c.volume||1); return {time:c.time,value:parseFloat((cPV/cV).toFixed(4))} })
}

function Section({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width:'100%',background:'none',border:'none',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',color:'#8b9fc0' }}>
        <span style={{ fontFamily:'"DM Mono",monospace',fontSize:10,letterSpacing:'.08em',display:'flex',alignItems:'center',gap:6 }}>
          <span>{icon}</span>{title}
        </span>
        <span style={{ fontSize:10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding:'0 16px 14px' }}>{children}</div>}
    </div>
  )
}

function DataRow({ label, value, color }) {
  return (
    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ color:'#4a5c7a',fontSize:11 }}>{label}</span>
      <span style={{ color:color||'#c4cfe0',fontSize:12,fontFamily:'"DM Mono",monospace',fontWeight:600 }}>{value}</span>
    </div>
  )
}

function AnalysisPanel({ symbol, onClose }) {
  const [data, setData] = useState(null)
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!symbol) return
    setData(null); setAnalysis(''); setLoading(true); setError(null)
    const NL = '\n'
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch('/api/analysis?type=analyze&symbol=' + symbol, {
          headers: { 'Authorization': 'Bearer ' + session?.access_token }
        })
        const reader = r.body.getReader()
        const dec = new TextDecoder()
        let txt = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = dec.decode(value)
          const lines = chunk.split(NL).filter(l => l.startsWith('data: '))
          for (const line of lines) {
            try {
              const d = JSON.parse(line.slice(6))
              if (d.type === 'data') { setData(d.tickerData); setLoading(false) }
              else if (d.type === 'text') { txt += d.text; setAnalysis(txt) }
              else if (d.type === 'error') setError(d.error)
            } catch(e) {}
          }
        }
      } catch(err) { setError(err.message); setLoading(false) }
    })()
  }, [symbol])

  const td = data
  const steps = ['Fetching price data', 'Calculating indicators', 'Loading options chain', 'Running AI synthesis']

  return (
    <div style={{ width:340,borderLeft:'1px solid rgba(255,255,255,0.07)',background:'#090e18',display:'flex',flexDirection:'column',flexShrink:0,height:'100%',overflowY:'auto' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={{ padding:'14px 16px',borderBottom:'1px solid rgba(255,255,255,0.07)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,position:'sticky',top:0,background:'#090e18',zIndex:10 }}>
        <div>
          <div style={{ fontFamily:'"Syne",sans-serif',fontSize:16,fontWeight:800,color:'#f0f4ff' }}>{symbol} Analysis</div>
          <div style={{ color:'#4a5c7a',fontSize:10,fontFamily:'"DM Mono",monospace' }}>100 ANALYST FRAMEWORKS</div>
        </div>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.05)',border:'none',color:'#8b9fc0',width:28,height:28,borderRadius:7,cursor:'pointer',fontSize:14 }}>✕</button>
      </div>
      {loading && !td && (
        <div style={{ padding:20 }}>
          <div style={{ color:'#4a5c7a',fontSize:12,fontFamily:'"DM Mono",monospace',marginBottom:12 }}>⚡ Loading market intelligence...</div>
          {steps.map((s,i) => (
            <div key={s} style={{ color:'#2d3d50',fontSize:11,padding:'4px 0',animation:'pulse 1.5s infinite',animationDelay:(i*0.4)+'s' }}>▸ {s}</div>
          ))}
        </div>
      )}
      {error && <div style={{ padding:'16px',color:'#fca5a5',fontSize:12,background:'rgba(239,68,68,0.05)' }}>{error}</div>}
      {td && (
        <>
          <div style={{ padding:'12px 16px',background:'rgba(255,255,255,0.02)' }}>
            <div style={{ display:'flex',alignItems:'baseline',gap:8 }}>
              <span style={{ fontSize:24,fontWeight:700,color:'#f0f4ff',fontFamily:'"DM Mono",monospace' }}>${td.current?.toFixed(2)}</span>
              <span style={{ fontSize:13,color:td.changePct>=0?'#10b981':'#ef4444',fontFamily:'"DM Mono",monospace' }}>
                {td.changePct >= 0 ? '➲ ' : '➼ '}{Math.abs(td.changePct||0).toFixed(2)}%
              </span>
            </div>
            <div style={{ color:'#4a5c7a',fontSize:11 }}>{td.name}</div>
            <div style={{ marginTop:8 }}>
              <div style={{ display:'flex',justifyContent:'space-between',fontSize:10,color:'#2d3d50',marginBottom:4 }}>
                <span>52W Low ${td.low52w?.toFixed(0)}</span>
                <span style={{ color:'#8b9fc0' }}>{td.pricePosition52w}% of range</span>
                <span>High ${td.high52w?.toFixed(0)}</span>
              </div>
              <div style={{ height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden' }}>
                <div style={{ width:(td.pricePosition52w||50)+'%',height:'100%',background:td.pricePosition52w>80?'#ef4444':td.pricePosition52w<20?'#10b981':'#3b82f6',borderRadius:2 }}/>
              </div>
            </div>
          </div>
          <Section title="PRICE ACTION & TECHNICALS" icon="📈" defaultOpen={true}>
            <DataRow label="RSI(14)" value={td.technicals?.rsi14} color={td.technicals?.rsi14>70?'#ef4444':td.technicals?.rsi14<30?'#10b981':'#c4cfe0'} />
            <DataRow label="EMA Alignment" value={(td.technicals?.emaAlignment||'').replace('_',' ').toUpperCase()} color={td.technicals?.emaAlignment==='bullish_stacked'?'#10b981':td.technicals?.emaAlignment==='bearish_stacked'?'#ef4444':'#f59e0b'} />
            <DataRow label="vs EMA50" value={(td.technicals?.distFromEMA50>0?'+':'')+td.technicals?.distFromEMA50+'%'} color={td.technicals?.distFromEMA50>0?'#10b981':'#ef4444'} />
            <DataRow label="vs EMA200" value={(td.technicals?.distFromEMA200>0?'+':'')+td.technicals?.distFromEMA200+'%'} color={td.technicals?.distFromEMA200>0?'#10b981':'#ef4444'} />
            <DataRow label="Volume" value={td.volumeRatio+'x avg'} color={parseFloat(td.volumeRatio)>1.5?'#f59e0b':'#c4cfe0'} />
            <div style={{ marginTop:8 }}>
              <div style={{ color:'#2d3d50',fontSize:10,fontFamily:'"DM Mono",monospace',marginBottom:6 }}>EMA LEVELS</div>
              {[['EMA9',td.technicals?.ema9,'#f59e0b'],['EMA21',td.technicals?.ema21,'#3b82f6'],['EMA50',td.technicals?.ema50,'#8b5cf6'],['EMA200',td.technicals?.ema200,'#ef4444']].map(([name,val,col]) => (
                <div key={name} style={{ display:'flex',justifyContent:'space-between',padding:'3px 0' }}>
                  <span style={{ color:col,fontSize:10,fontFamily:'"DM Mono",monospace' }}>{name}</span>
                  <span style={{ color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace' }}>${val?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Section>
          <Section title="FIBONACCI LEVELS" icon="🔢">
            {td.fibonacci && Object.entries(td.fibonacci).map(([pct, price]) => {
              const isNear = Math.abs(td.current - price) / td.current < 0.015
              return (
                <div key={pct} style={{ display:'flex',justifyContent:'space-between',padding:'4px 8px',borderBottom:'1px solid rgba(255,255,255,0.03)',background:isNear?'rgba(245,158,11,0.05)':'transparent',marginLeft:-16,marginRight:-16 }}>
                  <span style={{ color:isNear?'#f59e0b':'#4a5c7a',fontSize:11 }}>{pct}</span>
                  <span style={{ color:isNear?'#f59e0b':'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',fontWeight:isNear?700:400 }}>
                    ${price?.toFixed(2)}{isNear ? ' ← NEAR' : ''}
                  </span>
                </div>
              )
            })}
          </Section>
          {td.options?.expirations?.length > 0 && (
            <Section title="OPTIONS INTELLIGENCE" icon="⚩">
              <div style={{ color:'#4a5c7a',fontSize:10,marginBottom:8 }}>UPCOMING EXPIRATIONS</div>
              {(td.options.expirations||[]).slice(0,3).map(exp => (
                <div key={exp} style={{ color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',padding:'2px 0' }}>{exp}</div>
              ))}
              {td.options.atmCalls?.length > 0 && (
                <>
                  <div style={{ color:'#10b981',fontSize:10,fontFamily:'"DM Mono",monospace',marginTop:10,marginBottom:6 }}>ATM CALLS</div>
                  {td.options.atmCalls.slice(0,2).map((c,i) => (
                    <div key={i} style={{ background:'rgba(16,185,129,0.05)',borderRadius:6,padding:'6px 8px',marginBottom:4 }}>
                      <div style={{ display:'flex',justifyContent:'space-between' }}>
                        <span style={{ color:'#10b981',fontSize:11,fontFamily:'"DM Mono",monospace' }}>${c.strike} call</span>
                        <span style={{ color:'#8b9fc0',fontSize:11 }}>ask: ${c.ask?.toFixed(2)}</span>
                      </div>
                      {c.iv && <div style={{ color:'#2d3d50',fontSize:10 }}>IV: {(c.iv*100).toFixed(0)}% | OI: {c.oi}</div>}
                    </div>
                  ))}
                </>
              )}
              {td.options.atmPuts?.length > 0 && (
                <>
                  <div style={{ color:'#ef4444',fontSize:10,fontFamily:'"DM Mono",monospace',marginTop:8,marginBottom:6 }}>ATM PUTS</div>
                  {td.options.atmPuts.slice(0,2).map((p,i) => (
                    <div key={i} style={{ background:'rgba(239,68,68,0.05)',borderRadius:6,padding:'6px 8px',marginBottom:4 }}>
                      <div style={{ display:'flex',justifyContent:'space-between' }}>
                        <span style={{ color:'#ef4444',fontSize:11,fontFamily:'"DM Mono",monospace' }}>${p.strike} put</span>
                        <span style={{ color:'#8b9fc0',fontSize:11 }}>ask: ${p.ask?.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </Section>
          )}
          {td.news?.length > 0 && (
            <Section title="NEWS & SENTIMENT" icon="📰">
              {td.news.map((n, i) => (
                <div key={i} style={{ paddingBottom:10,marginBottom:10,borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ color:'#c4cfe0',fontSize:11,lineHeight:1.5,marginBottom:3 }}>{n.title}</div>
                  <div style={{ color:'#2d3d50',fontSize:10 }}>{n.publisher} · {n.age}</div>
                </div>
              ))}
            </Section>
          )}
          <Section title="AI SYNTHESIS" icon="🧠">
            {!analysis && (
              <div style={{ color:'#4a5c7a',fontSize:12,fontFamily:'"DM Mono",monospace',animation:'pulse 1.5s infinite' }}>
                Running 100 analyst frameworks...
              </div>
            )}
            {analysis && (
              <div style={{ color:'#c4cfe0',fontSize:12,lineHeight:1.7,whiteSpace:'pre-wrap' }}>{analysis}</div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

export default function Charts() {
  const [sym, setSym] = useState('SPY')
  const [inp, setInp] = useState('SPY')
  const [tf, setTf] = useState(TFS[3])
  const [candles, setCandles] = useState([])
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState([])
  const [overlays, setOverlays] = useState(['EMA21','EMA50'])
  const [showPanel, setShowPanel] = useState(true)
  const chartDiv = useRef(null)
  const chartRef = useRef(null)
  const candleRef = useRef(null)
  const ovRef = useRef({})
  const stRef = useRef(null)

  useEffect(() => {
    if (window.LightweightCharts) { initChart(); return }
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
    s.onload = () => initChart()
    document.head.appendChild(s)
  }, [])

  function initChart() {
    if (!chartDiv.current || chartRef.current) return
    const { createChart } = window.LightweightCharts
    chartRef.current = createChart(chartDiv.current, {
      layout: { background: { color: '#0d1420' }, textColor: '#8b9fc0' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
      handleScroll: true, handleScale: true,
    })
    candleRef.current = chartRef.current.addCandlestickSeries({
      upColor:'#10b981', downColor:'#ef4444', borderUpColor:'#10b981',
      borderDownColor:'#ef4444', wickUpColor:'#10b981', wickDownColor:'#ef4444',
    })
    const ro = new ResizeObserver(() => {
      if (chartDiv.current && chartRef.current)
        chartRef.current.applyOptions({ width: chartDiv.current.clientWidth, height: chartDiv.current.clientHeight })
    })
    ro.observe(chartDiv.current)
  }

  const fetchData = useCallback(async () => {
    if (!sym) return
    setLoading(true); setError(null)
    try {
      const to = new Date().toISOString().split('T')[0]
      const fr = new Date(Date.now()-tf.days*24*60*60*1000).toISOString().split('T')[0]
      const [aggs, snap] = await Promise.all([
        fetch('/api/market?type=aggs&symbol='+sym+'&timespan='+tf.ts+'&multiplier='+tf.m+'&from='+fr+'&to='+to+'&limit='+tf.lim).then(r=>r.json()),
        fetch('/api/market?type=snapshot&symbol='+sym).then(r=>r.json()),
      ])
      setCandles(aggs.candles||[]); setQuote(snap)
      if (!chartRef.current) { initChart(); await new Promise(r=>setTimeout(r,100)) }
      if (!candleRef.current) return
      candleRef.current.setData(aggs.candles||[])
      Object.values(ovRef.current).forEach(s=>{try{chartRef.current.removeSeries(s)}catch(e){}})
      ovRef.current = {}
      overlays.forEach(o => {
        if (!aggs.candles?.length) return
        const data = o.startsWith('EMA') ? calcEMA(aggs.candles, parseInt(o.replace('EMA',''))) : o==='VWAP' ? calcVWAP(aggs.candles) : []
        if (data.length) {
          const s = chartRef.current.addLineSeries({color:COLS[o],lineWidth:1.5,priceLineVisible:false,lastValueVisible:true,title:o})
          s.setData(data); ovRef.current[o] = s
        }
      })
      chartRef.current.timeScale().fitContent()
    } catch(err) { setError(err.message) }
    finally { setLoading(false) }
  }, [sym, tf, overlays])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!candles.length || !chartRef.current) return
    Object.values(ovRef.current).forEach(s=>{try{chartRef.current.removeSeries(s)}catch(e){}})
    ovRef.current = {}
    overlays.forEach(o => {
      const data = o.startsWith('EMA') ? calcEMA(candles, parseInt(o.replace('EMA',''))) : o==='VWAP' ? calcVWAP(candles) : []
      if (data.length && chartRef.current) {
        const s = chartRef.current.addLineSeries({color:COLS[o],lineWidth:1.5,priceLineVisible:false,lastValueVisible:true,title:o})
        s.setData(data); ovRef.current[o] = s
      }
    })
  }, [overlays])

  function doSearch(v) {
    setInp(v); clearTimeout(stRef.current)
    if (v.length < 2) { setResults([]); return }
    stRef.current = setTimeout(async () => {
      const r = await fetch('/api/market?type=search&q='+v).then(r=>r.json()).catch(()=>({results:[]}))
      setResults(r.results||[])
    }, 280)
  }

  const isUp = quote ? quote.change >= 0 : true
  const chgCol = isUp ? '#10b981' : '#ef4444'

  return (
    <div style={{ display:'flex',height:'100%',background:'#080c14',overflow:'hidden' }}>
      <style>{`.tfb{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:5px 12px;color:#8b9fc0;font-family:"DM Mono",monospace;font-size:11px;cursor:pointer}.tfb:hover,.tfb.act{background:rgba(37,99,235,.15);border-color:rgba(37,99,235,.4);color:#60a5fa}.ovb{border:1px solid rgba(255,255,255,.06);border-radius:6px;padding:4px 10px;font-family:"DM Mono",monospace;font-size:10px;cursor:pointer}.ovb.on{border-color:currentColor}.sr{padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px;display:flex;align-items:center;justify-content:space-between}.sr:hover{background:rgba(255,255,255,.04)}`}</style>
      <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
        <div style={{ padding:'20px 24px 16px',flexShrink:0 }}>
          <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,gap:16,flexWrap:'wrap' }}>
            <div>
              <h1 style={{ fontFamily:'"Syne",sans-serif',fontSize:24,fontWeight:800,margin:'0 0 4px' }}>Charts</h1>
              {quote && (
                <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                  <span style={{ fontSize:24,fontWeight:700 }}>${quote.price?.toFixed(2)}</span>
                  <span style={{ color:chgCol,fontSize:13,fontFamily:'"DM Mono",monospace' }}>
                    {isUp ? '➲ ' : '➼ '}{Math.abs(quote.change||0).toFixed(2)} ({Math.abs(quote.changePct||0).toFixed(2)}%)
                  </span>
                  {quote.volume > 0 && <span style={{ color:'#4a5c7a',fontSize:11,fontFamily:'"DM Mono",monospace' }}>Vol: {(quote.volume/1e6).toFixed(1)}M</span>}
                </div>
              )}
            </div>
            <div style={{ display:'flex',gap:10,alignItems:'center' }}>
              <div style={{ position:'relative',minWidth:180 }}>
                <input
                  value={inp}
                  onChange={e => doSearch(e.target.value)}
                  onKeyDown={e => { if(e.key==='Enter') { setSym(inp.toUpperCase()); setResults([]) } }}
                  placeholder="Search ticker..."
                  style={{ width:'100%',background:'#111927',border:'1.5px solid rgba(255,255,255,.1)',borderRadius:10,padding:'9px 14px',color:'#f0f4ff',fontSize:13,outline:'none',fontFamily:'"DM Mono",monospace',textTransform:'uppercase' }}
                />
                {results.length > 0 && (
                  <div style={{ position:'absolute',top:'100%',left:0,right:0,background:'#111927',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,zIndex:100,maxHeight:220,overflowY:'auto',marginTop:4,boxShadow:'0 8px 32px rgba(0,0,0,.5)' }}>
                    {results.map(r => (
                      <div key={r.symbol} className="sr" onClick={() => { setSym(r.symbol); setInp(r.symbol); setResults([]) }}>
                        <span style={{ color:'#f0f4ff',fontFamily:'"DM Mono",monospace',fontWeight:600 }}>{r.symbol}</span>
                        <span style={{ color:'#4a5c7a',fontSize:11 }}>{r.name?.substring(0,22)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowPanel(p => !p)}
                style={{ padding:'9px 16px',background:showPanel?'rgba(37,99,235,0.15)':'rgba(255,255,255,0.04)',border:'1px solid '+(showPanel?'rgba(37,99,235,0.4)':'rgba(255,255,255,0.1)'),borderRadius:9,color:showPanel?'#60a5fa':'#8b9fc0',fontSize:12,cursor:'pointer',fontFamily:'"DM Mono",monospace',whiteSpace:'nowrap' }}
              >
                🧠 �{showPanel ? 'Hide Analysis' : 'Show Analysis'}
              </button>
            </div>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' }}>
            <div style={{ display:'flex',gap:4 }}>
              {TFS.map(t => <button key={t.label} className={'tfb'+(tf.label===t.label?' act':'')} onClick={() => setTf(t)}>{t.label}</button>)}
            </div>
            <div style={{ width:1,height:20,background:'rgba(255,255,255,.07)' }}/>
            <div style={{ display:'flex',gap:4,alignItems:'center' }}>
              <span style={{ color:'#2d3d50',fontSize:10,fontFamily:'"DM Mono",monospace' }}>OVERLAYS</span>
              {OVS.map(o => (
                <button key={o} className={'ovb'+(overlays.includes(o)?' on':'')} style={{ color:overlays.includes(o)?COLS[o]:'#4a5c7a' }}
                  onClick={() => setOverlays(p => p.includes(o) ? p.filter(x=>x!==o) : [...p,o])}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex:1,position:'relative',margin:'0 24px',borderRadius:14,overflow:'hidden',border:'1px solid rgba(255,255,255,.07)',minHeight:0 }}>
          {loading && (
            <div style={{ position:'absolute',inset:0,background:'rgba(8,12,20,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10,color:'#8b9fc0',fontFamily:'"DM Mono",monospace',}}>
              Loading {sym}...
            </div>
          )}
          <div ref={chartDiv} style={{ width:'100%',height:'100%' }}/>
        </div>
        {candles.length > 0 && (
          <div style={{ margin:'8px 24px 16px',background:'#0d1420',border:'1px solid rgba(255,255,255,.07)',borderRadius:12,padding:'12px 16px',flexShrink:0 }}>
            <div style={{ color:'#2d3d50',fontSize:10,fontFamily:'"DM Mono",monospace',marginBottom:8 }}>VOLUME</div>
            <div style={{ display:'flex',alignItems:'flex-end',gap:1,height:48 }}>
              {candles.slice(-60).map((c,i) => {
                const mx = Math.max(...candles.slice(-60).map(x=>x.volume||0))
                const h = mx > 0 ? (c.volume/mx)*48 : 0
                const g = i > 0 && c.close >= candles[candles.length-60+i-1]?.close
                return <div key={i} style={{ flex:1,height:h,background:g?'rgba(16,185,129,.4)':'rgba(239,68,68,.4)',borderRadius:'2px 2px 0 0',alignSelf:'flex-end',minWidth:1 }}/>
              })}
            </div>
          </div>
        )}
        {error && (
          <div style={{ margin:'0 24px 16px',background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:10,padding:'10px 14px',color:'#fca5a5',fontSize:12,flexShrink:0 }}>
            {error}
          </div>
        )}
      </div>
      {showPanel && <AnalysisPanel symbol={sym} onClose={() => setShowPanel(false)} />}
    </div>
  )
}
