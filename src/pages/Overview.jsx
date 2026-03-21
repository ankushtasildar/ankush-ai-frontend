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
  const [lastUpdate, setLastUpdate] = useState(null)

  const load = useCallback(async () => {
    try {
      const [mktR, cacheR, openR, eventsR] = await Promise.allSettled([
        fetch('/api/market?action=overview').then(r=>r.json()),
        supabase.from('scan_cache').select('*').order('created_at',{ascending:false}).limit(1),
        supabase.from('setup_records').select('*').eq('status','open').limit(10),
        supabase.from('macro_events').select('*').order('event_date',{ascending:true}).limit(4)
      ])
      if (mktR.status==='fulfilled' && !mktR.value.error) setMkt(mktR.value)
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

  const sp = mkt?.indices?.spy
  const qq = mkt?.indices?.qqq
  const iw = mkt?.indices?.iwm
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
              {isOpen ? <span style={{color:'var(--green)'}}>Market Open</span> : <span>Market Closed</span>}
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
            {loading ? [...Array(3)].map((_,i)=>(<div key={i} style={{ height:52, background:'var(--bg-elevated)', borderRadius:7, marginBottom:4 }} />)) : setups.length===0 ? (
              <div style={{ textAlign:'center', padding:'16px 0' }}>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:10 }}>No setups yet</div>
                <button onClick={runScan} disabled={scanLoading} style={{ background:'var(--accent-dim)', color:'var(--accent)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:7, padding:'7px 16px', fontSize:12, fontWeight:600 }}>
                  {scanLoading ? 'Scanning...' : 'Run Scan'}
                </button>
              </div>
            ) : setups.slice(0,5).map((s,i)=>(
              <SetupRow key={i} setup={s} onClick={()=>nav('/app/setups')} />
            ))}
          </div>
          {/* Portfolio + Calendar */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={C}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={ST}>Portfolio</div>
                <button style={LA} onClick={()=>nav('/app/portfolio')}>Manage</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[['Open Trades',portfolio.trades],['Win Rate',portfolio.winRate?portfolio.winRate+'%':'--']].map(([l,v])=>(
                  <div key={l} style={{ background:'var(--bg-elevated)', borderRadius:7, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>{l}</div>
                    <div style={{ fontSize:18, fontWeight:700, fontFamily:'var(--font-mono)' }}>{v}</div>
                  </div>
                ))}
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
          {[['Charts','/app/charts'],['Earnings','/app/earnings'],['Sectors','/app/sectors'],['Journal','/app/journal'],['Risk Calc','/app/risk'],['EOD Debrief','/app/eod'],['Intelligence','/app/intelligence']].map(([label,path])=>(
            <button key={label} onClick={()=>nav(path)} style={{ background:'var(--bg-elevated)', color:'var(--text-secondary)', border:'1px solid var(--border)', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:500 }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}