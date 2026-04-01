import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function MetricCard({ label, value, color, sub }) {
  return (
    <div style={{ background: '#0a0e15', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontFamily: '"DM Mono",monospace', fontWeight: 700, color: color || '#8b9bb4' }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: '#3d4e62' }}>{sub}</div>}
    </div>
  )
}

function TFCard({ tf, data }) {
  if (!data) return null
  const cloud = data.emaCloud || 'unknown'
  const cloudColor = cloud === 'bullish' ? '#10b981' : cloud === 'bearish' ? '#ef4444' : '#4a5c7a'
  return (
    <div style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, fontWeight: 700 }}>{tf.toUpperCase()}</span>
        <span style={{ fontSize: 9, color: '#3d4e62' }}>{data.bars} bars</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 9 }}>
        <span style={{ color: cloudColor }}>{cloud}</span>
        {data.topCandle && <span style={{ color: '#f59e0b' }}>{data.topCandle.pattern || data.topCandle.type}</span>}
        {data.topStrat && <span style={{ color: '#a78bfa' }}>Strat: {data.topStrat.combo || data.topStrat.type}</span>}
        {data.squeeze && <span style={{ color: data.squeeze.fired ? '#ef4444' : data.squeeze.on ? '#f59e0b' : '#3d4e62' }}>
          {data.squeeze.fired ? 'SQUEEZE FIRED' : data.squeeze.on ? 'SQUEEZE ON' : 'no squeeze'}
        </span>}
      </div>
      {data.macd && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 8, color: '#4a5c7a', fontFamily: '"DM Mono",monospace' }}>
          <span>MACD: {data.macd.histogram}</span>
          {data.macd.cross !== 'none' && <span style={{ color: data.macd.cross.includes('bull') ? '#10b981' : '#ef4444' }}>{data.macd.cross}</span>}
          {data.macd.divergence !== 'none' && <span style={{ color: '#f59e0b' }}>{data.macd.divergence}</span>}
        </div>
      )}
      {data.adx && (
        <div style={{ fontSize: 8, color: data.adx.trending ? '#10b981' : '#4a5c7a', fontFamily: '"DM Mono",monospace', marginTop: 2 }}>
          ADX: {data.adx.adx} {data.adx.signal}
        </div>
      )}
    </div>
  )
}

export default function DayTrade() {
  const navigate = useNavigate()
  const [scan, setScan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [strategies, setStrategies] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    runScan()
    loadStrategies()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(runScan, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  async function runScan() {
    setLoading(true)
    try {
      const r = await fetch('/api/day-trade-engine?action=live_scan')
      if (r.ok) setScan(await r.json())
    } catch(e) {}
    setLoading(false)
  }

  async function loadStrategies() {
    try {
      const r = await fetch('/api/day-trade-engine?action=strategies')
      if (r.ok) setStrategies(await r.json())
    } catch(e) {}
  }

  const biasColor = scan?.confluence?.bias === 'BULLISH' ? '#10b981' : scan?.confluence?.bias === 'BEARISH' ? '#ef4444' : '#f59e0b'

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1200, background: '#080c14', minHeight: '100vh', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 20, fontWeight: 800, margin: '0 0 2px' }}>Day Trade Engine</h1>
          <div style={{ color: '#3d4e62', fontSize: 10 }}>29 analysis functions \u00B7 5 timeframes \u00B7 QQQ focus</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setAutoRefresh(!autoRefresh)} style={{ padding: '6px 14px', background: autoRefresh ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (autoRefresh ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 6, color: autoRefresh ? '#10b981' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>
            {autoRefresh ? 'Auto: ON (30s)' : 'Auto: OFF'}
          </button>
          <button onClick={runScan} disabled={loading} style={{ padding: '6px 14px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, color: '#60a5fa', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
            {loading ? 'Scanning...' : 'Live Scan'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && !scan && <div style={{ textAlign: 'center', padding: 40, color: '#3d4e62' }}>Running 29 analysis functions across 5 timeframes...</div>}

      {scan && (
        <>
          {/* Top metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 14 }}>
            <MetricCard label="QQQ Price" value={scan.price ? '$' + Number(scan.price).toFixed(2) : 'delayed'} color="#f0f6ff" />
            <MetricCard label="Confluence" value={scan.confluence?.bullPct + '/' + scan.confluence?.bearPct} color={biasColor} sub={scan.confluence?.bias + ' ' + (scan.confluence?.strength || '')} />
            <MetricCard label="FTFC" value={scan.ftfc?.direction || 'N/A'} color={scan.ftfc?.actionable ? '#10b981' : '#4a5c7a'} sub={scan.ftfc?.summary?.substring(0, 20)} />
            <MetricCard label="Gap" value={scan.gap?.gapPct ? (scan.gap.gapPct > 0 ? '+' : '') + scan.gap.gapPct + '%' : 'N/A'} color={scan.gap?.gapDir === 'gap_up' ? '#10b981' : scan.gap?.gapDir === 'gap_down' ? '#ef4444' : '#4a5c7a'} sub={scan.gap?.gapFilled ? 'filled' : 'not filled'} />
            <MetricCard label="Strategies" value={scan.learnedStrategies || 0} color="#a78bfa" sub="learned" />
          </div>

          {/* Key Levels + AVWAPs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* Levels */}
            <div style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, color: '#60a5fa', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>KEY LEVELS</div>
              {scan.levels && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {[
                    ['Pivot', scan.levels.pivot], ['R1', scan.levels.r1], ['S1', scan.levels.s1],
                    ['R2', scan.levels.r2], ['S2', scan.levels.s2], ['Week H', scan.levels.weekH],
                  ].filter(([,v]) => v).map(([label, val], i) => (
                    <div key={i} style={{ fontSize: 9, fontFamily: '"DM Mono",monospace', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#3d4e62' }}>{label}</span>
                      <span style={{ color: label.startsWith('R') ? '#10b981' : label.startsWith('S') ? '#ef4444' : '#8b9bb4' }}>${Number(val).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AVWAPs */}
            <div style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, color: '#a78bfa', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>ANCHORED VWAPS</div>
              {scan.avwaps && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    ['Swing Low', scan.avwaps.fromSwingLow, '#10b981'],
                    ['Swing High', scan.avwaps.fromSwingHigh, '#ef4444'],
                    ['Weekly', scan.avwaps.weekly, '#60a5fa'],
                  ].filter(([,v]) => v).map(([label, val, color], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>
                      <span style={{ color: '#4a5c7a' }}>{label}</span>
                      <span style={{ color: color, fontWeight: 600 }}>${Number(val).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Options HV */}
              {scan.options && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>
                  <span style={{ color: '#3d4e62' }}>Historical Vol</span>
                  <span style={{ color: '#f59e0b' }}>{scan.options.hv}</span>
                </div>
              )}
            </div>
          </div>

          {/* Per-Timeframe Analysis */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: '#3d4e62', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Per-timeframe analysis</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {scan.perTimeframe && Object.keys(scan.perTimeframe).map(tf => (
                <TFCard key={tf} tf={tf} data={scan.perTimeframe[tf]} />
              ))}
            </div>
          </div>

          {/* Sector Leaders */}
          {scan.leaders && Object.keys(scan.leaders).length > 0 && (
            <div style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: '#3d4e62', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>SECTOR LEADERS</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {Object.entries(scan.leaders).map(([sym, chg]) => (
                  <span key={sym} style={{ fontFamily: '"DM Mono",monospace', fontSize: 11 }}>
                    <span style={{ color: '#8b9bb4' }}>{sym}</span>
                    <span style={{ color: String(chg).startsWith('-') ? '#ef4444' : '#10b981', marginLeft: 4 }}>{chg}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Learned Strategies */}
          {strategies && strategies.strategies && strategies.strategies.length > 0 && (
            <div style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: '#a78bfa', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>LEARNED STRATEGIES ({strategies.total} trades)</div>
              {strategies.strategies.slice(0, 5).map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>
                  <span style={{ color: '#8b9bb4' }}>{s.name}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: s.winRate >= 60 ? '#10b981' : s.winRate >= 40 ? '#f59e0b' : '#ef4444' }}>{s.winRate}%</span>
                    <span style={{ color: '#3d4e62' }}>{s.trades} trades</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cross-links */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/app/journal')} style={{ padding: '8px 16px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, color: '#60a5fa', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Log Trade \u2192</button>
            <button onClick={() => navigate('/app/risk')} style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, color: '#10b981', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Risk Calc \u2192</button>
            <button onClick={() => navigate('/app/strategies')} style={{ padding: '8px 16px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 8, color: '#a78bfa', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Strategies \u2192</button>
          </div>

          {/* Timestamp */}
          <div style={{ marginTop: 12, fontSize: 9, color: '#3d4e62', fontFamily: '"DM Mono",monospace' }}>Last scan: {scan.timestamp} {autoRefresh && '\u00B7 Auto-refreshing every 30s'}</div>
        </>
      )}
    </div>
  )
}
