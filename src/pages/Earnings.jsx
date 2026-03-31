import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const fmt = (n, dec=2) => n == null ? '--' : Number(n).toLocaleString('en-US', {minimumFractionDigits:dec, maximumFractionDigits:dec})
const fmtPct = n => n == null ? '--' : (n > 0 ? '+' : '') + fmt(n, 2) + '%'

const KEY_SYMBOLS = ['NVDA','AMD','MSFT','AAPL','AMZN','GOOGL','META','TSLA','NFLX','CRM','ORCL','INTC','JPM','BAC','GS','MS','WMT','COST','HD','TGT','NKE','MU','FDX','LULU','ACN','PAYX','WBA','PVH']

const TODAY = new Date()
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function dateStr(d) { return d.toISOString().split('T')[0] }
function dayLabel(ds) {
  const d = new Date(ds + 'T00:00:00')
  const diff = Math.round((d - new Date(TODAY.toDateString())) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff >= 2 && diff <= 6) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Beat rate color
function beatColor(pct) {
  if (pct >= 80) return '#10b981'
  if (pct >= 60) return '#f59e0b'
  return '#ef4444'
}

// IV Rank tier
function ivTier(rank) {
  if (rank >= 70) return { label: 'HIGH', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' }
  if (rank >= 40) return { label: 'MID', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' }
  return { label: 'LOW', color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)' }
}

// ââ EARNINGS CARD (Bloomberg-style dense layout) âââââââââââââââââââââââââââââ
function EarningsCard({ item, onAnalyze, analysisData, analyzing }) {
  const daysTo = Math.round((new Date(item.date + 'T00:00:00') - new Date(TODAY.toDateString())) / 86400000)
  const isToday = daysTo === 0
  const isPast = daysTo < 0
  const iv = item.ivRank != null ? ivTier(item.ivRank) : null
  const [expanded, setExpanded] = useState(false)

  const cardBorder = isToday ? 'rgba(239,68,68,0.4)' : analysisData ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'

  return (
    <div style={{ background: '#0c1018', border: '1px solid ' + cardBorder, borderRadius: 10, padding: 0, opacity: isPast ? 0.5 : 1, overflow: 'hidden', transition: 'border-color 0.2s' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: '#f0f6ff' }}>{item.symbol}</span>
          <span style={{ color: '#3d4e62', fontSize: 10, fontFamily: 'var(--font-mono)' }}>{item.time === 'bmo' ? 'BMO' : item.time === 'amc' ? 'AMC' : '?'}</span>
          {isToday && <span style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, padding: '1px 6px', color: '#ef4444', fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 0.5, animation: 'pulse 1.5s infinite' }}>LIVE</span>}
        </div>
        <span style={{ color: isToday ? '#ef4444' : daysTo <= 2 ? '#f59e0b' : '#4a5c7a', fontSize: 10, fontFamily: 'var(--font-mono)' }}>{dayLabel(item.date)}</span>
      </div>
      <div style={{ padding: '2px 14px 0', color: '#4a5c7a', fontSize: 10 }}>{item.name}</div>

      {/* Data grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1, margin: '8px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, overflow: 'hidden' }}>
        {[
          { label: 'EPS Est', value: item.epsEstimate != null ? '$' + fmt(item.epsEstimate) : '--', color: '#8b9bb4' },
          { label: 'Exp Move', value: item.expectedMove != null ? '\u00B1' + fmt(item.expectedMove, 1) + '%' : '--', color: '#8b9bb4' },
          { label: 'IV Rank', value: item.ivRank != null ? item.ivRank : '--', color: iv ? iv.color : '#8b9bb4' },
          { label: 'Beat Rate', value: item.beatsLast8 != null ? item.beatsLast8 + '%' : '--', color: item.beatsLast8 ? beatColor(item.beatsLast8) : '#8b9bb4' },
        ].map((d, i) => (
          <div key={i} style={{ padding: '6px 8px', textAlign: 'center', background: '#0a0e15' }}>
            <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{d.label}</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: d.color }}>{d.value}</div>
          </div>
        ))}
      </div>

      {/* Beat rate bar */}
      {item.beatsLast8 != null && (
        <div style={{ margin: '0 14px 8px', height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: item.beatsLast8 + '%', height: '100%', background: beatColor(item.beatsLast8), borderRadius: 2, transition: 'width 0.6s ease' }} />
        </div>
      )}

      {/* Strategy chip */}
      {item.strategy && (
        <div style={{ margin: '0 14px 8px', background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.12)', borderRadius: 5, padding: '5px 8px' }}>
          <div style={{ color: '#60a5fa', fontSize: 9, fontFamily: 'var(--font-mono)', lineHeight: 1.3 }}>{item.strategy}</div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <button
          onClick={() => { setExpanded(!expanded); if (!analysisData && !analyzing) onAnalyze(item.symbol) }}
          style={{ flex: 1, padding: '8px 0', background: analyzing ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.04)', border: 'none', borderRight: '1px solid rgba(255,255,255,0.04)', color: analyzing ? '#93c5fd' : '#60a5fa', fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', fontWeight: 600, letterSpacing: 0.3, transition: 'background 0.15s' }}
        >
          {analyzing ? 'Analyzing...' : analysisData ? (expanded ? 'Hide Analysis' : 'Show Analysis') : 'AI Analyze'}
        </button>
        <button
          onClick={() => { /* Navigate to Alpha Intelligence with this symbol */ window.location.href = '/app/predict?symbol=' + item.symbol }}
          style={{ flex: 1, padding: '8px 0', background: 'transparent', border: 'none', color: '#4a5c7a', fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'color 0.15s' }}
        >
          Alpha Scan
        </button>
      </div>

      {/* Expandable AI Analysis Panel */}
      {expanded && analysisData && (
        <div style={{ borderTop: '1px solid rgba(59,130,246,0.15)', padding: '12px 14px', background: 'rgba(59,130,246,0.02)' }}>
          {analysisData.volAssessment && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Vol Assessment</div>
              <div style={{ fontSize: 11, color: '#8b9bb4', lineHeight: 1.4 }}>{analysisData.volAssessment}</div>
            </div>
          )}
          {analysisData.recommendation && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Recommendation</div>
              <div style={{ fontSize: 11, color: '#60a5fa', lineHeight: 1.4, fontWeight: 500 }}>{analysisData.recommendation}</div>
            </div>
          )}
          {analysisData.narrative && (
            <div>
              <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Analysis</div>
              <div style={{ fontSize: 10, color: '#6b7a90', lineHeight: 1.5 }}>{typeof analysisData.narrative === 'string' ? analysisData.narrative : JSON.stringify(analysisData.narrative)}</div>
            </div>
          )}
          {!analysisData.volAssessment && !analysisData.recommendation && (
            <div style={{ fontSize: 10, color: '#6b7a90', lineHeight: 1.5 }}>{JSON.stringify(analysisData).substring(0, 300)}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ââ MAIN EARNINGS PAGE âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default function Earnings() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('this_week')
  const [analyses, setAnalyses] = useState({})
  const [analyzingSymbol, setAnalyzingSymbol] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // grid or list

  const SEEDED_EARNINGS = [
    { symbol: 'NKE', name: 'Nike Inc', entryLeadDays: 0, date: dateStr(addDays(TODAY, 1)), time: 'amc', epsEstimate: 0.29, beatsLast8: 75, expectedMove: 8.2, avgMove: 9.1, ivRank: 72, strategy: 'High IV \u2014 Sell iron condor, avoid buying premium' },
    { symbol: 'MU', name: 'Micron Technology', entryLeadDays: 0, date: dateStr(addDays(TODAY, 2)), time: 'amc', epsEstimate: 1.43, beatsLast8: 62, expectedMove: 9.8, avgMove: 11.2, ivRank: 81, strategy: 'IV rank 81 \u2014 sell credit spread, target IV crush' },
    { symbol: 'ORCL', name: 'Oracle Corp', entryLeadDays: 14, date: dateStr(addDays(TODAY, 3)), time: 'amc', epsEstimate: 1.47, beatsLast8: 87, expectedMove: 7.1, avgMove: 6.8, ivRank: 58, strategy: 'Strong beat history \u2014 buy calls 2 weeks before, close before earnings' },
    { symbol: 'ACN', name: 'Accenture', entryLeadDays: 7, date: dateStr(addDays(TODAY, 4)), time: 'bmo', epsEstimate: 2.82, beatsLast8: 100, expectedMove: 4.2, avgMove: 4.8, ivRank: 38, strategy: 'Consistent beater \u2014 consider buying calls if IV rank < 40' },
    { symbol: 'FDX', name: 'FedEx Corp', entryLeadDays: 0, date: dateStr(addDays(TODAY, 7)), time: 'amc', epsEstimate: 4.01, beatsLast8: 62, expectedMove: 6.3, avgMove: 7.9, ivRank: 44, strategy: 'Mixed history \u2014 wait for reaction, trade post-earnings' },
    { symbol: 'LULU', name: 'lululemon', entryLeadDays: 7, date: dateStr(addDays(TODAY, 7)), time: 'amc', epsEstimate: 5.92, beatsLast8: 87, expectedMove: 8.9, avgMove: 10.2, ivRank: 69, strategy: 'Consider debit spread to limit IV crush risk' },
    { symbol: 'WBA', name: 'Walgreens', entryLeadDays: 0, date: dateStr(addDays(TODAY, 8)), time: 'bmo', epsEstimate: -0.06, beatsLast8: 37, expectedMove: 5.1, avgMove: 6.8, ivRank: 45, strategy: 'Turnaround story \u2014 high uncertainty, avoid directional' },
    { symbol: 'COST', name: 'Costco', entryLeadDays: 14, date: dateStr(addDays(TODAY, 10)), time: 'amc', epsEstimate: 4.11, beatsLast8: 87, expectedMove: 3.8, avgMove: 4.1, ivRank: 31, strategy: 'Reliable compounder \u2014 low expected move, buy calls if IV cheap' },
    { symbol: 'PAYX', name: 'Paychex', entryLeadDays: 7, date: dateStr(addDays(TODAY, 11)), time: 'bmo', epsEstimate: 1.41, beatsLast8: 75, expectedMove: 3.1, avgMove: 3.8, ivRank: 22, strategy: 'IV rank 22 \u2014 buy options if needed, very cheap premium' },
    { symbol: 'PVH', name: 'PVH Corp', entryLeadDays: 0, date: dateStr(addDays(TODAY, 12)), time: 'amc', epsEstimate: 2.89, beatsLast8: 62, expectedMove: 7.2, avgMove: 9.4, ivRank: 53, strategy: 'Volatile name \u2014 iron condor at edges of expected move' },
  ]

  useEffect(() => { loadEarnings() }, [])

  async function loadEarnings() {
    setLoading(true)
    let earningsData = [...SEEDED_EARNINGS]
    try {
      const { data } = await supabase.from('macro_events').select('*').eq('event_type', 'earnings').gte('event_date', dateStr(addDays(TODAY, -7))).order('event_date', { ascending: true }).limit(30)
      if (data && data.length > 0) {
        const seededSymbols = new Set(earningsData.map(e => e.symbol))
        data.forEach(evt => {
          if (!seededSymbols.has(evt.symbol)) {
            earningsData.push({ symbol: evt.symbol, name: evt.title || evt.symbol, date: evt.event_date, time: evt.time || '?', epsEstimate: evt.eps_estimate, beatsLast8: evt.beat_rate, expectedMove: evt.expected_move, avgMove: evt.avg_move, ivRank: evt.iv_rank, strategy: evt.strategy_note })
          }
        })
      }
    } catch (e) {}
    earningsData.sort((a, b) => new Date(a.date) - new Date(b.date))
    setEvents(earningsData)
    setLoading(false)
  }

  // AI Earnings Analyzer
  async function analyzeEarnings(symbol) {
    if (analyses[symbol] || analyzingSymbol) return
    setAnalyzingSymbol(symbol)
    try {
      const r = await fetch('/api/earnings-analyzer?symbol=' + symbol)
      if (r.ok) {
        const data = await r.json()
        setAnalyses(prev => ({ ...prev, [symbol]: data }))
      } else {
        setAnalyses(prev => ({ ...prev, [symbol]: { error: 'Analysis unavailable' } }))
      }
    } catch (e) {
      setAnalyses(prev => ({ ...prev, [symbol]: { error: e.message } }))
    }
    setAnalyzingSymbol(null)
  }

  const filterRanges = {
    today: [0, 0], tomorrow: [1, 1], this_week: [-1, 7], next_week: [7, 14], this_month: [-1, 30]
  }

  const filtered = events.filter(e => {
    const daysTo = Math.round((new Date(e.date + 'T00:00:00') - new Date(TODAY.toDateString())) / 86400000)
    const [min, max] = filterRanges[filter]
    return daysTo >= min && daysTo <= max
  })

  // Group by date for section headers
  const grouped = {}
  filtered.forEach(e => {
    const key = e.date
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(e)
  })
  const dateKeys = Object.keys(grouped).sort()

  const filterButtons = [
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'this_week', label: 'This Week' },
    { key: 'next_week', label: 'Next Week' },
    { key: 'this_month', label: 'This Month' },
  ]

  // Stats bar
  const totalUpcoming = events.filter(e => Math.round((new Date(e.date + 'T00:00:00') - new Date(TODAY.toDateString())) / 86400000) >= 0).length
  const highIVCount = events.filter(e => e.ivRank && e.ivRank >= 70).length
  const strongBeatCount = events.filter(e => e.beatsLast8 && e.beatsLast8 >= 80).length

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Earnings Calendar</h1>
          <div style={{ fontSize: 11, color: '#4a5c7a', marginTop: 2 }}>IV analysis · Expected moves · AI strategy recommendations · Historical patterns</div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Upcoming', value: totalUpcoming, color: '#8b9bb4' },
          { label: 'This Week', value: filtered.length, color: '#60a5fa' },
          { label: 'High IV', value: highIVCount, color: '#ef4444', sub: 'sell premium' },
          { label: 'Strong Beat History', value: strongBeatCount, color: '#10b981', sub: '\u226580% rate' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.color }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 8, color: '#3d4e62' }}>{s.sub}</div>}
          </div>
        ))}
      </div>


      {/* Pre-Earnings Plays: entry windows open NOW */}
{(() => { const now = new Date(); const plays = events.filter(e => { if (!e.entryLeadDays || e.entryLeadDays <= 0) return false; const er = new Date(e.date + "T00:00:00"); const entry = new Date(er.getTime() - e.entryLeadDays * 86400000); const exit = new Date(er.getTime() - 86400000); return now >= entry && now <= exit }); if (plays.length === 0) return null; return (<div style={{ marginBottom: 16 }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "pulse 1.5s infinite" }} /><span style={{ fontWeight: 700, fontSize: 12, color: "#10b981" }}>Pre-earnings plays — entry window open</span><span style={{ fontSize: 9, color: "#3d4e62", fontFamily: "var(--font-mono)" }}>{plays.length} active</span></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>{plays.map(item => { const erD = new Date(item.date + "T00:00:00"); const daysToER = Math.round((erD - now) / 86400000); return (<div key={item.symbol + "_pre"} style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "10px 14px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "#f0f6ff" }}>{item.symbol}</span><span style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 4, padding: "1px 6px", color: "#10b981", fontSize: 8, fontFamily: "var(--font-mono)", fontWeight: 700 }}>ENTER NOW</span></div><span style={{ fontSize: 9, color: "#4a5c7a", fontFamily: "var(--font-mono)" }}>ER in {daysToER}d</span></div><div style={{ fontSize: 10, color: "#10b981", marginBottom: 4, fontWeight: 500 }}>{item.strategy}</div><div style={{ fontSize: 9, color: "#4a5c7a", fontFamily: "var(--font-mono)" }}>IV Rank: {item.ivRank || "--"}</div></div>) })}</div></div>) })()}

      {/* Filter tabs + view toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {filterButtons.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid ' + (filter === f.key ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'),
              background: filter === f.key ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: filter === f.key ? '#60a5fa' : '#4a5c7a', fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', fontWeight: filter === f.key ? 600 : 400, transition: 'all 0.15s'
            }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['grid', 'list'].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: '4px 10px', borderRadius: 5, border: '1px solid ' + (viewMode === m ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'),
              background: viewMode === m ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: viewMode === m ? '#8b9bb4' : '#3d4e62', fontSize: 9, cursor: 'pointer', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: 0.5
            }}>{m}</button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#3d4e62', fontSize: 12 }}>Loading earnings data...</div>}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#3d4e62' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#x1F4C5;</div>
          <div style={{ fontSize: 13 }}>No earnings in this window</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Try "This Month" for a broader view</div>
        </div>
      )}

      {/* Grid view */}
      {!loading && viewMode === 'grid' && dateKeys.map(dateKey => (
        <div key={dateKey} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>{dayLabel(dateKey)}</span>
              <span style={{ fontSize: 10, color: '#3d4e62' }}>{new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            </div>
            <span style={{ fontSize: 9, color: '#3d4e62', fontFamily: 'var(--font-mono)' }}>{grouped[dateKey].length} {grouped[dateKey].length === 1 ? 'company' : 'companies'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {grouped[dateKey].map(item => (
              <EarningsCard
                key={item.symbol}
                item={item}
                onAnalyze={analyzeEarnings}
                analysisData={analyses[item.symbol]}
                analyzing={analyzingSymbol === item.symbol}
              />
            ))}
          </div>
        </div>
      ))}

      {/* List view (compact table-like) */}
      {!loading && viewMode === 'list' && (
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 70px 60px 60px 70px 90px', gap: 0, padding: '6px 12px', background: '#080b12', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['Symbol', 'Name', 'Date', 'Time', 'EPS Est', 'IV Rank', 'Beat %', 'Exp Move'].map(h => (
              <div key={h} style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'var(--font-mono)' }}>{h}</div>
            ))}
          </div>
          {filtered.map((item, idx) => {
            const iv = item.ivRank != null ? ivTier(item.ivRank) : null
            return (
              <div key={item.symbol} onClick={() => analyzeEarnings(item.symbol)} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 70px 60px 60px 70px 90px', gap: 0, padding: '7px 12px', background: idx % 2 === 0 ? '#0a0e15' : '#0c1018', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'background 0.1s' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#f0f6ff' }}>{item.symbol}</div>
                <div style={{ fontSize: 10, color: '#4a5c7a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 10, color: '#6b7a90', fontFamily: 'var(--font-mono)' }}>{dayLabel(item.date)}</div>
                <div style={{ fontSize: 10, color: '#3d4e62', fontFamily: 'var(--font-mono)' }}>{item.time === 'bmo' ? 'Pre-Mkt' : item.time === 'amc' ? 'After-Hrs' : '?'}</div>
                <div style={{ fontSize: 10, color: '#8b9bb4', fontFamily: 'var(--font-mono)' }}>{item.epsEstimate != null ? '$' + fmt(item.epsEstimate) : '--'}</div>
                <div style={{ fontSize: 10, color: iv ? iv.color : '#3d4e62', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.ivRank != null ? item.ivRank : '--'}</div>
                <div style={{ fontSize: 10, color: item.beatsLast8 ? beatColor(item.beatsLast8) : '#3d4e62', fontFamily: 'var(--font-mono)' }}>{item.beatsLast8 != null ? item.beatsLast8 + '%' : '--'}</div>
                <div style={{ fontSize: 10, color: '#8b9bb4', fontFamily: 'var(--font-mono)' }}>{item.expectedMove != null ? '\u00B1' + fmt(item.expectedMove, 1) + '%' : '--'}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
