import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Admin() {
  const [stats, setStats] = useState({})
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [scanR, setupR, subR, alertR, journalR] = await Promise.all([
      supabase.from('scan_cache').select('id,setup_count,market_mood,vix,created_at').order('created_at',{ascending:false}).limit(5),
      supabase.from('setup_records').select('id,symbol,bias,outcome,scan_date').order('created_at',{ascending:false}).limit(20),
      supabase.from('subscriptions').select('user_id,status,plan,current_period_end'),
      supabase.from('price_alerts').select('id,symbol,alert_type,is_active').eq('is_active',true),
      supabase.from('journal_entries').select('id,symbol,status,pnl_dollar').order('created_at',{ascending:false}).limit(10),
    ])
    setStats({
      scanCache: scanR.data||[], 
      setups: setupR.data||[], 
      subs: subR.data||[],
      alerts: alertR.data||[],
      journal: journalR.data||[],
    })
    setLoading(false)
  }

  async function triggerScan() { setAction('scan'); await fetch('/api/analysis?type=scan'); await loadAll(); setAction(null) }
  async function triggerEOD() { setAction('eod'); await fetch('/api/cron/eod'); await loadAll(); setAction(null) }
  async function triggerPremarket() { setAction('premarket'); await fetch('/api/cron/premarket'); await loadAll(); setAction(null) }
  async function clearOldCache() {
    setAction('clear')
    const cutoff = new Date(Date.now() - 24*60*60000).toISOString()
    await supabase.from('scan_cache').delete().lt('created_at', cutoff)
    await loadAll(); setAction(null)
  }

  const card = (title, value, color='#60a5fa') => (
    <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
      <div style={{color:color,fontFamily:'"DM Mono",monospace',fontSize:24,fontWeight:800}}>{value}</div>
      <div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',marginTop:4}}>{title}</div>
    </div>
  )

  const btn = (label, fn, color='#2563eb', busy) => (
    <button onClick={fn} disabled={!!action} style={{padding:'8px 16px',background:action===busy?'rgba(255,255,255,0.05)':`${color}15`,border:`1px solid ${color}40`,borderRadius:7,color:action===busy?'#4a5c7a':color,fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace',fontWeight:700}}>
      {action===busy?'⟳ Running...':label}
    </button>
  )

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif'}}>
      <div style={{marginBottom:20}}>
        <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,margin:'0 0 2px'}}>Admin Console</h1>
        <div style={{color:'#3d4e62',fontSize:11}}>System health · cron controls · cache management</div>
      </div>

      {/* Stats grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8,marginBottom:20}}>
        {card('SCAN CACHE ENTRIES', stats.scanCache?.length||0, '#a78bfa')}
        {card('SETUPS TRACKED', stats.setups?.length||0, '#60a5fa')}
        {card('ACTIVE ALERTS', stats.alerts?.length||0, '#f59e0b')}
        {card('SUBSCRIPTIONS', stats.subs?.length||0, '#10b981')}
        {card('JOURNAL TRADES', stats.journal?.length||0, '#60a5fa')}
        {card('WIN RATE', stats.setups?.filter(s=>s.outcome==='win').length ? Math.round(stats.setups.filter(s=>s.outcome==='win').length/stats.setups.filter(s=>s.outcome).length*100)+'%' : '—', '#10b981')}
      </div>

      {/* Controls */}
      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#4a5c7a',marginBottom:10}}>CRON CONTROLS</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {btn('⚡ Force Scan', triggerScan, '#2563eb', 'scan')}
          {btn('🌅 Premarket Warm', triggerPremarket, '#10b981', 'premarket')}
          {btn('🌙 EOD Debrief', triggerEOD, '#f59e0b', 'eod')}
          {btn('🗑 Clear Old Cache', clearOldCache, '#ef4444', 'clear')}
          <button onClick={loadAll} style={{padding:'8px 16px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,color:'#6b7a90',fontSize:11,cursor:'pointer'}}>↻ Refresh</button>
        </div>
      </div>

      {/* Latest scan cache */}
      {stats.scanCache?.length > 0 && (
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#4a5c7a',marginBottom:8}}>SCAN CACHE (LATEST 5)</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {stats.scanCache.map((s,i) => (
              <div key={i} style={{display:'flex',gap:16,alignItems:'center',padding:'6px 8px',background:'rgba(255,255,255,0.02)',borderRadius:6,fontSize:11}}>
                <span style={{fontFamily:'"DM Mono",monospace',color:'#60a5fa',fontWeight:700}}>{s.setup_count||0} setups</span>
                <span style={{color:'#f59e0b'}}>{s.market_mood||'—'}</span>
                <span style={{fontFamily:'"DM Mono",monospace',color:'#6b7a90'}}>VIX {s.vix?.toFixed(1)||'—'}</span>
                <span style={{color:'#3d4e62',fontSize:10}}>{new Date(s.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent setups */}
      {stats.setups?.length > 0 && (
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#4a5c7a',marginBottom:8}}>RECENT SETUPS</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:4}}>
            {stats.setups.slice(0,12).map((s,i) => (
              <div key={i} style={{padding:'6px 8px',background:'rgba(255,255,255,0.02)',borderRadius:5,fontSize:10}}>
                <span style={{fontFamily:'"DM Mono",monospace',fontWeight:700}}>{s.symbol}</span>
                <span style={{color:s.bias==='bullish'?'#10b981':'#ef4444',marginLeft:6}}>{s.bias==='bullish'?'▲':'▼'}</span>
                {s.outcome && <span style={{color:s.outcome==='win'?'#10b981':'#ef4444',marginLeft:4,fontSize:9}}>●{s.outcome}</span>}
                <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace',marginTop:2}}>{s.scan_date}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active subscriptions */}
      {stats.subs?.length > 0 && (
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:16}}>
          <div style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#4a5c7a',marginBottom:8}}>SUBSCRIPTIONS</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {stats.subs.map((s,i) => (
              <div key={i} style={{display:'flex',gap:12,alignItems:'center',padding:'6px 8px',background:'rgba(255,255,255,0.02)',borderRadius:5,fontSize:11}}>
                <span style={{fontFamily:'"DM Mono",monospace',color:'#6b7a90',fontSize:9}}>{s.user_id?.substring(0,8)}...</span>
                <span style={{color:s.status==='active'?'#10b981':'#f59e0b',fontFamily:'"DM Mono",monospace',fontSize:10,fontWeight:700}}>{s.status}</span>
                <span style={{color:'#4a5c7a',fontSize:10}}>{s.plan}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div style={{color:'#3d4e62',textAlign:'center',padding:20}}>Loading...</div>}
    </div>
  )
}