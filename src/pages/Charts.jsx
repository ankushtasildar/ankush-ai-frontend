import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

const POPULAR = ['SPY','QQQ','NVDA','AAPL','MSFT','META','TSLA','AMZN','GOOGL','AMD','PLTR','CRWD','COIN','JPM','GS']

export default function Charts() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initSymbol = (searchParams.get('symbol') || 'SPY').toUpperCase()
  const [symbol, setSymbol] = useState(initSymbol)
  const [input, setInput] = useState(initSymbol)
  const [interval, setIntervalState] = useState('D')
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const containerRef = useRef(null)
  const widgetRef = useRef(null)

  const INTERVALS = [
    {label:'1m',  tv:'1'},
    {label:'5m',  tv:'5'},
    {label:'15m', tv:'15'},
    {label:'1h',  tv:'60'},
    {label:'4h',  tv:'240'},
    {label:'1D',  tv:'D'},
    {label:'1W',  tv:'W'},
    {label:'1M',  tv:'M'},
  ]

  const loadWidget = useCallback((sym, iv) => {
    if (!containerRef.current) return
    // Clear previous
    containerRef.current.innerHTML = ''
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.type = 'text/javascript'
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: sym,
      interval: iv,
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(13,13,17,1)',
      gridColor: 'rgba(255,255,255,0.04)',
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      studies: ['STD;RSI','STD;MACD','STD;Volume'],
      support_host: 'https://www.tradingview.com',
      container_id: 'tv_chart_container',
    })
    const div = document.createElement('div')
    div.className = 'tradingview-widget-container__widget'
    div.style.cssText = 'height:calc(100% - 32px);width:100%'
    const copyright = document.createElement('div')
    copyright.className = 'tradingview-widget-copyright'
    copyright.innerHTML = '<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span style="color:#6b7280;font-size:11px">Charts by TradingView</span></a>'
    containerRef.current.appendChild(div)
    containerRef.current.appendChild(copyright)
    containerRef.current.appendChild(script)
    widgetRef.current = script
  }, [])

  useEffect(() => { loadWidget(symbol, interval) }, [symbol, interval, loadWidget])

  const handleGo = () => {
    const sym = input.trim().toUpperCase()
    if (!sym) return
    setSymbol(sym)
    navigate(`/app/charts?symbol=${sym}`, {replace:true})
  }

  const runAiAnalysis = async () => {
    setAiLoading(true)
    setAiAnalysis(null)
    try {
      const r = await fetch(`/api/analysis?type=single&symbol=${symbol}`, {signal:AbortSignal.timeout(60000)})
      const d = await r.json()
      setAiAnalysis(d.analysis || d.error || 'No analysis returned')
    } catch(e) { setAiAnalysis('Error: '+e.message) }
    setAiLoading(false)
  }

  const s = {
    page: {background:'var(--bg-base)',minHeight:'100vh',padding:'12px 16px',fontFamily:'var(--font)',color:'var(--text-primary)',display:'flex',flexDirection:'column',gap:12},
    header: {display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'},
    symbolInput: {background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-primary)',padding:'8px 14px',fontSize:16,fontWeight:700,width:120,letterSpacing:1,textTransform:'uppercase'},
    goBtn: {background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',cursor:'pointer',fontWeight:600,fontSize:14},
    intervalRow: {display:'flex',gap:4,flexWrap:'wrap'},
    ivBtn: (active) => ({background: active?'var(--accent)':'var(--bg-card)',color: active?'#fff':'var(--text-secondary)',border:'1px solid '+(active?'var(--accent)':'var(--border)'),borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:12,fontWeight:active?700:400}),
    aiBtn: {background:'linear-gradient(135deg,#7c3aed,#2563eb)',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontWeight:600,fontSize:13,marginLeft:'auto'},
    chartContainer: {flex:1,minHeight:600,borderRadius:12,overflow:'hidden',border:'1px solid var(--border)'},
    aiPanel: {background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:16},
    aiTitle: {fontSize:14,fontWeight:700,color:'var(--accent)',marginBottom:8},
    aiText: {fontSize:13,color:'var(--text-secondary)',lineHeight:1.7,whiteSpace:'pre-wrap'},
    quickSymbols: {display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'},
    qsLabel: {fontSize:12,color:'var(--text-muted)',marginRight:4},
    qsBtn: {background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text-secondary)',padding:'3px 8px',cursor:'pointer',fontSize:12},
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <input
          style={s.symbolInput}
          value={input}
          onChange={e=>setInput(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==='Enter'&&handleGo()}
          placeholder="NVDA"
        />
        <button style={s.goBtn} onClick={handleGo}>Go</button>
        {/* Interval selector */}
        <div style={s.intervalRow}>
          {INTERVALS.map(iv => (
            <button key={iv.tv} style={s.ivBtn(interval===iv.tv)} onClick={()=>setIntervalState(iv.tv)}>
              {iv.label}
            </button>
          ))}
        </div>
        <button style={s.aiBtn} onClick={runAiAnalysis} disabled={aiLoading}>
          {aiLoading ? '⏳ Analyzing...' : '⚡ AI Analysis'}
        </button>
      </div>

      {/* Quick symbols */}
      <div style={s.quickSymbols}>
        <span style={s.qsLabel}>Quick:</span>
        {POPULAR.map(sym => (
          <button key={sym} style={s.qsBtn} onClick={()=>{setInput(sym);setSymbol(sym);navigate(`/app/charts?symbol=${sym}`,{replace:true})}}>
            {sym}
          </button>
        ))}
      </div>

      {/* TradingView Chart */}
      <div
        ref={containerRef}
        style={s.chartContainer}
        className="tradingview-widget-container"
        id="tv_chart_container"
      />

      {/* AI Analysis Panel */}
      {(aiAnalysis || aiLoading) && (
        <div style={s.aiPanel}>
          <div style={s.aiTitle}>⚡ AI Analysis — {symbol}</div>
          {aiLoading ? (
            <div style={{...s.aiText,color:'var(--text-muted)'}}>Fetching real prices and analyzing {symbol}...</div>
          ) : (
            <div style={s.aiText}>{aiAnalysis}</div>
          )}
        </div>
      )}
    </div>
  )
}