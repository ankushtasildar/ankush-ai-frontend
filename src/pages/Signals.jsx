import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Watchlist() {
  const [watchlist, setWatchlist] = useState([])
  const [openSetups, setOpenSetups] = useState([])
  const [quotes, setQuotes] = useState({})
  const [newSymbol, setNewSymbol] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const [wlR, setupsR] = await Promise.all([
        supabase.from('price_alerts').select('*').eq('user_id', user.id).order('created_at', {ascending:false}),
        supabase.from('setup_records').select('symbol,setup_type,bias,entry_high,entry_low,stop_loss,target_1,confidence,rr_ratio,created_at').is('outcome', null).order('confidence', {ascending:false}).limit(25),
      ])
      const wl = wlR.data || []
      const setups = setupsR.data || []
      setWatchlist(wl)
      setOpenSetups(setups)
      const symbols = [...new Set([...wl.map(w=>w.symbol), ...setups.map(s=>s.symbol)])]
      if (symbols.length) {
        const qr = await fetch('/api/market?action=quotes&symbols='+symbols.join(','))
        const qd = await qr.json()
        const qMap = {}
        if (Array.isArray(qd)) qd.forEach(q => qMap[q.symbol] = q)
        setQuotes(qMap)
      }
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function addToWatchlist() {
    const sym = newSymbol.trim().toUpperCase()
    if (!sym) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('price_alerts').insert({user_id:user.id, symbol:sym, alert_type:'watchlist', is_active:true})
    setNewSymbol('')
    loadData()
  }

  async function removeFromWatchlist(id) {
    await supabase.from('price_alerts').delete().eq('id', id)
    setWatchlist(w => w.filter(x=>x.id!==id))
  }

  const bg = 'var(--bg-base)', card = 'var(--bg-card)', border = '1px solid var(--border)'
  const s = {
    page: {background:bg,minHeight:'100vh',padding:'16px',fontFamily:'var(--font)',color:'var(--text-primary)'},
    title: {fontSize:22,fontWeight:700,margin:'0 0 4px'},
    subtitle: {fontSize:13,color:'var(--text-muted)',marginBottom:20},
    grid: {display:'grid',gridTemplateColumns:'1fr 1fr',gap:16},
    section: {background:card,borderRadius:12,border,padding:16},
    sectionTitle: {fontSize:13,fontWeight:700,color:'var(--text-secondary)',marginBottom:12,textTransform:'uppercase',letterSpacing:1},
    addRow: {display:'flex',gap:8,marginBottom:14},
    input: {flex:1,background:bg,border,borderRadius:8,color:'var(--text-primary)',padding:'8px 12px',fontSize:14},
    addBtn: {background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontWeight:600},
    row: {display:'flex',alignItems:'center',gap:8,padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',cursor:'pointer'},
    sym: {fontWeight:700,fontSize:15,minWidth:60},
    priceColor: c => c>=0?'#10b981':'#ef4444',
    badge: b => ({fontSize:11,padding:'2px 7px',borderRadius:4,fontWeight:600,
      background:b==='bullish'?'rgba(16,185,129,0.15)':b==='bearish'?'rgba(239,68,68,0.15)':'rgba(107,114,128,0.15)',
      color:b==='bullish'?'#10b981':b==='bearish'?'#ef4444':'#9ca3af'}),
    rmBtn: {background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'0 6px',marginLeft:'auto'},
    empty: {color:'var(--text-muted)',fontSize:13,textAlign:'center',padding:24},
    chartBtn: {background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--text-muted)',padding:'2px 8px',fontSize:11,cursor:'pointer',marginLeft:'auto'},
  }

  return (
    <div style={s.page}>
      <div style={s.title}>📋 Watchlist</div>
      <div style={s.subtitle}>Track symbols and monitor AI-identified setups in real-time</div>
      <div style={s.grid}>
        <div style={s.section}>
          <div style={s.sectionTitle}>My Symbols</div>
          <div style={s.addRow}>
            <input style={s.input} value={newSymbol} onChange={e=>setNewSymbol(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==='Enter'&&addToWatchlist()} placeholder="Ticker (e.g. NVDA)" />
            <button style={s.addBtn} onClick={addToWatchlist}>+ Add</button>
          </div>
          {watchlist.length===0&&<div style={s.empty}>No symbols yet.</div>}
          {watchlist.map(w=>{
            const q=quotes[w.symbol]
            return <div key={w.id} style={s.row}>
              <span style={s.sym} onClick={()=>navigate('/app/charts?symbol='+w.symbol)}>{w.symbol}</span>
              {q&&<span style={{fontWeight:600,color:s.priceColor(q.changePercent),fontSize:15}}>${q.price?.toFixed(2)}</span>}
              {q&&<span style={{fontSize:12,color:s.priceColor(q.changePercent)}}>{q.changePercent>=0?'+':''}{q.changePercent?.toFixed(2)}%</span>}
              <button style={s.chartBtn} onClick={()=>navigate('/app/charts?symbol='+w.symbol)}>Chart</button>
              <button style={s.rmBtn} onClick={()=>removeFromWatchlist(w.id)}>✕</button>
            </div>
          })}
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>🎯 AI Active Setups</div>
          {openSetups.length===0&&<div style={s.empty}>Run a scan to see AI setups here.</div>}
          {openSetups.map((s2,i)=>{
            const q=quotes[s2.symbol]
            return <div key={i} style={s.row} onClick={()=>navigate('/app/charts?symbol='+s2.symbol)}>
              <span style={s.sym}>{s2.symbol}</span>
              <span style={s.badge(s2.bias)}>{s2.bias}</span>
              {q&&<span style={{fontWeight:600,color:s.priceColor(q.changePercent),fontSize:14,marginLeft:'auto'}}>${q.price?.toFixed(2)}</span>}
              <span style={{fontSize:11,color:s2.confidence>=8?'#10b981':s2.confidence>=6?'#f59e0b':'#ef4444'}}>C:{s2.confidence}</span>
            </div>
          })}
        </div>
      </div>
    </div>
  )
}