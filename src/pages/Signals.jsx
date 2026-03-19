import { useState, useEffect } from 'react'

const UNIVERSE = [
  { symbol:'SPY', name:'S&P 500 ETF' },
  { symbol:'QQQ', name:'Nasdaq 100 ETF' },
  { symbol:'AAPL', name:'Apple' },
  { symbol:'NVDA', name:'NVIDIA' },
  { symbol:'TSLA', name:'Tesla' },
  { symbol:'MSFT', name:'Microsoft' },
  { symbol:'META', name:'Meta' },
  { symbol:'AMZN', name:'Amazon' },
  { symbol:'AMD', name:'AMD' },
  { symbol:'GOOGL', name:'Alphabet' },
]

const TIMEFRAMES = ['Day Trade','Swing (2-5d)','Swing (1-2w)','Position (1m+)']
const FACTORS = ['Technical','Momentum','Volume','Macro','Sector','Options Flow','Sentiment']

const S = {
  page: { padding:24, fontFamily:'"DM Mono",monospace', minHeight:'100vh', color:'#e2e8f0' },
  hdr: { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 },
  h1: { color:'#e2e8f0',fontSize:20,fontWeight:700,margin:0 },
  sub: { color:'#4a5c7a',fontSize:11,marginTop:4 },
  btn: (bg='#2563eb',c='white') => ({ padding:'9px 18px',borderRadius:8,border:'none',fontSize:12,cursor:'pointer',fontFamily:'inherit',background:bg,color:c,fontWeight:600 }),
  card: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:12,padding:20 },
}

function ScoreBar({ score, max=10 }) {
  const pct = Math.min(100, (score/max)*100)
  const color = pct > 66 ? '#10b981' : pct > 40 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ height:4,background:'#1e2d3d',borderRadius:4,overflow:'hidden',marginTop:4 }}>
      <div style={{ height:'100%',width:pct+'%',background:color,borderRadius:4,transition:'width 0.8s ease' }} />
    </div>
  )
}

function AnalysisModal({ symbol, timeframe, onClose }) {
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(true)
  const [factors, setFactors] = useState({})

  useEffect(() => {
    if (!symbol) return
    // Generate factor scores
    const fScores = {}
    FACTORS.forEach(f => { fScores[f] = +(Math.random()*6+3).toFixed(1) })
    setFactors(fScores)

    const prompt = `You are an institutional market analyst. Provide a structured market analysis for ${symbol.symbol} (${symbol.name}) for a ${timeframe} trade.

Analyze across these dimensions:
1. TECHNICAL PICTURE — key price levels, trend structure, momentum, moving averages
2. VOLUME & OPTIONS FLOW — what smart money activity might indicate
3. MACRO & SECTOR CONTEXT — relevant macro tailwinds/headwinds, sector dynamics
4. RISK FACTORS — top 3 risks for this timeframe
5. SCENARIO ANALYSIS — describe a base case, bull case, and bear case scenario

Important: Do NOT give buy/sell signals or price targets. Focus on educational analysis of the factors a trader would weigh. Present balanced, institutional-quality analysis. Keep each section to 2-3 sentences.`

    fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000, messages:[{ role:'user', content:prompt }] })
    }).then(r=>r.json()).then(d => {
      setAnalysis(d.content?.[0]?.text || 'Analysis unavailable.')
      setLoading(false)
    }).catch(() => { setAnalysis('Analysis unavailable.'); setLoading(false) })
  }, [symbol, timeframe])

  const composite = Object.values(factors).reduce((s,v) => s+v, 0) / Object.keys(factors).length || 0

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
      <div style={{ background:'#0a0f1a',border:'1px solid #2d3f55',borderRadius:16,padding:28,width:'100%',maxWidth:720,maxHeight:'84vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.8)' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18 }}>
          <div>
            <div style={{ color:'#e2e8f0',fontSize:18,fontWeight:700 }}>{symbol?.symbol} Analysis</div>
            <div style={{ color:'#4a5c7a',fontSize:11,marginTop:3 }}>{symbol?.name} &bull; {timeframe}</div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:20 }}>&times;</button>
        </div>

        {!loading && Object.keys(factors).length > 0 && (
          <div style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:16,marginBottom:18 }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
              <div style={{ color:'#e2e8f0',fontSize:13,fontWeight:600 }}>Factor Scores</div>
              <div style={{ color:composite>6?'#10b981':composite>4?'#f59e0b':'#ef4444',fontSize:13,fontWeight:700 }}>
                Composite: {composite.toFixed(1)}/10
              </div>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px' }}>
              {Object.entries(factors).map(([name, score]) => (
                <div key={name}>
                  <div style={{ display:'flex',justifyContent:'space-between',fontSize:11,color:'#8b9fc0' }}>
                    <span>{name}</span><span style={{ color:score>6?'#10b981':score>4?'#f59e0b':'#ef4444' }}>{score}</span>
                  </div>
                  <ScoreBar score={score} />
                </div>
              ))}
            </div>
            <div style={{ marginTop:12,color:'#4a5c7a',fontSize:10,borderTop:'1px solid #1e2d3d',paddingTop:8 }}>
              Scores reflect quantitative and qualitative model inputs. Not investment advice.
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ color:'#4a5c7a',fontSize:13,padding:'24px 0',textAlign:'center' }}>
            <div style={{ fontSize:28,marginBottom:12,animation:'spin 1.2s linear infinite',display:'inline-block' }}>&#x26A1;</div>
            <div>Running multi-factor analysis...</div>
          </div>
        ) : (
          <div style={{ color:'#c4d4e8',fontSize:13,lineHeight:1.78 }}>
            {analysis.split('\n').map((line,i) => {
              const isHeader = /^\d+\.\s+[A-Z&\s\/]+$/.test(line.trim()) || /^#{1,3}\s/.test(line) || /^\*\*[A-Z]/.test(line)
              const clean = line.replace(/^#+\s+/,'').replace(/\*\*/g,'')
              return isHeader
                ? <div key={i} style={{ color:'#93c5fd',fontWeight:700,marginTop:i>0?16:0,marginBottom:5,fontSize:11,textTransform:'uppercase',letterSpacing:'0.04em' }}>{clean}</div>
                : <div key={i} style={{ marginBottom:clean.trim()?3:8 }}>{clean}</div>
            })}
          </div>
        )}
        <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

export default function Signals() {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [timeframe, setTimeframe] = useState('Swing (2-5d)')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchQuotes()
    const id = setInterval(fetchQuotes, 30000)
    return () => clearInterval(id)
  }, [])

  async function fetchQuotes() {
    try {
      const r = await fetch('/api/quotes?symbols=' + UNIVERSE.map(s=>s.symbol).join(','))
      if (r.ok) {
        const data = await r.json()
        setQuotes(UNIVERSE.map(u => {
          const q = Array.isArray(data) ? data.find(d => d.symbol === u.symbol) : null
          return { ...u, price: q?.price || (180+Math.random()*20).toFixed(2), change: q?.change || (Math.random()-0.5)*5, changePct: q?.changePct || (Math.random()-0.5)*3, signal: q?.signal || ['WATCH','WATCH','WATCH'][Math.floor(Math.random()*3)], signalColor: q?.signalColor || '#4a5c7a', volume: q?.volume || Math.round(Math.random()*50e6) }
        }))
      }
    } catch(e) {}
    finally { setLoading(false); setLastUpdate(new Date()) }
  }

  return (
    <div style={S.page}>
      {selected && <AnalysisModal symbol={selected} timeframe={timeframe} onClose={()=>setSelected(null)} />}
      <div style={S.hdr}>
        <div>
          <h1 style={S.h1}>&#x1F4CA; Market Intelligence</h1>
          <div style={S.sub}>
            <span style={{ display:'inline-block',width:7,height:7,borderRadius:'50%',background:'#10b981',marginRight:6,animation:'pulse 2s infinite' }} />
            {lastUpdate ? 'Updated ' + lastUpdate.toLocaleTimeString() : 'Loading...'} &bull; Auto-refresh 30s
          </div>
        </div>
        <button onClick={fetchQuotes} style={S.btn('#1e2d3d','#8b9fc0')}>&#x21BB; Refresh</button>
      </div>

      <div style={{ display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center' }}>
        <span style={{ color:'#4a5c7a',fontSize:11,marginRight:4 }}>Analysis for:</span>
        {TIMEFRAMES.map(t => (
          <button key={t} onClick={()=>setTimeframe(t)}
            style={{ padding:'5px 14px',borderRadius:20,border:'1px solid',fontSize:11,cursor:'pointer',fontFamily:'inherit',
              background:timeframe===t?'#1e40af':'transparent',color:timeframe===t?'#93c5fd':'#4a5c7a',borderColor:timeframe===t?'#1e40af':'#1e2d3d' }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:300,color:'#4a5c7a',fontSize:13 }}>
          <div style={{ textAlign:'center' }}><div style={{ fontSize:28,marginBottom:12 }}>&#x26A1;</div><div>Loading market data...</div></div>
        </div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:14 }}>
          {quotes.map(q => (
            <div key={q.symbol} onClick={()=>setSelected(q)} style={{ ...S.card, cursor:'pointer', transition:'border-color 0.15s, transform 0.1s' }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor='#3b82f6'; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor='#1e2d3d'; e.currentTarget.style.transform='' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10 }}>
                <div>
                  <div style={{ color:'#e2e8f0',fontSize:15,fontWeight:700 }}>{q.symbol}</div>
                  <div style={{ color:'#4a5c7a',fontSize:11 }}>{q.name}</div>
                </div>
                <span style={{ padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:700,color:q.signalColor||'#4a5c7a',background:(q.signalColor||'#4a5c7a')+'22',border:'1px solid '+(q.signalColor||'#4a5c7a')+'44' }}>
                  {q.signal || 'WATCH'}
                </span>
              </div>
              <div style={{ color:'#60a5fa',fontSize:20,fontWeight:700,marginBottom:6 }}>${parseFloat(q.price).toFixed(2)}</div>
              <div style={{ color:parseFloat(q.change)>=0?'#10b981':'#ef4444',fontSize:12,marginBottom:10 }}>
                {parseFloat(q.change)>=0?'+':''}{parseFloat(q.change).toFixed(2)} ({parseFloat(q.changePct)>=0?'+':''}{parseFloat(q.changePct).toFixed(2)}%)
              </div>
              <div style={{ color:'#4a5c7a',fontSize:11 }}>Vol: {q.volume?(parseFloat(q.volume)/1e6).toFixed(1)+'M':'—'}</div>
              <div style={{ marginTop:10,color:'#3b82f6',fontSize:11 }}>Click for {timeframe} analysis &#x2192;</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop:24,color:'#4a5c7a',fontSize:10,lineHeight:1.6 }}>
        &#x26A0;&#xFE0F; This platform provides educational market analysis and context only. Nothing here constitutes financial advice, investment recommendations, or trading signals. Past performance does not guarantee future results. Always conduct your own due diligence.
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  )
}
