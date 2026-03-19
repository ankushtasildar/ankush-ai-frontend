import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'

const WATCHLIST = ['SPY','QQQ','AAPL','TSLA','NVDA','MSFT','AMZN','META','GOOGL','AMD']

const SIGNAL_RULES = (prev, curr) => {
  const chg = ((curr - prev) / prev) * 100
  if (chg > 1.5) return { signal: 'BUY', strength: 'STRONG', color: '#10b981' }
  if (chg > 0.5) return { signal: 'BUY', strength: 'WEAK', color: '#34d399' }
  if (chg < -1.5) return { signal: 'SELL', strength: 'STRONG', color: '#ef4444' }
  if (chg < -0.5) return { signal: 'SELL', strength: 'WEAK', color: '#f87171' }
  return { signal: 'HOLD', strength: 'NEUTRAL', color: '#f59e0b' }
}

export default function Signals() {
  const { user } = useAuth()
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    fetchQuotes()
    const interval = setInterval(fetchQuotes, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchQuotes() {
    try {
      const symbols = WATCHLIST.join(',')
      const res = await fetch('/api/quotes?symbols=' + symbols)
      if (res.ok) {
        const data = await res.json()
        setQuotes(data)
        setLastUpdate(new Date())
      }
    } catch (e) {
      console.error('Quote fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'ALL' ? quotes : quotes.filter(q => q.signal === filter)

  const s = {
    page: { padding: '24px', fontFamily: '"DM Mono", monospace', minHeight: '100vh' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { color: '#e2e8f0', fontSize: 20, margin: 0 },
    sub: { color: '#4a5c7a', fontSize: 11, marginTop: 4 },
    filters: { display: 'flex', gap: 8, marginBottom: 20 },
    filterBtn: (active) => ({ padding: '6px 14px', borderRadius: 6, border: '1px solid', fontSize: 11, cursor: 'pointer', fontFamily: '"DM Mono",monospace', background: active ? '#1e40af' : 'transparent', color: active ? '#93c5fd' : '#4a5c7a', borderColor: active ? '#1e40af' : '#1e2d3d' }),
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 },
    card: (color) => ({ background: '#0d1117', border: '1px solid #1e2d3d', borderLeft: '3px solid ' + color, borderRadius: 10, padding: 16, position: 'relative' }),
    sym: { color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginBottom: 4 },
    price: { color: '#60a5fa', fontSize: 22, fontWeight: 700, marginBottom: 8 },
    chgPos: { color: '#10b981', fontSize: 13 },
    chgNeg: { color: '#ef4444', fontSize: 13 },
    badge: (color) => ({ display: 'inline-block', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, color, background: color + '22', border: '1px solid ' + color + '44' }),
    meta: { color: '#4a5c7a', fontSize: 11, marginTop: 8 },
    pulse: { width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', marginRight: 6, animation: 'pulse 2s infinite' },
    refreshBtn: { background: '#1e2d3d', border: 'none', color: '#8b9fc0', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: '"DM Mono",monospace' },
  }

  return (
    <div style={s.page}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={s.header}>
        <div>
          <h1 style={s.title}>⚡ Live Signals</h1>
          <div style={s.sub}>
            <span style={s.pulse} />
            {lastUpdate ? 'Updated ' + lastUpdate.toLocaleTimeString() : 'Loading...'} · Auto-refresh 30s
          </div>
        </div>
        <button onClick={fetchQuotes} style={s.refreshBtn}>&#8635; Refresh</button>
      </div>

      <div style={s.filters}>
        {['ALL','BUY','SELL','HOLD'].map(f => (
          <button key={f} style={s.filterBtn(filter === f)} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:300,color:'#4a5c7a',fontSize:13 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:28,animation:'spin 1.5s linear infinite',marginBottom:12 }}>⚡</div>
            <div>Fetching live quotes...</div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center',color:'#4a5c7a',fontSize:13,padding:60 }}>No signals match filter.</div>
      ) : (
        <div style={s.grid}>
          {filtered.map(q => (
            <div key={q.symbol} style={s.card(q.signalColor)}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={s.sym}>{q.symbol}</div>
                  <div style={{ color:'#4a5c7a', fontSize:11, marginBottom:8 }}>{q.name}</div>
                </div>
                <span style={s.badge(q.signalColor)}>{q.signal}</span>
              </div>
              <div style={s.price}>${q.price?.toFixed(2)}</div>
              <div style={q.change >= 0 ? s.chgPos : s.chgNeg}>
                {q.change >= 0 ? '+' : ''}{q.change?.toFixed(2)} ({q.changePct >= 0 ? '+' : ''}{q.changePct?.toFixed(2)}%)
              </div>
              <div style={s.meta}>
                Vol: {q.volume ? (q.volume/1e6).toFixed(1)+'M' : 'N/A'} · 
                Mkt: {q.marketCap ? '$'+(q.marketCap/1e9).toFixed(0)+'B' : 'N/A'}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: q.signalColor + 'bb' }}>
                {q.strength} {q.signal} · {q.reason}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
