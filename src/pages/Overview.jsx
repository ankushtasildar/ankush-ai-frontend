import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const fmt = (n, d=2) => n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
const fmtPct = n => n==null?'—':(n>0?'+':'')+fmt(n,2)+'%'
const fmtDollar = (n,d=2) => n==null?'—':'$'+fmt(n,d)
const fmtVol = n => n>=1e9?(n/1e9).toFixed(1)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(0)+'K':n?.toFixed(0)||'—'

function IndexCard({ symbol, label, data, onClick }) {
  const change = data?.changePercent || 0
  const isPos = change >= 0
  return (
    <div onClick={onClick} style={{ background:'#0d1420', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', cursor:'pointer', flex:1, minWidth:140, transition:'border-color .15s' }}
      onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(96,165,250,0.3)'}
      onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
        <div>
          <div style={{color:'#f0f6ff',fontSize:15,fontWeight:700,fontFamily:'"DM Mono",monospace'}}>{symbol}</div>
          <div style={{color:'#3d4e62',fontSize:10}}>{label}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{color:isPos?'#10b981':'#ef4444',fontFamily:'"DM Mono",monospace',fontSize:13,fontWeight:700}}>{fmtPct(change)}</div>
        </div>
      </div>
      <div style={{color:'#f0f6ff',fontSize:20,fontWeight:800,fontFamily:'"DM Mono",monospace',marginBottom:4}}>
        {data?.price ? fmtDollar(data.price) : '—'}
      </div>
      <div style={{display:'flex',gap:8,fontSize:9,color:'#3d4e62',fontFamily:'"DM Mono",monospace'}}>
        {data?.high && <span>H:{fmtDollar(data.high)}</span>}
        {data?.low && <span>L:{fmtDollar(data.low)}</span>}
        {data?.volume && <span>Vol:{fmtVol(data.volume)}</span>}
      </div>
    </div>
  )
}

function MoodBadge({ mood }) {
  const colors = {
    'Risk On':['#10b981','rgba(16,185,129,0.1)'],
    'Mildly Bullish':['#34d399','rgba(52,211,153,0.08)'],
    'Mixed':['#f59e0b','rgba(245,158,11,0.08)'],
    'Fear':['#f97316','rgba(249,115,22,0.1)'],
    'Mildly Bearish':['#f87171','rgba(248,113,113,0.08)'],
    'Risk Off':['#ef4444','rgba(239,68,68,0.1)'],
    'Complacency':['#a78bfa','rgba(167,139,250,0.08)'],
  }
  const [text, bg] = colors[mood] || ['#8b9fc0','rgba(255,255,255,0.04)']
  return (
    <span style={{background:bg,border:`1px solid ${text}30`,borderRadius:6,padding:'3px 10px',color:text,fontSize:11,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{mood}</span>
  )
}

function SectorBar({ sector }) {
  const isPos = sector.change >= 0
  const barWidth = Math.min(100, Math.abs(sector.change) * 15)
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
      <div style={{color:'#6b7a90',fontSize:10,fontFamily:'"DM Mono",monospace',minWidth:36}}>{sector.ticker}</div>
      <div style={{flex:1,height:4,background:'rgba(255,255,255,0.04)',borderRadius:2,overflow:'hidden'}}>
        <div style={{width:barWidth+'%',height:'100%',background:isPos?'#10b981':'#ef4444',borderRadius:2,marginLeft:isPos?0:'auto'}}/>
      </div>
      <div style={{color:isPos?'#10b981':'#ef4444',fontSize:10,fontFamily:'"DM Mono",monospace',minWidth:48,textAlign:'right'}}>{fmtPct(sector.change)}</div>
    </div>
  )
}

function OpenSetupRow({ setup, onChart }) {
  const isPos = setup.bias === 'bullish'
  const age = Math.floor((Date.now() - new Date(setup.created_at).getTime()) / 86400000)
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
      <span style={{background:isPos?'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)',border:`1px solid ${isPos?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'}`,borderRadius:4,padding:'1px 7px',color:isPos?'#10b981':'#ef4444',fontSize:9,fontFamily:'"DM Mono",monospace',fontWeight:700,minWidth:48,textAlign:'center'}}>{isPos?'▲ BULL':'▼ BEAR'}</span>
      <span style={{fontFamily:'"DM Mono",monospace',fontWeight:700,color:'#f0f6ff',minWidth:50}}>{setup.symbol}</span>
      <span style={{color:'#4a5c7a',fontSize:10,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{setup.setup_type}</span>
      <span style={{color:'#3d4e62',fontSize:10,fontFamily:'"DM Mono",monospace'}}>{age}d</span>
      <span style={{color:setup.confidence>=8?'#10b981':setup.confidence>=6?'#f59e0b':'#6b7a90',fontSize:10,fontFamily:'"DM Mono",monospace'}}>{setup.confidence}/10</span>
      <button onClick={()=>onChart(setup.symbol)} style={{background:'none',border:'1px solid rgba(255,255,255,0.08)',borderRadius:4,color:'#4a5c7a',fontSize:9,cursor:'pointer',padding:'2px 6px'}}>Chart</button>
    </div>
  )
}

function MacroRow({ event }) {
  const daysTo = Math.round((new Date(event.event_date+'T00:00:00') - new Date(new Date().toDateString())) / 86400000)
  const urgency = daysTo <= 1 ? '#ef4444' : daysTo <= 5 ? '#f59e0b' : '#3d4e62'
  const typeColor = event.event_type === 'fomc' ? '#ef4444' : event.event_type === 'cpi' ? '#f59e0b' : '#6b7a90'
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
      <span style={{background:`${typeColor}15`,border:`1px solid ${typeColor}30`,borderRadius:4,padding:'1px 7px',color:typeColor,fontSize:9,fontFamily:'"DM Mono",monospace',minWidth:50,textAlign:'center'}}>{event.event_type.toUpperCase()}</span>
      <span style={{color:'#8b9fc0',fontSize:11,flex:1}}>{event.title}</span>
      <span style={{color:urgency,fontSize:10,fontFamily:'"DM Mono",monospace',whiteSpace:'nowrap'}}>
        {daysTo === 0 ? 'TODAY' : daysTo === 1 ? 'TOMORROW' : `in ${daysTo}d`}
      </span>
    </div>
  )
}

export default function Overview() {
  const navigate = useNavigate()
  const [market, setMarket] = useState(null)
  const [sectors, setSectors] = useState([])
  const [openSetups, setOpenSetups] = useState([])
  const [macroEvents, setMacroEvents] = useState([])
  const [portfolio, setPortfolio] = useState({ value: 0, return: 0, pct: 0 })
  const [journalStats, setJournalStats] = useState({ total: 0, wins: 0, pnl: 0 })
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [aiSnapshot, setAiSnapshot] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    loadAll()
    const interval = setInterval(loadMarket, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadMarket(), loadUserData(), loadMacroEvents()])
    setLoading(false)
  }

  async function loadMarket() {
    try {
      const r = await fetch('/api/market?type=context')
      if (r.ok) {
        const d = await r.json()
        setMarket(d)
        setSectors(d.sectors || [])
        setLastUpdated(new Date())
      }
    } catch (e) { console.log('Market fetch error:', e.message) }
  }

  async function loadUserData() {
    try {
      // Open setups from intelligence
      const { data: setups } = await supabase
        .from('setup_records')
        .select('id,symbol,bias,setup_type,confidence,created_at,entry_high,stop_loss,target_1,price_at_generation')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(8)
      setOpenSetups(setups || [])

      // Portfolio P&L
      const { data: positions } = await supabase
        .from('portfolio_positions')
        .select('current_value,cost_basis,quantity')
      if (positions?.length) {
        const totalValue = positions.reduce((s, p) => s + (p.current_value || 0), 0)
        const totalCost = positions.reduce((s, p) => s + (p.cost_basis * p.quantity || 0), 0)
        const totalReturn = totalValue - totalCost
        setPortfolio({ value: totalValue, return: totalReturn, pct: totalCost ? totalReturn/totalCost*100 : 0 })
      }

      // Journal win rate
      const { data: trades } = await supabase
        .from('journal_entries')
        .select('pnl,outcome')
        .not('pnl', 'is', null)
      if (trades?.length) {
        const wins = trades.filter(t => (t.pnl || 0) > 0).length
        const pnl = trades.reduce((s, t) => s + (t.pnl || 0), 0)
        setJournalStats({ total: trades.length, wins, pnl, winRate: trades.length ? (wins/trades.length*100).toFixed(0) : 0 })
      }
    } catch (e) { console.log('User data error:', e.message) }
  }

  async function loadMacroEvents() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const twoWeeks = new Date(Date.now() + 14*86400000).toISOString().split('T')[0]
      const { data } = await supabase
        .from('macro_events')
        .select('event_date,event_type,title,impact_level')
        .gte('event_date', today)
        .lte('event_date', twoWeeks)
        .order('event_date')
        .limit(6)
      setMacroEvents(data || [])
    } catch (e) {}
  }

  async function generateAISnapshot() {
    setAiLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({
          type: 'market_snapshot',
          context: {
            spy: market?.spy?.price, spyChange: market?.spy?.changePercent,
            vix: market?.vix?.current, mood: market?.marketMood?.mood,
            advancing: market?.marketMood?.advancing, declining: market?.marketMood?.declining,
            topSectors: sectors.slice(0, 3).map(s => s.name + ' ' + (s.change >= 0 ? '+' : '') + (s.change || 0).toFixed(2) + '%').join(', '),
            openSetups: openSetups.length
          }
        })
      })
      if (r.ok) {
        const d = await r.json()
        setAiSnapshot(d.response || d.content || d.message || JSON.stringify(d).substring(0, 300))
      }
    } catch (e) {}
    setAiLoading(false)
  }

  const vix = market?.vix?.current || 0
  const vixColor = vix > 30 ? '#ef4444' : vix > 20 ? '#f59e0b' : vix > 15 ? '#10b981' : '#a5b4fc'
  const spyChange = market?.spy?.changePercent || 0
  const mood = market?.marketMood?.mood || 'Loading...'

  const etHour = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
  const etDay = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' })
  const isOpen = !['Sat','Sun'].includes(etDay) && parseInt(etHour) >= 9 && parseInt(etHour) < 16
  const greeting = parseInt(etHour) < 12 ? 'Good Morning' : parseInt(etHour) < 17 ? 'Good Afternoon' : 'Good Evening'
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York' })

  return (
    <div style={{ padding:'20px 24px', minHeight:'100vh', background:'#080c14', color:'#f0f6ff', fontFamily:'"DM Sans",sans-serif' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ color:'#3d4e62', fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:4 }}>{greeting}</div>
          <h1 style={{ fontFamily:'"Syne",sans-serif', fontSize:28, fontWeight:800, margin:'0 0 4px' }}>
            {loading ? 'Loading...' : mood === 'Fear' ? '⚠️ Markets Under Pressure' : mood === 'Risk On' ? '🚀 Risk On — Markets Running' : '📊 Market Overview'}
          </h1>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:isOpen?'#10b981':'#4a5c7a', boxShadow:isOpen?'0 0 8px #10b981':'none' }} />
            <span style={{ color:'#4a5c7a', fontSize:11 }}>{isOpen ? 'Market Open' : 'Market Closed'} · {timeStr} ET</span>
            {lastUpdated && <span style={{ color:'#2d3d50', fontSize:10 }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <MoodBadge mood={mood} />
          <span style={{ background:vixColor+'15', border:`1px solid ${vixColor}30`, borderRadius:6, padding:'3px 10px', color:vixColor, fontSize:11, fontFamily:'"DM Mono",monospace', fontWeight:700 }}>VIX {fmt(vix)}</span>
          <button onClick={generateAISnapshot} disabled={aiLoading} style={{ padding:'6px 14px', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', border:'none', borderRadius:8, color:'#fff', fontSize:11, cursor:aiLoading?'default':'pointer', opacity:aiLoading?.7:1, fontFamily:'"DM Mono",monospace' }}>
            {aiLoading ? '⟳ Thinking...' : '⚡ AI Snapshot'}
          </button>
        </div>
      </div>

      {/* AI Snapshot */}
      {aiSnapshot && (
        <div style={{ background:'rgba(37,99,235,0.05)', border:'1px solid rgba(37,99,235,0.15)', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
          <div style={{ color:'#60a5fa', fontSize:9, fontFamily:'"DM Mono",monospace', letterSpacing:'.06em', marginBottom:8 }}>⚡ AI MARKET SNAPSHOT</div>
          <div style={{ color:'#8b9fc0', fontSize:12, lineHeight:1.7 }}>{aiSnapshot}</div>
        </div>
      )}

      {/* Main index cards */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <IndexCard symbol="SPY" label="S&P 500 ETF" data={market?.spy} onClick={() => navigate('/app/charts?symbol=SPY')} />
        <IndexCard symbol="QQQ" label="Nasdaq 100 ETF" data={market?.qqq} onClick={() => navigate('/app/charts?symbol=QQQ')} />
        <IndexCard symbol="IWM" label="Russell 2000 ETF" data={market?.iwm} onClick={() => navigate('/app/charts?symbol=IWM')} />
        <div style={{ background:'#0d1420', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', flex:1, minWidth:140 }}>
          <div style={{ color:'#3d4e62', fontSize:10, marginBottom:6 }}>VIX — Fear Index</div>
          <div style={{ color:vixColor, fontSize:20, fontWeight:800, fontFamily:'"DM Mono",monospace', marginBottom:4 }}>{fmt(vix)}</div>
          <div style={{ color:'#4a5c7a', fontSize:10 }}>
            {vix > 30 ? '🔴 Extreme fear' : vix > 20 ? '🟡 Elevated anxiety' : vix > 15 ? '🟢 Normal' : '🟣 Complacency'}
          </div>
          <div style={{ height:3, background:'rgba(255,255,255,0.05)', borderRadius:2, marginTop:8, overflow:'hidden' }}>
            <div style={{ width:Math.min(100, vix*2.5)+'%', height:'100%', background:vixColor, borderRadius:2 }} />
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>

        {/* Sector performance */}
        <div style={{ background:'#0d1420', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ color:'#3d4e62', fontSize:9, fontFamily:'"DM Mono",monospace', letterSpacing:'.06em' }}>SECTOR PERFORMANCE</div>
            <button onClick={() => navigate('/app/sectors')} style={{ background:'none', border:'none', color:'#2563eb', fontSize:10, cursor:'pointer' }}>View all →</button>
          </div>
          {sectors.length === 0 ? (
            <div style={{ color:'#3d4e62', fontSize:11 }}>Loading sectors...</div>
          ) : (
            sectors.slice(0, 8).map((s, i) => <SectorBar key={i} sector={s} />)
          )}
          <div style={{ display:'flex', gap:8, marginTop:10, paddingTop:8, borderTop:'1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ color:'#10b981', fontSize:10 }}>▲ {market?.marketMood?.advancing || 0} advancing</div>
            <div style={{ color:'#ef4444', fontSize:10 }}>▼ {market?.marketMood?.declining || 0} declining</div>
          </div>
        </div>

        {/* Open setups */}
        <div style={{ background:'#0d1420', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ color:'#3d4e62', fontSize:9, fontFamily:'"DM Mono",monospace', letterSpacing:'.06em' }}>OPEN SETUPS ({openSetups.length})</div>
            <button onClick={() => navigate('/app/setups')} style={{ background:'none', border:'none', color:'#2563eb', fontSize:10, cursor:'pointer' }}>Scan →</button>
          </div>
          {openSetups.length === 0 ? (
            <div style={{ color:'#3d4e62', fontSize:11, textAlign:'center', padding:'20px 0' }}>
              No open setups tracked yet.<br />
              <button onClick={() => navigate('/app/setups')} style={{ marginTop:8, padding:'6px 14px', background:'rgba(37,99,235,0.1)', border:'1px solid rgba(37,99,235,0.2)', borderRadius:6, color:'#60a5fa', fontSize:10, cursor:'pointer' }}>Run a scan →</button>
            </div>
          ) : (
            openSetups.map((s, i) => <OpenSetupRow key={s.id || i} setup={s} onChart={sym => navigate('/app/charts?symbol=' + sym)} />)
          )}
        </div>

        {/* Right column: P&L + Macro + Journal */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Portfolio P&L */}
          <div style={{ background:'#0d1420', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ color:'#3d4e62', fontSize:9, fontFamily:'"DM Mono",monospace', letterSpacing:'.06em' }}>PORTFOLIO</div>
              <button onClick={() => navigate('/app/portfolio')} style={{ background:'none', border:'none', color:'#2563eb', fontSize:10, cursor:'pointer' }}>Manage →</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <div style={{ color:'#4a5c7a', fontSize:10, marginBottom:2 }}>Value</div>
                <div style={{ color:'#f0f6ff', fontSize:17, fontWeight:700, fontFamily:'"DM Mono",monospace' }}>{fmtDollar(portfolio.value)}</div>
              </div>
              <div>
                <div style={{ color:'#4a5c7a', fontSize:10, marginBottom:2 }}>Total Return</div>
                <div style={{ color:portfolio.return>=0?'#10b981':'#ef4444', fontSize:17, fontWeight:700, fontFamily:'"DM Mono",monospace' }}>{fmtPct(portfolio.pct)}</div>
              </div>
            </div>
          </div>

          {/* Journal stats */}
          <div style={{ background:'#0d1420', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ color:'#3d4e62', fontSize:9, fontFamily:'"DM Mono",monospace', letterSpacing:'.06em' }}>TRADING PERFORMANCE</div>
              <button onClick={() => navigate('/app/journal')} style={{ background:'none', border:'none', color:'#2563eb', fontSize:10, cursor:'pointer' }}>Journal →</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ color: journalStats.winRate >= 60 ? '#10b981' : journalStats.winRate >= 50 ? '#f59e0b' : '#ef4444', fontSize:18, fontWeight:700, fontFamily:'"DM Mono",monospace' }}>{journalStats.winRate || 0}%</div>
                <div style={{ color:'#3d4e62', fontSize:9 }}>Win Rate</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ color:journalStats.pnl>=0?'#10b981':'#ef4444', fontSize:18, fontWeight:700, fontFamily:'"DM Mono",monospace' }}>{fmtDollar(journalStats.pnl)}</div>
                <div style={{ color:'#3d4e62', fontSize:9 }}>Total P&L</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ color:'#f0f6ff', fontSize:18, fontWeight:700, fontFamily:'"DM Mono",monospace' }}>{journalStats.total}</div>
                <div style={{ color:'#3d4e62', fontSize:9 }}>Trades</div>
              </div>
            </div>
          </div>

          {/* Macro events */}
          <div style={{ background:'#0d1420', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ color:'#3d4e62', fontSize:9, fontFamily:'"DM Mono",monospace', letterSpacing:'.06em' }}>MACRO CALENDAR</div>
              <button onClick={() => navigate('/app/earnings')} style={{ background:'none', border:'none', color:'#2563eb', fontSize:10, cursor:'pointer' }}>Earnings →</button>
            </div>
            {macroEvents.length === 0 ? (
              <div style={{ color:'#3d4e62', fontSize:10 }}>No upcoming events</div>
            ) : (
              macroEvents.map((e, i) => <MacroRow key={i} event={e} />)
            )}
          </div>
        </div>
      </div>

      {/* Quick action bar */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {[
          ['🎯 Run Scan', '/app/setups'],
          ['📅 Earnings', '/app/earnings'],
          ['🌡 Sectors', '/app/sectors'],
          ['⚖ Risk Calc', '/app/risk'],
          ['🌙 EOD Debrief', '/app/eod'],
          ['🧠 Intelligence', '/app/intelligence'],
        ].map(([label, path]) => (
          <button key={path} onClick={() => navigate(path)} style={{ padding:'7px 14px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, color:'#6b7a90', fontSize:11, cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(96,165,250,0.3)'; e.currentTarget.style.color='#60a5fa'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'; e.currentTarget.style.color='#6b7a90'; }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
