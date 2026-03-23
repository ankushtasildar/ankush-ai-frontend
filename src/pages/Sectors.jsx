// src/pages/Sectors.jsx — AnkushAI Sector Heatmap v4
// Marcus Webb (Quant) + Jordan Hayes (Design) + Priya Nair (Product)
// Constituent-basket composite sectors — equal-weight avg of named stocks
// 12 sectors · hover for top movers · breadth bar · session-aware

import { useState, useEffect, useRef } from 'react'

// ── US Market Holidays 2025-2027 (NYSE) ─────────────────────────────────────
const MARKET_HOLIDAYS = new Set([
  '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19',
  '2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19',
  '2026-07-03','2026-08-31','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18',
  '2027-07-05','2027-09-06','2027-11-25','2027-12-24',
])

function getNextMarketOpen() {
  const now = new Date()
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  let check = new Date(etNow)
  if (check.getHours() >= 16) { check.setDate(check.getDate() + 1); check.setHours(0,0,0,0) }
  for (let i = 0; i < 10; i++) {
    const dow = check.getDay()
    const dateStr = check.toISOString().split('T')[0]
    if (dow !== 0 && dow !== 6 && !MARKET_HOLIDAYS.has(dateStr)) {
      const openET = new Date(check); openET.setHours(9, 30, 0, 0)
      const dayLabel = check.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
      return { label: dayLabel + ' 9:30 AM ET', openET }
    }
    check.setDate(check.getDate() + 1); check.setHours(0,0,0,0)
  }
  return null
}

function useCountdown(session) {
  const [countdown, setCountdown] = useState(null)
  const [nextOpen, setNextOpen] = useState(null)
  const timerRef = useRef(null)
  useEffect(() => {
    if (!session || session.session === 'regular') { setCountdown(null); return }
    const next = getNextMarketOpen()
    if (!next) return
    setNextOpen(next)
    function tick() {
      const now = new Date()
      const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const diff = next.openET - etNow
      if (diff <= 0) { setCountdown('Opening now...'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown((h > 0 ? h + 'h ' : '') + m + 'm ' + s + 's')
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => clearInterval(timerRef.current)
  }, [session?.session])
  return { countdown, nextOpen }
}

function pct(v) {
  if (v === undefined || v === null) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

function colorFor(v) {
  const n = parseFloat(v) || 0
  if (n > 2)   return '#10b981'
  if (n > 0.5) return '#34d399'
  if (n > 0)   return '#6ee7b7'
  if (n < -2)  return '#ef4444'
  if (n < -0.5)return '#f87171'
  if (n < 0)   return '#fca5a5'
  return '#64748b'
}

function bgFor(v) {
  const n = parseFloat(v) || 0
  if (n > 2)   return 'rgba(16,185,129,0.18)'
  if (n > 0.5) return 'rgba(16,185,129,0.10)'
  if (n > 0)   return 'rgba(16,185,129,0.05)'
  if (n < -2)  return 'rgba(239,68,68,0.18)'
  if (n < -0.5)return 'rgba(239,68,68,0.10)'
  if (n < 0)   return 'rgba(239,68,68,0.05)'
  return 'rgba(100,116,139,0.08)'
}

function SectorCard({ sector, session }) {
  const [hovered, setHovered] = useState(false)
  const chg = sector.changePercent || 0
  const color = colorFor(chg)
  const bg = bgFor(chg)
  const breadthPct = sector.stocksScored > 0 ? Math.round((sector.advancers / sector.stocksScored) * 100) : 0

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bg,
        border: '1px solid ' + color + '30',
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'default',
        position: 'relative',
        transition: 'all 0.15s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 4px 20px ' + color + '20' : 'none',
        minHeight: 90,
      }}
    >
      {/* Session label pill */}
      {session && session.session !== 'regular' && (
        <div style={{position:'absolute',top:8,right:8,fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:6,background:'rgba(245,158,11,0.15)',color:'#f59e0b',letterSpacing:'0.05em'}}>
          {session.session === 'premarket' ? 'PRE' : session.session === 'postmarket' ? 'AH' : 'CLOSED'}
        </div>
      )}

      {/* Header row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', display:'flex', alignItems:'center', gap:5 }}>
            <span>{sector.emoji}</span>
            <span>{sector.name}</span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>
            {sector.stocksScored}/{sector.totalConstituents} stocks · {sector.advancers}↑ {sector.decliners}↓
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
            {pct(chg)}
          </div>
        </div>
      </div>

      {/* Breadth bar */}
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: hovered ? 10 : 0 }}>
        <div style={{ height: '100%', width: breadthPct + '%', background: chg >= 0 ? '#10b981' : '#ef4444', borderRadius: 2, transition: 'width 0.5s ease' }} />
      </div>

      {/* Hover movers panel */}
      {hovered && sector.topMovers && sector.topMovers.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 4 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
            Top Movers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sector.topMovers.map(m => (
              <div key={m.symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{m.symbol}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: colorFor(m.changePercent), fontFamily: 'var(--font-mono)' }}>
                  {pct(m.changePercent)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Sectors() {
  const [sectors, setSectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [sortBy, setSortBy] = useState('change')
  const [session, setSession] = useState(null)
  const { countdown, nextOpen } = useCountdown(session)

  async function loadData() {
    setError(null)
    try {
      const [compositeRes, ctxRes] = await Promise.all([
        fetch('/api/sector-composites'),
        fetch('/api/market?action=context'),
      ])
      if (compositeRes.ok) {
        const data = await compositeRes.json()
        if (Array.isArray(data)) setSectors(data)
        else if (data.error) setError(data.error)
      }
      if (ctxRes.ok) {
        const ctx = await ctxRes.json()
        if (ctx.session) setSession(ctx.session)
      }
      setLastUpdated(new Date())
    } catch(e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 90000)
    return () => clearInterval(interval)
  }, [])

  // Sort
  const sorted = [...sectors].sort((a, b) => {
    if (sortBy === 'change') return (b.changePercent || 0) - (a.changePercent || 0)
    if (sortBy === 'abs')    return Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0)
    if (sortBy === 'name')   return a.name.localeCompare(b.name)
    if (sortBy === 'breadth') return (b.advancers / (b.stocksScored||1)) - (a.advancers / (a.stocksScored||1))
    return 0
  })

  const advancing = sectors.filter(s => (s.changePercent || 0) > 0).length
  const declining = sectors.filter(s => (s.changePercent || 0) < 0).length
  const totalStocks = sectors.reduce((sum, s) => sum + (s.stocksScored || 0), 0)
  const totalAdv = sectors.reduce((sum, s) => sum + (s.advancers || 0), 0)

  const sessionColor = !session ? '#64748b'
    : session.session === 'regular' ? '#10b981'
    : (session.session === 'premarket' || session.session === 'postmarket') ? '#f59e0b'
    : '#64748b'

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 3px' }}>📊 Sector Heatmap</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {loading ? 'Loading...' : (
              <>
                {session && session.session !== 'regular'
                  ? <><span style={{color:sessionColor,fontWeight:600}}>
                      {session.session==='weekend'?'Weekend · Last Session':''}
                      {session.session==='premarket'?'Pre-Market · vs Prior Close':''}
                      {session.session==='postmarket'?'After Hours · vs Close':''}
                    </span>{' · '}</>
                  : null
                }
                {advancing} sectors advancing · {declining} declining
                {' · '}{totalAdv}/{totalStocks} stocks advancing
                {' · '}Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
              </>
            )}
            {session && (
              <span style={{
                marginLeft: 8, padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                background: session.session==='regular'?'rgba(16,185,129,0.15)':session.session==='premarket'||session.session==='postmarket'?'rgba(245,158,11,0.15)':'rgba(100,116,139,0.15)',
                color: sessionColor
              }}>
                {session.session==='weekend' ? 'Weekend — Last Session' : session.label}
              </span>
            )}
          </div>
        </div>
        {/* Sort controls */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[['change','Performance'],['breadth','Breadth'],['abs','Volatility'],['name','A-Z']].map(([v,label]) => (
            <button key={v} onClick={() => setSortBy(v)}
              style={{ padding:'5px 12px', background: sortBy===v?'rgba(37,99,235,0.12)':'none',
                border:'1px solid '+(sortBy===v?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.06)'),
                borderRadius:6, color:sortBy===v?'#3b82f6':'var(--text-muted)', cursor:'pointer', fontSize:11, fontWeight:sortBy===v?700:400 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Session banner — closed/weekend/pre/post */}
      {session && session.session !== 'regular' && (
        <div style={{
          margin: '12px 0 16px',
          padding: '10px 16px',
          borderRadius: 10,
          background: session.session==='weekend'?'rgba(100,116,139,0.08)':'rgba(245,158,11,0.07)',
          border:'1px solid '+(session.session==='weekend'?'rgba(100,116,139,0.2)':'rgba(245,158,11,0.2)'),
          display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8
        }}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:session.session==='weekend'?'#64748b':'#f59e0b',marginBottom:2}}>
              {session.session==='weekend' && '🔒 Market Closed — Showing Last Session'}
              {session.session==='premarket' && '🌅 Pre-Market Trading · % Change vs Prior Close'}
              {session.session==='postmarket' && '🌙 After-Hours Trading · % Change vs Close'}
            </div>
            {nextOpen && (session.session==='weekend') && (
              <div style={{fontSize:11,color:'var(--text-muted)'}}>Next session: {nextOpen.label}</div>
            )}
          </div>
          {countdown && (
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 14px',borderRadius:20,
              background:session.session==='weekend'?'rgba(100,116,139,0.12)':'rgba(245,158,11,0.1)',
              border:'1px solid '+(session.session==='weekend'?'rgba(100,116,139,0.25)':'rgba(245,158,11,0.25)')}}>
              <span style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>
                {session.session==='weekend'||session.session==='postmarket'?'Opens in':'Pre-Market ends in'}
              </span>
              <span style={{fontSize:15,fontWeight:800,color:session.session==='weekend'?'#94a3b8':'#f59e0b',fontFamily:'var(--font-mono)'}}>
                {countdown}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:12,color:'#ef4444'}}>
          ⚠️ {error} · <button onClick={loadData} style={{background:'none',border:'none',color:'#3b82f6',cursor:'pointer',fontSize:12}}>Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12}}>
          {Array(12).fill(0).map((_,i) => (
            <div key={i} style={{height:90,borderRadius:12,background:'rgba(255,255,255,0.04)',animation:'pulse 1.5s ease-in-out infinite'}} />
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && sorted.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {sorted.map(sector => (
            <SectorCard key={sector.id} sector={sector} session={session} />
          ))}
        </div>
      )}

      {/* Market insight bar */}
      {!loading && sorted.length > 0 && (() => {
        const top = sorted[0]
        const bot = [...sorted].sort((a,b) => (a.changePercent||0)-(b.changePercent||0))[0]
        return (
          <div style={{marginTop:16,padding:'10px 16px',borderRadius:10,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',fontSize:11,color:'var(--text-muted)',display:'flex',gap:20,flexWrap:'wrap'}}>
            <span>🏆 <strong style={{color:'#10b981'}}>{top?.name}</strong> leading <span style={{color:'#10b981',fontFamily:'var(--font-mono)'}}>{pct(top?.changePercent)}</span></span>
            <span>📉 <strong style={{color:'#ef4444'}}>{bot?.name}</strong> lagging <span style={{color:'#ef4444',fontFamily:'var(--font-mono)'}}>{pct(bot?.changePercent)}</span></span>
            <span>📊 {totalAdv} of {totalStocks} stocks advancing ({totalStocks>0?Math.round(totalAdv/totalStocks*100):0}% breadth)</span>
          </div>
        )
      })()}

    </div>
  )
}
