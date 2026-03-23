import { useState, useEffect, useRef } from 'react'

const fmt = (n, dec=2) => n == null ? '--' : Number(n).toLocaleString('en-US', {minimumFractionDigits:dec, maximumFractionDigits:dec})
const fmtVol = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : n?.toFixed(0) || '--'

// US Market Holidays 2025-2027 (NYSE) — Jordan Hayes
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
  // Move to next day if past 4pm ET
  if (check.getHours() >= 16) { check.setDate(check.getDate() + 1) }
  // Find next weekday that isn't a holiday
  for (let i = 0; i < 10; i++) {
    const dow = check.getDay()
    const dateStr = check.toISOString().split('T')[0]
    if (dow !== 0 && dow !== 6 && !MARKET_HOLIDAYS.has(dateStr)) {
      // Market opens at 9:30 AM ET
      const openET = new Date(check)
      openET.setHours(9, 30, 0, 0)
      // Convert ET open time to UTC for comparison
      const openUTC = new Date(openET.toLocaleString('en-US', { timeZone: 'UTC' }))
      // Simple: return the open time in ET as a display string
      const dayLabel = check.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
      return { label: dayLabel + ' 9:30 AM ET', openET }
    }
    check.setDate(check.getDate() + 1)
    check.setHours(0, 0, 0, 0)
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

const SECTOR_ETFS = [
  { ticker: 'XLK',  name: 'Technology',     icon: 'TEC', subSymbols: ['NVDA','MSFT','AAPL','AVGO','ORCL'] },
  { ticker: 'XLF',  name: 'Financials',     icon: 'FIN', subSymbols: ['JPM','BAC','WFC','GS','MS'] },
  { ticker: 'XLV',  name: 'Healthcare',     icon: 'HLT', subSymbols: ['LLY','UNH','JNJ','ABBV','MRK'] },
  { ticker: 'XLE',  name: 'Energy',         icon: 'NRG', subSymbols: ['XOM','CVX','COP','SLB','EOG'] },
  { ticker: 'XLY',  name: 'Consumer Disc',  icon: 'CSM', subSymbols: ['AMZN','TSLA','HD','MCD','NKE'] },
  { ticker: 'XLP',  name: 'Consumer Stpl',  icon: 'STL', subSymbols: ['WMT','PG','KO','COST','PM'] },
  { ticker: 'XLI',  name: 'Industrials',    icon: 'IND', subSymbols: ['GE','RTX','HON','CAT','UNP'] },
  { ticker: 'XLB',  name: 'Materials',      icon: 'MAT', subSymbols: ['LIN','APD','SHW','FCX','NEM'] },
  { ticker: 'XLRE', name: 'Real Estate',    icon: 'REI', subSymbols: ['PLD','AMT','EQIX','SPG','DLR'] },
  { ticker: 'XLU',  name: 'Utilities',      icon: 'UTL', subSymbols: ['NEE','DUK','SO','D','AEP'] },
  { ticker: 'XLC',  name: 'Communication',  icon: 'COM', subSymbols: ['META','GOOGL','NFLX','DIS','VZ'] },
]

function getColor(change) {
  if (change >= 2) return { bg: '#065f46', border: '#059669', text: '#10b981' }
  if (change >= 1) return { bg: '#064e3b', border: '#047857', text: '#34d399' }
  if (change >= 0.3) return { bg: '#052e16', border: '#166534', text: '#4ade80' }
  if (change >= -0.3) return { bg: '#1a1f2e', border: 'rgba(255,255,255,0.08)', text: '#8b9fc0' }
  if (change >= -1) return { bg: '#2d1515', border: '#7f1d1d', text: '#f87171' }
  if (change >= -2) return { bg: '#450a0a', border: '#991b1b', text: '#ef4444' }
  return { bg: '#3f0a0a', border: '#b91c1c', text: '#dc2626' }
}

function HeatmapCell({ sector, quote, isLarge }) {
  const change = quote?.changePercent || 0
  const colors = getColor(change)
  const [expanded, setExpanded] = useState(false)

  return (
    <div onClick={() => setExpanded(!expanded)} 
      style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: isLarge ? '16px' : '12px 14px', cursor: 'pointer', transition: 'all .15s', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.01)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: isLarge ? 16 : 14 }}>{sector.icon}</span>
            <span style={{ fontFamily: '"DM Mono",monospace', fontWeight: 700, color: '#f0f6ff', fontSize: isLarge ? 14 : 12 }}>{sector.ticker}</span>
          </div>
          <div style={{ color: '#6b7a90', fontSize: isLarge ? 11 : 10 }}>{sector.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: colors.text, fontFamily: '"DM Mono",monospace', fontWeight: 700, fontSize: isLarge ? 16 : 13 }}>
            {change > 0 ? '+' : ''}{change.toFixed(2)}%
          </div>
          {quote?.price && <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>${fmt(quote.price)}</div>}
        </div>
      </div>

      {quote?.volume && (
        <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', marginBottom: expanded ? 8 : 0 }}>
          Vol: {fmtVol(quote.volume)}
        </div>
      )}

      {/* Sparkline bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
        <div style={{ width: Math.min(100, Math.abs(change) * 20) + '%', height: '100%', background: colors.text, borderRadius: 2, marginLeft: change < 0 ? 'auto' : '0' }} />
      </div>

      {expanded && sector.subSymbols && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {sector.subSymbols.map(sym => (
            <button key={sym} onClick={e => { e.stopPropagation(); window.location.href = '/app/charts?symbol=' + sym }}
              style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#8b9fc0', fontSize: 9, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>
              {sym}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sectors() {
  const [quotes, setQuotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [session, setSession] = useState(null)
  const [sortBy, setSortBy] = useState('change')
  const [spyData, setSpyData] = useState(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 90000) // refresh every 90s
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      // Fetch context (for SPY/VIX/session) AND sectors in parallel
      const [ctxRes, sectRes] = await Promise.all([
        fetch('/api/market?action=context'),
        fetch('/api/market?action=sectors')
      ])
      if (ctxRes.ok) {
        const d = await ctxRes.json()
        setSpyData(d)
        if (d.session) setSession(d.session)
      }
      if (sectRes.ok) {
        const arr = await sectRes.json()
        if (Array.isArray(arr)) {
          const q = {}
          arr.forEach(s => { q[s.symbol] = { price: s.price, changePercent: s.changePercent ?? 0, change: s.change ?? 0, volume: s.volume } })
          setQuotes(q)
        }
      }
      setLastUpdated(new Date())
    } catch (e) {
      console.log('Sector fetch error:', e.message)
    }
    setLoading(false)
  }

  const sorted = [...SECTOR_ETFS].sort((a, b) => {
    if (sortBy === 'change') return (quotes[b.ticker]?.changePercent || 0) - (quotes[a.ticker]?.changePercent || 0)
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'volume') return (quotes[b.ticker]?.volume || 0) - (quotes[a.ticker]?.volume || 0)
    return 0
  })

  const advancing = SECTOR_ETFS.filter(s => (quotes[s.symbol]?.changePercent || 0) > 0).length
  const declining = SECTOR_ETFS.filter(s => (quotes[s.symbol]?.changePercent || 0) < 0).length
  const topSector = sorted[0]
  const worstSector = sorted[sorted.length - 1]

  const tabStyle = (t) => ({ padding: '5px 12px', background: sortBy === t ? 'rgba(37,99,235,0.12)' : 'none', border: '1px solid ' + (sortBy === t ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 6, color: sortBy === t ? '#60a5fa' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' })

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 3px' }}>📊 Sector Heatmap</h1>
          <div style={{ color: '#3d4e62', fontSize: 11 }}>
            {session && session.session !== 'regular'
              ? <>
                  <span style={{color:'#f59e0b',fontWeight:600}}>
                    {session.session==='weekend'?'Weekend · Last Session':''}
                    {session.session==='premarket'?'Pre-Market · vs Prior Close':''}
                    {session.session==='postmarket'?'After Hours · vs Close':''}
                  </span>
                  {' · '}{advancing} advancing · {declining} declining · Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
                </>
              : <>{advancing} advancing · {declining} declining · {lastUpdated ? 'Updated ' + lastUpdated.toLocaleTimeString() : 'Loading...'}</>
            }
              {session && (
                <span style={{marginLeft:8,padding:'1px 7px',borderRadius:10,fontSize:10,fontWeight:700,background:
                  session.session==='regular'?'rgba(16,185,129,0.15)':
                  session.session==='premarket'||session.session==='postmarket'?'rgba(245,158,11,0.15)':
                  'rgba(100,116,139,0.15)',
                  color:session.session==='regular'?'#10b981':session.session==='premarket'||session.session==='postmarket'?'#f59e0b':'#64748b'
                }}>
                  {session.session==='weekend'?'Weekend — Last Session':session.label}
                </span>
              )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['change','Performance'], ['volume','Volume'], ['name','A-Z']].map(([t, l]) => (
            <button key={t} style={tabStyle(t)} onClick={() => setSortBy(t)}>{l}</button>
          ))}
        </div>
      </div>

      {/* Market regime banner */}
      {spyData?.marketMood && (
        <div style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ color: '#8b9fc0', fontSize: 11 }}>Market: <strong style={{ color: spyData.marketMood.mood === 'Risk On' ? '#10b981' : spyData.marketMood.mood === 'Risk Off' ? '#ef4444' : '#f59e0b' }}>{spyData.marketMood.mood}</strong></div>
          {spyData.spy?.price && <div style={{ color: '#8b9fc0', fontSize: 11 }}>SPY <strong style={{ color: '#f0f6ff' }}>${fmt(spyData.spy.price)}</strong> <span style={{ color: (spyData.spy.changePercent || 0) >= 0 ? '#10b981' : '#ef4444' }}>{(spyData.spy.changePercent || 0) >= 0 ? '+' : ''}{fmt(spyData.spy.changePercent)}%</span></div>}
          {spyData.vix?.current && <div style={{ color: '#8b9fc0', fontSize: 11 }}>VIX <strong style={{ color: spyData.vix.current > 25 ? '#ef4444' : spyData.vix.current > 18 ? '#f59e0b' : '#10b981' }}>{fmt(spyData.vix.current)}</strong></div>}
          {topSector && <div style={{ color: '#8b9fc0', fontSize: 11 }}>Leader: <strong style={{ color: '#10b981' }}>{topSector.name}</strong></div>}
          {worstSector && <div style={{ color: '#8b9fc0', fontSize: 11 }}>Laggard: <strong style={{ color: '#ef4444' }}>{worstSector.name}</strong></div>}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#4a5c7a', padding: 40 }}>Loading sector data...</div>
      ) : (
        <div {/* Session status banner — countdown when closed/weekend/premarket */}
        {session && session.session !== 'regular' && (
          <div style={{
            margin: '0 0 16px',
            padding: '10px 16px',
            borderRadius: 10,
            background: session.session === 'weekend' ? 'rgba(100,116,139,0.1)' : 'rgba(245,158,11,0.08)',
            border: '1px solid ' + (session.session === 'weekend' ? 'rgba(100,116,139,0.2)' : 'rgba(245,158,11,0.2)'),
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8
          }}>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:session.session==='weekend'?'#64748b':'#f59e0b',marginBottom:2}}>
                {session.session==='weekend' && '🔒 Market Closed — Weekend'}
                {session.session==='premarket' && '🌅 Pre-Market Trading · Prices vs Prior Close'}
                {session.session==='postmarket' && '🌙 After-Hours Trading · Prices vs Close'}
              </div>
              {nextOpen && session.session !== 'premarket' && session.session !== 'postmarket' && (
                <div style={{fontSize:11,color:'var(--text-muted)'}}>Next session: {nextOpen.label}</div>
              )}
            </div>
            {countdown && session.session !== 'regular' && (
              <div style={{
                display:'flex',alignItems:'center',gap:8,
                padding:'6px 14px',borderRadius:20,
                background: session.session==='weekend' ? 'rgba(100,116,139,0.15)' : 'rgba(245,158,11,0.12)',
                border:'1px solid '+(session.session==='weekend'?'rgba(100,116,139,0.3)':'rgba(245,158,11,0.3)')
              }}>
                <span style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>
                  {session.session==='weekend'||session.session==='postmarket'?'Opens in':'Pre-Market closes'}
                </span>
                <span style={{fontSize:14,fontWeight:800,color:session.session==='weekend'?'#94a3b8':'#f59e0b',fontFamily:'var(--font-mono)',letterSpacing:'0.05em'}}>
                  {countdown}
                </span>
              </div>
            )}
          </div>
        )}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
          {sorted.map(sector => (
            <HeatmapCell key={sector.ticker} sector={sector} quote={quotes[sector.ticker]} isLarge={false} />
          ))}
        </div>
      )}
    </div>
  )
}
