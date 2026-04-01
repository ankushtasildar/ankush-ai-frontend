import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function DayTrade() {
  const navigate = useNavigate()
  const [scan, setScan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  async function runScan() {
    setLoading(true)
    setError(null)
    try {
      var r = await fetch('/api/day-trade-engine?action=predict')
      if (!r.ok) throw new Error('API returned ' + r.status)
      var d = await r.json()
      setScan(d)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  useEffect(function() { runScan() }, [])
  useEffect(function() {
    if (!autoRefresh) return
    var id = setInterval(runScan, 30000)
    return function() { clearInterval(id) }
  }, [autoRefresh])

  // Safe field accessors for V3 response
  var price = scan ? scan.price : null
  var confPct = scan && scan.confluence ? scan.confluence.confluencePct : null
  var confBias = scan && scan.confluence ? scan.confluence.bias : null
  var ftfcStatus = scan && scan.strat && scan.strat.ftfc ? scan.strat.ftfc.ftfc : null
  var gapPct = scan && scan.structure && scan.structure.gap && scan.structure.gap.pct != null ? scan.structure.gap.pct : null
  var alert = scan ? scan.alert : null
  var bars = scan ? scan.bars : {}
  var ptf = scan ? scan.perTimeframe : {}
  var levels = scan && scan.structure ? scan.structure.levels : null
  var vwapData = scan && scan.indicators ? scan.indicators.vwap : null

  var S = function(s) { return { fontFamily: '"DM Mono",monospace', fontSize: 10, color: '#4a5c7a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, ...s } }

  if (loading && !scan) return (<div style={{ padding: 40, textAlign: 'center', color: '#4a5c7a' }}>Loading V3 Prediction Engine...</div>)
  if (error && !scan) return (<div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Error: {error}</div>)

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, color: '#f0f6ff', margin: 0 }}>Day Trade Engine</h1>
          <div style={{ fontSize: 11, color: '#4a5c7a' }}>V3 Prediction Engine — SSS50 + FTFC + VWAP + 5-layer confluence</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={function() { setAutoRefresh(!autoRefresh) }} style={{ padding: '6px 14px', background: autoRefresh ? 'rgba(16,185,129,0.1)' : 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: autoRefresh ? '#10b981' : '#4a5c7a', fontSize: 11, cursor: 'pointer' }}>Auto: {autoRefresh ? 'ON' : 'OFF'}</button>
          <button onClick={runScan} style={{ padding: '6px 14px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#60a5fa', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>Live Scan</button>
        </div>
      </div>

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'QQQ Price', value: price ? '$' + price.toFixed(2) : '--', color: '#f0f6ff' },
          { label: 'Confluence', value: confPct != null ? confPct + '% ' + (confBias || '') : '--', color: confBias === 'BULLISH' ? '#10b981' : confBias === 'BEARISH' ? '#ef4444' : '#f59e0b' },
          { label: 'FTFC', value: ftfcStatus || '--', color: ftfcStatus === 'BULLISH' ? '#10b981' : ftfcStatus === 'BEARISH' ? '#ef4444' : '#4a5c7a' },
          { label: 'Gap', value: gapPct != null ? (gapPct > 0 ? '+' : '') + gapPct.toFixed(2) + '%' : '--', color: '#4a5c7a' },
          { label: 'Strategies', value: '0', color: '#f59e0b' }
        ].map(function(m, i) { return (
          <div key={i} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
            <div style={S()}>{m.label}</div>
            <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 16, fontWeight: 800, color: m.color }}>{m.value}</div>
          </div>
        ) })}
      </div>

      {/* Key Levels + VWAP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={S({ color: '#10b981' })}>Key Levels</div>
          {levels ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, fontSize: 10, fontFamily: '"DM Mono",monospace' }}>
              {levels.pivot && <div>Pivot: ${levels.pivot}</div>}
              {levels.r1 && <div style={{ color: '#ef4444' }}>R1: ${levels.r1}</div>}
              {levels.s1 && <div style={{ color: '#10b981' }}>S1: ${levels.s1}</div>}
              {levels.r2 && <div style={{ color: '#ef4444' }}>R2: ${levels.r2}</div>}
              {levels.s2 && <div style={{ color: '#10b981' }}>S2: ${levels.s2}</div>}
              {levels.nearestSupport && <div style={{ color: '#10b981' }}>Support: ${levels.nearestSupport}</div>}
              {levels.nearestResistance && <div style={{ color: '#ef4444' }}>Resist: ${levels.nearestResistance}</div>}
            </div>
          ) : <div style={{ fontSize: 10, color: '#3d4e62' }}>No level data</div>}
        </div>
        <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={S({ color: '#a78bfa' })}>VWAP</div>
          {vwapData ? (
            <div style={{ fontSize: 10, fontFamily: '"DM Mono",monospace' }}>
              <div>VWAP: ${vwapData.vwap} ({vwapData.priceVsVwap})</div>
              <div style={{ color: '#ef4444' }}>Upper 1s: ${vwapData.upper1} | 2s: ${vwapData.upper2}</div>
              <div style={{ color: '#10b981' }}>Lower 1s: ${vwapData.lower1} | 2s: ${vwapData.lower2}</div>
            </div>
          ) : <div style={{ fontSize: 10, color: '#3d4e62' }}>No VWAP data</div>}
        </div>
      </div>

      {/* V3 Alert Card with I'M IN button */}
      {alert && (
        <div style={{ marginBottom: 16, padding: '16px 20px', background: alert.direction === 'BULLISH' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: '1px solid ' + (alert.direction === 'BULLISH' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'), borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 14, fontWeight: 800, color: alert.direction === 'BULLISH' ? '#10b981' : '#ef4444' }}>{alert.direction} ALERT</span>
              <span style={{ fontSize: 11, color: '#4a5c7a' }}>{alert.confluencePct}%</span>
              <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 4, color: '#a78bfa', fontWeight: 700 }}>Grade: {alert.grade}</span>
            </div>
            <button onClick={function() { navigate('/app/command-center?entry=' + alert.entry + '&direction=' + alert.direction + '&stop=' + alert.stop + '&target1=' + alert.target1) }} style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#ef4444,#a78bfa)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 800 }}>{"I'M IN"}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, fontSize: 10, fontFamily: '"DM Mono",monospace' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}><div style={{ color: '#4a5c7a', fontSize: 8 }}>ENTRY</div><div style={{ fontWeight: 700 }}>${alert.entry}</div></div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}><div style={{ color: '#ef4444', fontSize: 8 }}>STOP</div><div style={{ fontWeight: 700, color: '#ef4444' }}>${alert.stop}</div></div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}><div style={{ color: '#10b981', fontSize: 8 }}>TARGET</div><div style={{ fontWeight: 700, color: '#10b981' }}>${alert.target1} ({alert.target1_rr}:1)</div></div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}><div style={{ color: '#4a5c7a', fontSize: 8 }}>TIMEFRAME</div><div style={{ fontWeight: 700 }}>{alert.timeframe}</div></div>
          </div>
          {alert.reasons && alert.reasons.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: '#6b7a90', lineHeight: 1.6 }}>{alert.reasons.slice(0, 5).join(' \u00B7 ')}</div>
          )}
        </div>
      )}

      {/* Per-timeframe analysis */}
      <div style={S({ marginBottom: 6 })}>Per-Timeframe Analysis</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 16 }}>
        {['1m', '5m', '15m', '1h', 'D'].map(function(tf) {
          var tfData = ptf[tf] || {}
          var tfBars = bars[tf] || 0
          var macd = tfData.macd || null
          var adx = tfData.adx || null
          var sq = tfData.squeeze || null
          return (
            <div key={tf} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 13, fontWeight: 800 }}>{tf.toUpperCase()}</span>
                <span style={{ fontSize: 9, color: '#3d4e62' }}>{tfBars} bars</span>
              </div>
              <div style={{ fontSize: 9, color: '#4a5c7a', fontFamily: '"DM Mono",monospace' }}>
                <div>{tfData.ema || 'unknown'}</div>
                <div>MACD: {macd ? macd.hist : '--'}</div>
                <div>ADX: {adx ? adx.adx : '--'}</div>
                {sq && sq.fired && <div style={{ color: '#f59e0b', fontWeight: 700 }}>SQUEEZE FIRED</div>}
                {sq && sq.on && <div style={{ color: '#f59e0b' }}>Squeeze ON</div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Strat info */}
      {scan && scan.strat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {scan.strat.sss50 && (
            <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={S({ color: '#f59e0b' })}>SSS50 State</div>
              <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, fontWeight: 700, color: scan.strat.sss50.state === 'ACTIVE' ? '#10b981' : scan.strat.sss50.state === 'COMPLETE' ? '#60a5fa' : '#4a5c7a' }}>{scan.strat.sss50.state}</div>
              <div style={{ fontSize: 9, color: '#3d4e62', marginTop: 2 }}>{scan.strat.sss50.reason || ''}</div>
            </div>
          )}
          {scan.strat.ftfc && (
            <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={S({ color: '#a78bfa' })}>FTFC</div>
              <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, fontWeight: 700, color: scan.strat.ftfc.ftfc === 'BULLISH' ? '#10b981' : scan.strat.ftfc.ftfc === 'BEARISH' ? '#ef4444' : '#4a5c7a' }}>{scan.strat.ftfc.ftfc}</div>
              <div style={{ fontSize: 9, color: '#3d4e62', marginTop: 2 }}>{scan.strat.ftfc.bullPct}% bull / {scan.strat.ftfc.bearPct}% bear</div>
            </div>
          )}
          {scan.strat.combo && (
            <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={S({ color: '#60a5fa' })}>Strat Combo</div>
              <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, fontWeight: 700 }}>{scan.strat.combo.combo || '--'}</div>
              <div style={{ fontSize: 9, color: '#3d4e62', marginTop: 2 }}>{scan.strat.combo.description || ''}</div>
            </div>
          )}
        </div>
      )}

      {/* Cross-links */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={function() { navigate('/app/journal') }} style={{ padding: '6px 16px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#60a5fa', fontSize: 11, cursor: 'pointer' }}>Log Trade</button>
        <button onClick={function() { navigate('/app/risk') }} style={{ padding: '6px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>Risk Calc</button>
        <button onClick={function() { navigate('/app/strategies') }} style={{ padding: '6px 16px', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, color: '#a78bfa', fontSize: 11, cursor: 'pointer' }}>Strategies</button>
        <button onClick={function() { navigate('/app/command-center') }} style={{ padding: '6px 16px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, color: '#10b981', fontSize: 11, cursor: 'pointer' }}>Command Center</button>
      </div>

      {/* Timestamp */}
      <div style={{ fontSize: 10, color: '#2a3441' }}>Last scan: {scan ? scan.timestamp : '--'} | Source: {scan ? scan.dataSource : '--'}</div>
    </div>
  )
}
