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

function ema(data, p) {
  const k = 2 / (p + 1); let e = data[0]?.close
  return data.map((d,i) => { if(i===0) return {time:d.time,value:e}; e=d.close*k+e*(1-k); return {time:d.time,value:parseFloat(e.toFixed(4))} })
}
function vwap(data) {
  let cPV=0,cV=0
  return data.map(c => { const tp=(c.high+c.low+c.close)/3; cPV+=tp*(c.volume||1); cV+=(c.volume||1); return {time:c.time,value:parseFloat((cPV/cV).toFixed(4))} })
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
  const [aiText, setAiText] = useState('')
  const [aiLoad, setAiLoad] = useState(false)
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
      upColor:'#10b981', downColor:'#ef4444',
      borderUpColor:'#10b981', borderDownColor:'#ef4444',
      wickUpColor:'#10b981', wickDownColor:'#ef4444',
    })
    const ro = new ResizeObserver(() => {
      if (chartDiv.current && chartRef.current) chartRef.current.applyOptions({ width: chartDiv.current.clientWidth, height: chartDiv.current.clientHeight })
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
        const data = o.startsWith('EMA') ? ema(aggs.candles,parseInt(o.replace('EMA',''))) : o==='VWAP' ? vwap(aggs.candles) : []
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
      const data = o.startsWith('EMA') ? ema(candles,parseInt(o.replace('EMA',''))) : o==='VWAP' ? vwap(candles) : []
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

  async function aiAnalyze() {
    if (!candles.length || aiLoad) return
    setAiLoad(true); setAiText('')
    const rc = candles.slice(-20)
    const last = rc[rc.length-1], first = rc[0]
    const pct = (((last.close-first.close)/first.close)*100).toFixed(2)
    const prompt = 'Analyze '+sym+' chart. Price: $'+(quote?.price?.toFixed(2)||last.close)+'. '+tf.label+' timeframe. Last 20 candles: $'+first.open.toFixed(2)+' -> $'+last.close.toFixed(2)+' ('+pct+'%). High: $'+Math.max(...rc.map(c=>c.high)).toFixed(2)+', Low: $'+Math.min(...rc.map(c=>c.low)).toFixed(2)+'. Overlays: '+overlays.join(',')+'. Provide: (1) technical structure, (2) key levels, (3) setup quality, (4) trade thesis.'
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const r = await fetch('/api/ai', {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s?.access_token},body:JSON.stringify({messages:[{role:'user',content:prompt}],mode:'general'})})
      const reader = r.body.getReader(); const dec = new TextDecoder(); let txt = ''
      while(true) {
        const {done,value} = await reader.read(); if(done) break
        dec.decode(value).split('\n').filter(l=>l.startsWith('data: ')).forEach(l=>{
          try { const d=JSON.parse(l.slice(6)); if(d.text){txt+=d.text;setAiText(txt)} } catch(e) {}
        })
      }
    } catch(err) { setAiText('Error: '+err.message) }
    finally { setAiLoad(false) }
  }

  const isUp = quote ? quote.change >= 0 : true
  const chgCol = isUp ? '#10b981' : '#ef4444'

  return (
    <div style={{padding:'28px 32px',minHeight:'100vh',background:'#080c14',color:'#f0f4ff',fontFamily:'"DM Sans",sans-serif'}}>
      <style>{`.tfb{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:5px 12px;color:#8b9fc0;font-family:"DM Mono",monospace;font-size:11px;cursor:pointer}.tfb:hover,.tfb.act{background:rgba(37,99,235,.15);border-color:rgba(37,99,235,.4);color:#60a5fa}.ovb{border:1px solid rgba(255,255,255,.06);border-radius:6px;padding:4px 10px;font-family:"DM Mono",monospace;font-size:10px;cursor:pointer;transition:all .15s}.ovb.on{border-color:currentColor}.sr{padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px;display:flex;align-items:center;justify-content:space-between}.sr:hover{background:rgba(255,255,255,.04)}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,gap:20,flexWrap:'wrap'}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:28,fontWeight:800,margin:0}}>Charts</h1>
          {quote&&<div style={{display:'flex',alignItems:'center',gap:16,marginTop:6}}>
            <span style={{fontSize:28,fontWeight:700}}>${quote.price?.toFixed(2)}</span>
            <span style={{color:chgCol,fontSize:15,fontFamily:'"DM Mono",monospace'}}>{isUp?'▲':'▼'} ${Math.abs(quote.change||0).toFixed(2)} ({Math.abs(quote.changePct||0).toFixed(2)}%)</span>
            {quote.volume>0&&<span style={{color:'#4a5c7a',fontSize:12,fontFamily:'"DM Mono",monospace'}}>Vol: {(quote.volume/1e6).toFixed(1)}M</span>}
          </div>}
        </div>
        <div style={{position:'relative',minWidth:220}}>
          <input value={inp} onChange={e=>doSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){setSym(inp.toUpperCase());setResults([])}}} placeholder="Search ticker..." style={{width:'100%',background:'#111927',border:'1.5px solid rgba(255,255,255,.1)',borderRadius:10,padding:'10px 16px',color:'#f0f4ff',fontSize:14,outline:'none',fontFamily:'"DM Mono",monospace',textTransform:'uppercase'}}/>
          {results.length>0&&<div style={{position:'absolute',top:'100%',insetInline:0,background:'#111927',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,zIndex:100,maxHeight:240,overflowY:'auto',marginTop:4,boxShadow:'0 8px 32px rgba(0,0,0,.5)'}}>
            {results.map(r=><div key={r.symbol} className="sr" onClick={()=>{setSym(r.symbol);setInp(r.symbol);setResults([])}}>
              <span style={{color:'#f0f4ff',fontFamily:'"DM Mono",monospace',fontWeight:600}}>{r.symbol}</span>
              <span style={{color:'#4a5c7a',fontSize:11,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>
            </div>)}
          </div>}
        </div>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:4}}>{TFS.map(t=><button key={t.label} className={'tfb'+(tf.label===t.label?' act':'')} onClick={()=>setTf(t)}>{t.label}</button>)}</div>
        <div style={{width:1,height:24,background:'rgba(255,255,255,.07)'}}/>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <span style={{color:'#2d3d50',fontSize:10,fontFamily:'"DM Mono",monospace'}}>OVERLAYS</span>
          {OVS.map(o=><button key={o} className={'ovb'+(overlays.includes(o)?' on':'')} style={{color:overlays.includes(o)?COLS[o]:'#4a5c7a'}} onClick={()=>setOverlays(p=>p.includes(o)?p.filter(x=>x!==o):[...p,o])}>{o}</button>)}
        </div>
        <div style={{flex:1}}/>
        <button onClick={aiAnalyze} disabled={aiLoad||loading||!candles.length} style={{padding:'8px 18px',background:aiLoad?'rgba(37,99,235,.2)':'rgba(37,99,235,.15)',border:'1px solid rgba(37,99,235,.4)',borderRadius:8,color:'#60a5fa',fontSize:12,fontFamily:'"DM Mono",monospace',cursor:'pointer',display:'flex',alignItems:'center',gap:7}}>
          {aiLoad?<><span style={{width:12,height:12,borderRadius:'50%',border:'2px solid rgba(96,165,250,.3)',borderTopColor:'#60a5fa',animation:'spin .6s linear infinite',flexShrink:0}}/>Analyzing...</>:'⚡ AI Analysis'}
        </button>
      </div>

      <div style={{position:'relative',borderRadius:14,overflow:'hidden',border:'1px solid rgba(255,255,255,.07)',marginBottom:16}}>
        {loading&&<div style={{position:'absolute',inset:0,background:'rgba(8,12,20,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10,color:'#8b9fc0',fontFamily:'"DM Mono",monospace',fontSize:13}}>Loading {sym}...</div>}
        <div ref={chartDiv} style={{width:'100%',height:480}}/>
      </div>

      {candles.length>0&&<div style={{background:'#0d1420',border:'1px solid rgba(255,255,255,.07)',borderRadius:14,padding:'16px 20px',marginBottom:16}}>
        <div style={{color:'#4a5c7a',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:10}}>VOLUME</div>
        <div style={{display:'flex',alignItems:'flex-end',gap:1,height:60}}>
          {candles.slice(-60).map((c,i)=>{const mx=Math.max(...candles.slice(-60).map(x=>x.volume||0));const h=mx>0?(c.volume/mx)*60:0;const g=i>0&&c.close>=candles[candles.length-60+i-1]?.close;return <div key={i} style={{flex:1,height:h,background:g?'rgba(16,185,129,.4)':'rgba(239,68,68,.4)',borderRadius:'2px 2px 0 0',alignSelf:'flex-end',minWidth:1}}/>})}
        </div>
      </div>}

      {(aiText||aiLoad)&&<div style={{background:'linear-gradient(135deg,rgba(37,99,235,.08),rgba(124,58,237,.06))',border:'1px solid rgba(37,99,235,.2)',borderRadius:14,padding:'20px 24px'}}>
        <div style={{color:'#60a5fa',fontSize:12,fontFamily:'"DM Mono",monospace',marginBottom:14}}>⚡ AI ANALYSIS — {sym}</div>
        <div style={{color:'#c4cfe0',fontSize:14,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{aiText||<span style={{color:'#4a5c7a'}}>Generating analysis...</span>}</div>
      </div>}

      {error&&<div style={{background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:10,padding:'12px 16px',color:'#fca5a5',fontSize:13}}>{error} — Check Polygon API key.</div>}
    </div>
  )
}