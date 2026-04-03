import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const fmt = (n, d=2) => n == null ? '--' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtPct = n => n == null ? '--' : (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
const pctColor = n => !n ? 'var(--text-muted)' : n > 0 ? 'var(--green)' : 'var(--red)'
const vixColor = v => !v ? 'var(--text-muted)' : v > 30 ? 'var(--red)' : v > 20 ? 'var(--yellow)' : 'var(--green)'

function TickerCard({ symbol, name, price, change, changePct, onClick }) {
  const up = changePct > 0, down = changePct < 0
  const border = up ? 'rgba(16,185,129,0.25)' : down ? 'rgba(239,68,68,0.25)' : 'var(--border)'
  return (
    <div onClick={onClick} style={{ background:'var(--bg-card)', border:'1px solid '+border, borderRadius:10, padding:'14px 16px', cursor:'pointer', flex:1, minWidth:150, position:'relative', overflow:'hidden', transition:'border-color 0.15s' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background: up?'var(--green)':down?'var(--red)':'var(--border)' }} />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, letterSpacing:0.5 }}>{symbol}</div>
          <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:1 }}>{name}</div>
        </div>
        <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:4, background: up?'var(--green-dim)':down?'var(--red-dim)':'rgba(255,255,255,0.04)', color: up?'var(--green)':down?'var(--red)':'var(--text-muted)' }}>
          {fmtPct(changePct)}
        </span>
      </div>
      <div style={{ fontSize:22, fontWeight:700, fontFamily:'var(--font-mono)', letterSpacing:-0.5 }}>
        {price ? '$'+fmt(price) : '--'}
      </div>
      {change != null && <div style={{ fontSize:11, color: up?'var(--green)':down?'var(--red)':'var(--text-muted)', marginTop:2, fontFamily:'var(--font-mono)' }}>{change>=0?'+':''}{fmt(change)}</div>}
    </div>
  )
}

function SectorRow({ name, change }) {
  const up = change > 0
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--border-dim)' }}>
      <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{name}</span>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ width:44, height:4, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
          <div style={{ height:'100%', width:Math.min(Math.abs(change||0)*10,100)+'%', background: up?'var(--green)':'var(--red)', borderRadius:2 }} />
        </div>
        <span style={{ fontSize:12, fontWeight:600, fontFamily:'var(--font-mono)', width:52, textAlign:'right', color: up?'var(--green)':'var(--red)' }}>{fmtPct(change)}</span>
      </div>
    </div>
  )
}

function SetupRow({ setup, onClick }) {
  const dir = (setup.direction||'long').toLowerCase()
  const conf = setup.confidence || setup.score || 75
  const c = dir==='long' ? 'var(--green)' : dir==='short' ? 'var(--red)' : 'var(--yellow)'
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:7, background:'var(--bg-elevated)', cursor:'pointer', marginBottom:4 }}>
      <div style={{ fontSize:13, fontWeight:700, minWidth:52 }}>{setup.symbol}</div>
      <span style={{ fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:3, background: dir==='long'?'var(--green-dim)':'var(--red-dim)', color:c, textTransform:'uppercase' }}>{dir}</span>
      <div style={{ flex:1, fontSize:11, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(setup.thesis||setup.reasoning||'').substring(0,45)}</div>
      <div style={{ fontSize:13, fontWeight:700, color: conf>=70?'var(--green)':conf>=50?'var(--yellow)':'var(--red)', fontFamily:'var(--font-mono)', minWidth:36, textAlign:'right' }}>{conf}%</div>
    </div>
  )
}

export default function Overview() {
  const nav = useNavigate()
  const [mkt, setMkt] = useState(null)
  const [setups, setSetups] = useState([])
  const [events, setEvents] = useState([])
  const [portfolio, setPortfolio] = useState({ trades:0, winRate:0 })
  const [loading, setLoading] = useState(true)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanUsed, setScanUsed] = useState(0)
  const [isPro, setIsPro] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [scanResults, setScanResults] = useState(null);
  const [deepAlert, setDeepAlert] = useState(null);

  const load = useCallback(async () => {
    try {
      const [mktR, qqR, iwR, cacheR, openR, eventsR] = await Promise.allSettled([
        fetch('/api/market?action=overview').then(r=>r.json()),
        fetch('/api/market?action=quote&symbol=QQQ').then(r=>r.json()),
        fetch('/api/market?action=quote&symbol=IWM').then(r=>r.json()),
        supabase.from('scan_cache').select('*').order('created_at',{ascending:false}).limit(1),
        supabase.from('setup_records').select('*').eq('status','open').limit(10),
        supabase.from('macro_events').select('*').order('event_date',{ascending:true}).limit(4)
      ])
      if (mktR.status==='fulfilled' && mktR.value && !mktR.value.error) {
        const raw = mktR.value
        const ctx = raw.context || {}
        setMkt({
          spy:  { price: raw.quote && raw.quote.price, change: ctx.spyChange ? (raw.quote.price * ctx.spyChange / 100) : (raw.quote && raw.quote.change), changePct: ctx.spyChange || (raw.quote && raw.quote.changePercent) || 0 },
          qqq:  qqR.status==='fulfilled' && qqR.value && qqR.value.price ? { price: qqR.value.price, change: qqR.value.change, changePct: qqR.value.changePercent || (qqR.value.change && qqR.value.price ? (qqR.value.change / qqR.value.price * 100) : 0) } : null,
          iwm:  iwR.status==='fulfilled' && iwR.value && iwR.value.price ? { price: iwR.value.price, change: iwR.value.change, changePct: iwR.value.changePercent || (iwR.value.change && iwR.value.price ? (iwR.value.change / iwR.value.price * 100) : 0) } : null,
          vix:  ctx.vix || (raw.vix && raw.vix.vix),
          mood: ctx.mood,
          sectors: raw.sectors || [],
          marketOpen: raw.marketOpen || ctx.marketOpen,
          regime: ctx.regime,
          leader: ctx.leader,
          laggard: ctx.laggard,
          advancing: ctx.advancing,
          declining: ctx.declining,
        })
      }
      if (cacheR.status==='fulfilled' && cacheR.value.data && cacheR.value.data[0]) setSetups(cacheR.value.data[0].setups||[])
      if (openR.status==='fulfilled' && openR.value.data) {
        const o = openR.value.data
        setPortfolio({ trades: o.length, winRate: o.length ? Math.round(o.filter(s=>(s.pnl||0)>0).length/o.length*100) : 0 })
      }
      if (eventsR.status==='fulfilled' && eventsR.value.data) setEvents(eventsR.value.data)
      setLastUpdate(new Date())
    } catch(e) { console.error('Overview load:', e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function runScan() {
    setScanLoading(true)
    try { await fetch('/api/analysis?action=scan&force=1') } catch(e) {}
    await load(); setScanLoading(false)
  }


  // P1: Auto-scan market and deep-scan top opportunity
  useEffect(() => {
    fetch('/api/market-scanner?action=scan')
      .then(r => r.json())
      .then(data => {
        setScanResults(data);
        if (data && data.opportunities && data.opportunities.length > 0) {
          const topSym = data.opportunities[0].symbol;
          fetch('/api/day-trade-engine?action=predict&symbol=' + topSym)
            .then(r2 => r2.json())
            .then(v3 => setDeepAlert(v3))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);
  const sp = mkt?.spy
  const qq = mkt?.qqq
  const iw = mkt?.iwm
  const vix = mkt?.vix
  const mood = mkt?.mood
  const sectors = mkt?.sectors || []
  const isOpen = mkt?.marketOpen
  const C = { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:14 }
  const ST = { fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1.2, marginBottom:10 }
  const LA = { fontSize:11, color:'var(--accent)', background:'none', border:'none', cursor:'pointer' }

  return (
    <div style={{ background:'var(--bg-base)', minHeight:'100vh', fontFamily:'var(--font)', color:'var(--text-primary)', paddingBottom:40 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg-card)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, letterSpacing:-0.5 }}>Market Overview</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>
              {isOpen ? <span style={{color:'var(--green)'}}>Market Open</span> : <span style={{color:'var(--text-muted)'}}>{mkt?.session?.label || '' + (new Date().getDay()===0||new Date().getDay()===6 ? 'Weekend' : 'After Hours') + ' \u2014 Last Session'}</span>}
              {lastUpdate && ' -- ' + lastUpdate.toLocaleTimeString()}
            </div>
          </div>
          {vix && (
            <div style={{ padding:'4px 10px', borderRadius:6, background: vix>30?'var(--red-dim)':vix>20?'var(--yellow-dim)':'var(--green-dim)' }}>
              <span style={{ fontSize:10, color:'var(--text-muted)' }}>VIX </span>
              <span style={{ fontSize:13, fontWeight:700, fontFamily:'var(--font-mono)', color:vixColor(vix) }}>{fmt(vix,2)}</span>
              {mood && <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:5 }}>-- {mood}</span>}
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>nav('/app/predict')} style={{ background:'linear-gradient(135deg,#7c3aed,#3b82f6)', color:'#fff', border:'none', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:600 }}>
            Alpha Intelligence
          </button>
          <button onClick={runScan} disabled={scanLoading} style={{ background:'var(--bg-elevated)', color:'var(--text-secondary)', border:'1px solid var(--border)', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:600 }}>
            {scanLoading ? 'Scanning...' : 'Run Scan'}
          </button>
        </div>
      </div>

      <div style={{ padding:'16px 20px' }}>
        {/* Priya: scan usage banner for free users */}
        {!isPro && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(37,99,235,0.06)', border:'1px solid rgba(37,99,235,0.12)', borderRadius:8, padding:'8px 14px', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ display:'flex', gap:3 }}>
                {[0,1].map(i => <div key={i} style={{ width:8, height:8, borderRadius:2, background: i < (2 - scanUsed) ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}/>)}
              </div>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>{Math.max(0, 2-scanUsed)} free scan{2-scanUsed!==1?'s':''} remaining today</span>
            </div>
            <a href="/billing" style={{ fontSize:11, color:'#3b82f6', fontWeight:600, textDecoration:'none' }}>Upgrade for unlimited </a>
          </div>
        )}
        
        {/* Index tickers */}
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <TickerCard symbol='SPY' name='S&P 500 ETF' price={sp?.price} change={sp?.change} changePct={sp?.changePct} onClick={()=>nav('/app/charts?symbol=SPY')} />
          <TickerCard symbol='QQQ' name='Nasdaq 100 ETF' price={qq?.price} change={qq?.change} changePct={qq?.changePct} onClick={()=>nav('/app/charts?symbol=QQQ')} />
          <TickerCard symbol='IWM' name='Russell 2000 ETF' price={iw?.price} change={iw?.change} changePct={iw?.changePct} onClick={()=>nav('/app/charts?symbol=IWM')} />
          {vix && (
            <div style={{ ...C, flex:1, minWidth:150, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:vixColor(vix)+'88' }} />
              <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>VIX</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:6 }}>Volatility Index</div>
              <div style={{ fontSize:22, fontWeight:700, fontFamily:'var(--font-mono)', color:vixColor(vix) }}>{fmt(vix,2)}</div>
              <div style={{ fontSize:11, color:vixColor(vix), marginTop:2, fontWeight:600 }}>{vix>30?'High Fear':vix>20?'Caution':'Low Fear'}</div>
            </div>
          )}
        </div>

        {/* Sentiment banner */}
        {mkt && (
          <div style={{ background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.12)', borderRadius:8, padding:'8px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:1 }}>SENTIMENT</span>
            <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{mkt.regime ? (mkt.regime + (mkt.leader ? ' \u2014 ' + mkt.leader + ' leading' : '')) : (vix > 30 ? 'Elevated fear \u2014 caution warranted' : vix > 20 ? 'Market cautious' : 'Low fear environment')}{mkt.advancing && mkt.declining ? ' \u2014 ' + mkt.advancing + ' advancing, ' + mkt.declining + ' declining' : ''}</span>
          </div>
        )}

        {/* 3-col grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
          {/* Sectors */}
          <div style={C}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={ST}>Sector Performance</div>
              <button style={LA} onClick={()=>nav('/app/sectors')}>View all</button>
            </div>
            {loading ? [...Array(6)].map((_,i)=>(<div key={i} style={{ height:20, background:'var(--bg-elevated)', borderRadius:4, marginBottom:4 }} />)) : sectors.length===0 ? (
              <div style={{ fontSize:12, color:'var(--text-muted)', padding:'6px 0' }}>No data -- run a scan</div>
            ) : sectors.slice(0,8).map((s,i)=>(
              <SectorRow key={i} name={s.name||s.sector||s.symbol} change={s.changePct||s.change||0} />
            ))}
          </div>
          {/* Setups */}
          <div style={C}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={ST}>Top Setups {setups.length>0 && <span style={{color:'var(--green)'}}>{setups.length}</span>}</div>
              <button style={LA} onClick={()=>nav('/app/setups')}>View all</button>
            </div>
          {/* P1: Scanner Results + V3 Deep Scan Alert */}
          {deepAlert && deepAlert.alert ? (
            <div style={{background: deepAlert.alert.direction === "BULLISH" ? "#0f3d0f" : "#3d0f0f", borderRadius: 12, padding: "14px 16px", marginBottom: 10, border: "1px solid " + (deepAlert.alert.direction === "BULLISH" ? "#1a6b1a" : "#6b1a1a")}}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6}}>
                <span style={{fontWeight: 700, fontSize: 15, color: deepAlert.alert.direction === "BULLISH" ? "#4ade80" : "#f87171"}}>{deepAlert.alert.direction === "BULLISH" ? "BULL" : "BEAR"} {deepAlert.symbol}</span>
                <span style={{background: "#166534", color: "#fff", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600}}>Grade {deepAlert.alert.grade} | {deepAlert.alert.confluencePct}%</span>
              </div>
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12}}>
                <div><span style={{color: "#9ca3af"}}>Entry </span><span style={{color: "#fff", fontWeight: 600}}>${deepAlert.alert.entry}</span></div>
                <div><span style={{color: "#9ca3af"}}>Stop </span><span style={{color: "#f87171", fontWeight: 600}}>${deepAlert.alert.stop}</span></div>
                <div><span style={{color: "#9ca3af"}}>Target </span><span style={{color: "#4ade80", fontWeight: 600}}>${deepAlert.alert.target1}</span></div>
                <div><span style={{color: "#9ca3af"}}>R:R </span><span style={{color: "#fbbf24", fontWeight: 600}}>{deepAlert.alert.target1_rr}:1</span></div>
              </div>
              <div style={{marginTop: 6, fontSize: 10, color: "#6b7280"}}>{deepAlert.alert.timeframe}</div>
            </div>
          ) : scanResults && scanResults.opportunities && scanResults.opportunities.length > 0 ? (
            <div style={{fontSize: 13}}>
              {scanResults.opportunities.slice(0, 3).map((op, idx) => (
                <div key={idx} style={{display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #222"}}>
                  <span style={{color: "#fff", fontWeight: 600}}>{op.symbol}</span>
                  <span style={{color: op.direction === "BULLISH" ? "#4ade80" : "#f87171", fontSize: 12}}>{op.direction} {op.score}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{textAlign: "center", padding: "20px 0"}}>
              <div style={{color: "#6b7280", fontSize: 14, marginBottom: 8}}>Scanning market...</div>
              <div style={{color: "#4b5563", fontSize: 12}}>AI scans 40+ tickers for setups</div>
            </div>
          )}
          {/* Portfolio + Calendar */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={C}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={ST}>Portfolio</div>
                <button style={LA} onClick={()=>nav('/app/portfolio')}>Manage</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[['Open Trades',portfolio.trades||0],['Win Rate',portfolio.winRate?portfolio.winRate+'%':'--']].map(([l,v])=>(
                  <div key={l} style={{ background:'var(--bg-elevated)', borderRadius:7, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>{l}</div>
                    <div style={{ fontSize:18, fontWeight:700, fontFamily:'var(--font-mono)' }}>{v}</div>
                  </div>
                ))}
                {(portfolio.trades === 0 || portfolio.trades == null) && (
                  <div style={{ marginTop:10, padding:'8px 10px', background:'rgba(37,99,235,0.06)', borderRadius:7, border:'1px solid rgba(37,99,235,0.12)', textAlign:'center' }}>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>Track your edge over time</div>
                    <a href="/app/journal" style={{ fontSize:11, color:'var(--accent)', fontWeight:600, textDecoration:'none' }}>Log your first trade </a>
                  </div>
                )}
              </div>
            </div>
            <div style={C}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={ST}>Macro Calendar</div>
                <button style={LA} onClick={()=>nav('/app/earnings')}>Earnings</button>
              </div>
              {events.length===0 ? (
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>No upcoming events</div>
              ) : events.map((ev,i)=>{
                const d = ev.event_date ? Math.round((new Date(ev.event_date)-new Date())/86400000) : null
                return (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom: i<events.length-1?'1px solid var(--border-dim)':'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:3, background:'var(--yellow-dim)', color:'var(--yellow)', textTransform:'uppercase' }}>{ev.event_type||'EVT'}</span>
                      <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{ev.title||ev.event_name}</span>
                    </div>
                    {d!=null && <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{d===0?'Today':d===1?'Tomorrow':'in '+d+'d'}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
    
      {/* DT Engine Quick Scan */}
      <div style={{marginTop:16,marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{background:"#0d1420",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,fontWeight:700,color:"#ef4444",fontFamily:'"DM Mono",monospace'}}>DT ENGINE</span>
            <button onClick={()=>navigate("/app/daytrade")} style={{padding:"3px 10px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:5,color:"#ef4444",fontSize:9,cursor:"pointer",fontFamily:'"DM Mono",monospace'}}>Full Dashboard  -></button>
          </div>
          <div style={{fontSize:10,color:"#4a5c7a"}}>29 analysis functions across 5 timeframes. Run a live scan on the Day Trade Engine dashboard for full confluence, FTFC, MACD, ADX, gap analysis, key levels, and anchored VWAPs.</div>
        </div>
        <div style={{background:"#0d1420",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,fontWeight:700,color:"#a78bfa",fontFamily:'"DM Mono",monospace'}}>LEARNING</span>
            <button onClick={()=>navigate("/app/learn")} style={{padding:"3px 10px",background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:5,color:"#a78bfa",fontSize:9,cursor:"pointer",fontFamily:'"DM Mono",monospace'}}>Start Learning  -></button>
          </div>
          <div style={{fontSize:10,color:"#4a5c7a"}}>6 AI-curated courses with Quizlet-style flashcards. Master risk management, options, technical analysis, trading psychology, The Strat, and earnings strategies.</div>
        </div>
      </div>

      {[['Charts','/app/charts'],['Earnings','/app/earnings'],['Sectors','/app/sectors'],['Journal','/app/journal'],['Risk Calc','/app/risk'],['EOD Debrief','/app/eod'],['Intelligence','/app/intelligence'],['Learning','/app/learn'],['Coaches','/app/coaches'],['Blog','/app/blog']].map(([label,path])=>(
            <button key={label} onClick={()=>nav(path)} style={{ background:'var(--bg-elevated)', color:'var(--text-secondary)', border:'1px solid var(--border)', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:500 }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}