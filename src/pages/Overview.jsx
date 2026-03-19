import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Overview() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadProfile()
      loadQuotes()
    }
  }, [user])

  async function loadProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data)
    setLoading(false)
  }

  async function loadQuotes() {
    try {
      const r = await fetch('/api/quotes?symbols=SPY,QQQ,AAPL,TSLA,NVDA')
      if (r.ok) setQuotes(await r.json())
    } catch(e) {}
  }

  const s = {
    page: { padding:24, fontFamily:'"DM Mono",monospace' },
    welcome: { color:'#e2e8f0', fontSize:22, fontWeight:700, marginBottom:4 },
    sub: { color:'#4a5c7a', fontSize:12, marginBottom:24 },
    grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12, marginBottom:24 },
    card: { background:'#0d1117', border:'1px solid #1e2d3d', borderRadius:10, padding:20 },
    label: { color:'#4a5c7a', fontSize:11, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' },
    val: (c) => ({ color:c||'#e2e8f0', fontSize:22, fontWeight:700 }),
    section: { background:'#0d1117', border:'1px solid #1e2d3d', borderRadius:10, padding:20, marginBottom:16 },
    stitle: { color:'#e2e8f0', fontSize:14, fontWeight:600, marginBottom:16 },
    th: { color:'#4a5c7a', fontSize:11, padding:'8px 12px', textAlign:'left', borderBottom:'1px solid #1e2d3d', textTransform:'uppercase' },
    td: { color:'#8b9fc0', fontSize:12, padding:'10px 12px', borderBottom:'1px solid #0d1520' },
  }

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'80vh',color:'#4a5c7a',fontFamily:'"DM Mono",monospace',fontSize:13 }}>
      Loading dashboard...
    </div>
  )

  const isPro = profile?.plan === 'pro'

  return (
    <div style={s.page}>
      <div style={s.welcome}>
        Welcome back{user?.email ? ', ' + user.email.split('@')[0] : ''} ⚡
      </div>
      <div style={s.sub}>
        Plan: <span style={{ color: isPro ? '#60a5fa' : '#4a5c7a', fontWeight:600 }}>{(profile?.plan||'free').toUpperCase()}</span>
        {' '}· {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}
      </div>

      {!isPro && (
        <div style={{ background:'rgba(37,99,235,0.1)', border:'1px solid rgba(37,99,235,0.3)', borderRadius:10, padding:16, marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ color:'#93c5fd', fontSize:13, fontWeight:600 }}>Upgrade to Pro</div>
            <div style={{ color:'#4a5c7a', fontSize:11, marginTop:4 }}>Get live signals, AI thesis, and full portfolio analytics</div>
          </div>
          <a href="/app" style={{ background:'#2563eb', color:'white', padding:'8px 16px', borderRadius:6, fontSize:11, textDecoration:'none', fontFamily:'inherit' }}>Upgrade →</a>
        </div>
      )}

      <div style={s.grid}>
        {[
          { label:'Active Signals', val: quotes.filter(q=>q.signal==='BUY').length + ' BUY / ' + quotes.filter(q=>q.signal==='SELL').length + ' SELL', color:'#e2e8f0' },
          { label:'Market Mood', val: quotes.filter(q=>q.signal==='BUY').length > quotes.filter(q=>q.signal==='SELL').length ? 'Bullish' : 'Bearish', color: quotes.filter(q=>q.signal==='BUY').length > quotes.filter(q=>q.signal==='SELL').length ? '#10b981' : '#ef4444' },
          { label:'SPY Today', val: quotes.find(q=>q.symbol==='SPY') ? (quotes.find(q=>q.symbol==='SPY').changePct>=0?'+':'') + quotes.find(q=>q.symbol==='SPY').changePct?.toFixed(2) + '%' : '—', color: (quotes.find(q=>q.symbol==='SPY')?.changePct||0)>=0?'#10b981':'#ef4444' },
          { label:'Watchlist', val: quotes.length + ' symbols', color:'#e2e8f0' },
        ].map(({label,val,color})=>(
          <div key={label} style={s.card}>
            <div style={s.label}>{label}</div>
            <div style={s.val(color)}>{val}</div>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.stitle}>Market Snapshot</div>
        {quotes.length === 0 ? (
          <div style={{ color:'#4a5c7a',fontSize:12 }}>Loading market data...</div>
        ) : (
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead><tr>{['Symbol','Price','Change','Signal'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {quotes.map(q=>(
                <tr key={q.symbol}>
                  <td style={{ ...s.td, color:'#e2e8f0', fontWeight:600 }}>{q.symbol}</td>
                  <td style={s.td}>${q.price?.toFixed(2)}</td>
                  <td style={{ ...s.td, color:q.change>=0?'#10b981':'#ef4444' }}>
                    {q.change>=0?'+':''}{q.changePct?.toFixed(2)}%
                  </td>
                  <td style={s.td}>
                    <span style={{ padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,color:q.signalColor,background:q.signalColor+'22' }}>{q.signal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={s.section}>
        <div style={s.stitle}>Quick Actions</div>
        <div style={{ display:'flex',gap:12,flexWrap:'wrap' }}>
          {[
            { label:'View Signals', href:'/app/signals', color:'#2563eb' },
            { label:'Trading Journal', href:'/app/journal', color:'#059669' },
            { label:'Portfolio', href:'/app/portfolio', color:'#7c3aed' },
          ].map(({label,href,color})=>(
            <a key={label} href={href} style={{ padding:'10px 20px',borderRadius:8,background:color+'22',border:'1px solid '+color+'44',color:color,fontSize:12,textDecoration:'none',fontFamily:'inherit',fontWeight:600 }}>
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
