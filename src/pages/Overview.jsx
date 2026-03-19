import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useMarket } from '../lib/useMarket.jsx'
import { supabase } from '../lib/supabase'

export default function Overview() {
  const { user } = useAuth()
  const { quotes, getQuote, session, loading: mktLoading, lastUpdate } = useMarket()
  const [profile,  setProfile]  = useState(null)
  const [journal,  setJournal]  = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([loadProfile(), loadJournal()]).finally(() => setLoading(false))
  }, [user])

  async function loadProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data)
  }

  async function loadJournal() {
    try {
      const { data } = await supabase
        .from('journal_entries')
        .select('pnl, status, ticker, strategy, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (data) setJournal(data)
    } catch(e) {}
  }

  // Market stats from shared quotes context
  const quoteList = Object.values(quotes)
  const upCount    = quoteList.filter(q => (q.changePct || 0) > 0).length
  const downCount  = quoteList.filter(q => (q.changePct || 0) < 0).length
  const spy        = getQuote('SPY')
  const marketMood = upCount > downCount ? 'Bullish' : upCount < downCount ? 'Bearish' : 'Mixed'
  const moodColor  = upCount > downCount ? '#10b981' : upCount < downCount ? '#ef4444' : '#f59e0b'
  const sessLabel  = { regular:'Market Open', premarket:'Pre-Market', afterhours:'After Hours', closed:'Market Closed' }[session] || 'Closed'
  const sessColor  = { regular:'#10b981', premarket:'#f59e0b', afterhours:'#8b5cf6', closed:'#4a5c7a' }[session] || '#4a5c7a'

  // Journal stats
  const closed   = journal.filter(j => j.status === 'closed')
  const totalPnl = closed.reduce((s, j) => s + parseFloat(j.pnl || 0), 0)
  const wins     = closed.filter(j => parseFloat(j.pnl || 0) > 0)
  const winRate  = closed.length ? Math.round(wins.length / closed.length * 100) : null

  const s = {
    page:   { padding:24, fontFamily:'"DM Mono",monospace', color:'#e2e8f0' },
    grid:   { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:24 },
    card:   { background:'#0d1117', border:'1px solid #1e2d3d', borderRadius:10, padding:18 },
    lbl:    { color:'#4a5c7a', fontSize:10, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' },
    val:    (c) => ({ color:c||'#e2e8f0', fontSize:20, fontWeight:700 }),
    sec:    { background:'#0d1117', border:'1px solid #1e2d3d', borderRadius:10, padding:20, marginBottom:16 },
    stitle: { color:'#e2e8f0', fontSize:14, fontWeight:600, marginBottom:14 },
    th:     { color:'#4a5c7a', fontSize:10, padding:'7px 12px', textAlign:'left', borderBottom:'1px solid #1e2d3d', textTransform:'uppercase' },
    td:     { color:'#8b9fc0', fontSize:12, padding:'10px 12px', borderBottom:'1px solid #0a0f1a' },
  }

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'80vh',color:'#4a5c7a',fontFamily:'"DM Mono",monospace',fontSize:13 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:28,marginBottom:12,animation:'spin 1.2s linear infinite',display:'inline-block' }}>&#x26A1;</div>
        <div>Loading dashboard...</div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const isPro = profile?.plan === 'pro'

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ color:'#e2e8f0',fontSize:22,fontWeight:700,marginBottom:5 }}>
          Welcome back, {user?.email?.split('@')[0]} &#x26A1;
        </div>
        <div style={{ display:'flex',gap:10,alignItems:'center',flexWrap:'wrap' }}>
          <span style={{ color:'#4a5c7a',fontSize:12 }}>
            Plan: <span style={{ color:isPro?'#60a5fa':'#4a5c7a',fontWeight:600 }}>{(profile?.plan||'free').toUpperCase()}</span>
          </span>
          <span style={{ color:'#1e2d3d' }}>·</span>
          <span style={{ color:'#4a5c7a',fontSize:12 }}>{new Date().toLocaleDateString('en-US',{ weekday:'long',month:'long',day:'numeric' })}</span>
          <span style={{ color:'#1e2d3d' }}>·</span>
          <span style={{ padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:600,color:sessColor,background:sessColor+'22' }}>{sessLabel}</span>
          {lastUpdate && <span style={{ color:'#1e2d3d',fontSize:11 }}>· updated {lastUpdate.toLocaleTimeString()}</span>}
        </div>
      </div>

      {!isPro && (
        <div style={{ background:'rgba(37,99,235,0.08)',border:'1px solid rgba(37,99,235,0.25)',borderRadius:10,padding:'14px 18px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div>
            <div style={{ color:'#93c5fd',fontSize:13,fontWeight:600 }}>Upgrade to Pro</div>
            <div style={{ color:'#4a5c7a',fontSize:11,marginTop:3 }}>Full market intelligence, AI analysis, unlimited journal</div>
          </div>
          <a href="/app" style={{ background:'#2563eb',color:'white',padding:'8px 16px',borderRadius:6,fontSize:11,textDecoration:'none',fontFamily:'inherit',fontWeight:600 }}>Upgrade &#x2192;</a>
        </div>
      )}

      {/* Stats */}
      <div style={s.grid}>
        <div style={s.card}>
          <div style={s.lbl}>Market Mood</div>
          <div style={s.val(moodColor)}>{marketMood}</div>
          <div style={{ color:'#4a5c7a',fontSize:10,marginTop:6 }}>{upCount} up · {downCount} down</div>
        </div>
        <div style={s.card}>
          <div style={s.lbl}>SPY</div>
          {spy ? (
            <>
              <div style={s.val('#60a5fa')}>${spy.price?.toFixed(2)}</div>
              <div style={{ color:spy.changePct>=0?'#10b981':'#ef4444',fontSize:11,marginTop:6 }}>
                {spy.changePct>=0?'+':''}{spy.changePct?.toFixed(2)}% today
              </div>
            </>
          ) : <div style={{ color:'#4a5c7a',fontSize:12 }}>Loading...</div>}
        </div>
        <div style={s.card}>
          <div style={s.lbl}>Journal P&amp;L</div>
          {closed.length > 0 ? (
            <>
              <div style={s.val(totalPnl>=0?'#10b981':'#ef4444')}>{totalPnl>=0?'+':''}{totalPnl.toFixed(0)}</div>
              <div style={{ color:'#4a5c7a',fontSize:10,marginTop:6 }}>{closed.length} trades · {winRate}% win rate</div>
            </>
          ) : <div style={{ color:'#4a5c7a',fontSize:12 }}>No trades yet</div>}
        </div>
        <div style={s.card}>
          <div style={s.lbl}>Open Positions</div>
          <div style={s.val()}>{journal.filter(j=>j.status==='open').length}</div>
          <div style={{ color:'#4a5c7a',fontSize:10,marginTop:6 }}>{journal.length} total logged</div>
        </div>
      </div>

      {/* Market snapshot */}
      <div style={s.sec}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
          <div style={s.stitle}>Market Snapshot</div>
          <a href="/app/signals" style={{ color:'#3b82f6',fontSize:11,textDecoration:'none' }}>Full analysis &#x2192;</a>
        </div>
        {mktLoading || !quoteList.length ? (
          <div style={{ color:'#4a5c7a',fontSize:12,padding:'16px 0' }}>Loading market data...</div>
        ) : (
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead><tr>{['Symbol','Price','Change','Volume','Session'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {quoteList.map(q => {
                const dispPct   = q.effectiveChangePct ?? q.changePct ?? 0
                const dispPrice = q.effectivePrice ?? q.price
                return (
                  <tr key={q.symbol}>
                    <td style={{ ...s.td,color:'#e2e8f0',fontWeight:600 }}>{q.symbol}</td>
                    <td style={s.td}>
                      ${parseFloat(dispPrice||0).toFixed(2)}
                      {q.extPrice && <span style={{ color:'#8b5cf6',fontSize:10,marginLeft:6 }}>ext</span>}
                    </td>
                    <td style={{ ...s.td,color:dispPct>=0?'#10b981':'#ef4444' }}>
                      {dispPct>=0?'+':''}{parseFloat(dispPct||0).toFixed(2)}%
                    </td>
                    <td style={{ ...s.td,color:'#4a5c7a' }}>{q.volume?(q.volume/1e6).toFixed(1)+'M':'—'}</td>
                    <td style={s.td}>
                      <span style={{
                        padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:600,
                        color:q.session==='regular'?'#10b981':q.session==='premarket'||q.session==='afterhours'?'#f59e0b':'#4a5c7a',
                        background:q.session==='regular'?'rgba(16,185,129,0.12)':q.session==='premarket'||q.session==='afterhours'?'rgba(245,158,11,0.12)':'rgba(74,92,122,0.12)',
                      }}>
                        {q.session==='regular'?'Open':q.session==='premarket'?'Pre':q.session==='afterhours'?'AH':'Closed'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent journal */}
      {journal.length > 0 && (
        <div style={s.sec}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
            <div style={s.stitle}>Recent Trades</div>
            <a href="/app/journal" style={{ color:'#3b82f6',fontSize:11,textDecoration:'none' }}>All entries &#x2192;</a>
          </div>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead><tr>{['Ticker','Strategy','P&L','Date'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {journal.slice(0,5).map((j,i) => {
                const pnl = parseFloat(j.pnl||0)
                return (
                  <tr key={i}>
                    <td style={{ ...s.td,color:'#e2e8f0',fontWeight:600 }}>{j.ticker}</td>
                    <td style={s.td}>{j.strategy||'—'}</td>
                    <td style={{ ...s.td,color:pnl>=0?'#10b981':'#ef4444' }}>
                      {j.status==='closed'?(pnl>=0?'+':'')+pnl.toFixed(2):'open'}
                    </td>
                    <td style={{ ...s.td,color:'#4a5c7a' }}>{j.created_at?.split('T')[0]}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick actions */}
      <div style={s.sec}>
        <div style={s.stitle}>Quick Actions</div>
        <div style={{ display:'flex',gap:12,flexWrap:'wrap' }}>
          {[
            { label:'&#x1F4CA; Signals',   href:'/app/signals',   color:'#2563eb' },
            { label:'&#x1F4D4; Journal',   href:'/app/journal',   color:'#059669' },
            { label:'&#x1F4BC; Portfolio', href:'/app/portfolio', color:'#7c3aed' },
          ].map(({label,href,color}) => (
            <a key={href} href={href} style={{ padding:'10px 20px',borderRadius:8,background:color+'22',border:'1px solid '+color+'44',color,fontSize:12,textDecoration:'none',fontFamily:'inherit',fontWeight:600 }}
              dangerouslySetInnerHTML={{ __html:label }} />
          ))}
        </div>
      </div>
    </div>
  )
}
