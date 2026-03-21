import { useState, useEffect } from 'react'

const fmt = (n, dec=2) => n == null ? '--' : Number(n).toLocaleString('en-US', {minimumFractionDigits:dec, maximumFractionDigits:dec})
const fmtVol = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : n?.toFixed(0) || '--'

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
  const [sortBy, setSortBy] = useState('change')
  const [spyData, setSpyData] = useState(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 90000) // refresh every 90s
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const r = await fetch('/api/market?action=context')
      if (r.ok) {
        const d = await r.json()
        setSpyData(d)
        // Extract sector quotes from context
        if (d.sectors) {
          const q = {}
          d.sectors.forEach(s => { q[s.ticker] = { price: s.price, changePercent: s.change, volume: s.volume } })
          setQuotes(q)
        } else {
          // Fallback: fetch sector ETFs directly
          const syms = SECTOR_ETFS.map(s => s.ticker).join(',')
          const r2 = await fetch('/api/market?action=quotes&symbols=' + syms)
          if (r2.ok) setQuotes(await r2.json())
        }
        setLastUpdated(new Date())
      }
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

  const advancing = SECTOR_ETFS.filter(s => (quotes[s.ticker]?.changePercent || 0) > 0).length
  const declining = SECTOR_ETFS.filter(s => (quotes[s.ticker]?.changePercent || 0) < 0).length
  const topSector = sorted[0]
  const worstSector = sorted[sorted.length - 1]

  const tabStyle = (t) => ({ padding: '5px 12px', background: sortBy === t ? 'rgba(37,99,235,0.12)' : 'none', border: '1px solid ' + (sortBy === t ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 6, color: sortBy === t ? '#60a5fa' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' })

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 3px' }}>ð¡ Sector Heatmap</h1>
          <div style={{ color: '#3d4e62', fontSize: 11 }}>
            {advancing} advancing Â· {declining} declining Â· {lastUpdated ? 'Updated ' + lastUpdated.toLocaleTimeString() : 'Loading...'}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
          {sorted.map(sector => (
            <HeatmapCell key={sector.ticker} sector={sector} quote={quotes[sector.ticker]} isLarge={false} />
          ))}
        </div>
      )}
    </div>
  )
}
