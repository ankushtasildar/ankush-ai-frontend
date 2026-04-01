import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function DayTrade() {
  const navigate = useNavigate()
  const [scan, setScan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => { runScan() }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(runScan, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  async function runScan() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/day-trade-engine?action=live_scan')
      if (r.ok) {
        const d = await r.json()
        setScan(d)
      } else {
        setError('API returned ' + r.status)
      }
    } catch(e) {
      setError(e.message || 'Network error')
    }
    setLoading(false)
  }

  const s = { box: { background: '#0c1018', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px' } }

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      {/* Header Ã¢ÂÂ always visible */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 20, fontWeight: 800, margin: '0 0 2px' }}>Day Trade Engine</h1>
          <div style={{ color: '#3d4e62', fontSize: 10 }}>29 analysis functions across 5 timeframes</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setAutoRefresh(prev => !prev)} style={{ padding: '6px 14px', background: autoRefresh ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (autoRefresh ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 6, color: autoRefresh ? '#10b981' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>
            {autoRefresh ? 'Auto: ON (30s)' : 'Auto: OFF'}
          </button>
          <button onClick={runScan} disabled={loading} style={{ padding: '6px 14px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, color: '#60a5fa', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
            {loading ? 'Scanning...' : 'Live Scan'}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && !scan && (
        <div style={{ textAlign: 'center', padding: 60, color: '#4a5c7a' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>{'\u26A1'}</div>
          <div style={{ fontSize: 13 }}>Running 29 analysis functions...</div>
          <div style={{ fontSize: 10, color: '#3d4e62', marginTop: 4 }}>MACD, ADX, FTFC, gap analysis, key levels, AVWAPs, squeeze, candles, Strat combos</div>
        </div>
      )}

      {/* Error state */}
      {error && !scan && (
        <div style={{ textAlign: 'center', padding: 40, color: '#ef4444' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Scan error: {error}</div>
          <button onClick={runScan} style={{ padding: '8px 20px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Results */}
      {scan && (
        <div>
          {/* Top metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'QQQ Price', value: scan.price ? '$' + Number(scan.price).toFixed(2) : '--', color: '#f0f6ff' },
              { label: 'Confluence', value: (scan.confluence ? scan.confluence.bullPct + '/' + scan.confluence.bearPct : '--'), color: scan.confluence && scan.confluence.bias === 'BULLISH' ? '#10b981' : '#ef4444' },
              { label: 'FTFC', value: scan.ftfc ? (scan.ftfc.direction || 'N/A') : '--', color: '#60a5fa' },
              { label: 'Gap', value: scan.gap && scan.gap.gapPct != null ? ((scan.gap.gapPct > 0 ? '+' : '') + Number(scan.gap.gapPct).toFixed(2) + '%') : '--', color: '#f59e0b' },
              { label: 'Strategies', value: String(scan.learnedStrategies || 0), color: '#a78bfa' },
            ].map((m, i) => (
              <div key={i} style={{ background: '#0a0e15', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 14, fontFamily: '"DM Mono",monospace', fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Key Levels + AVWAPs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={s.box}>
              <div style={{ fontSize: 9, color: '#60a5fa', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>KEY LEVELS</div>
              {scan.levels ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {[['Pivot', scan.levels.pivot], ['R1', scan.levels.r1], ['S1', scan.levels.s1], ['R2', scan.levels.r2], ['S2', scan.levels.s2]].filter(function(pair){ return pair[1]; }).map(function(pair, i) {
                    return <div key={i} style={{ fontSize: 9, fontFamily: '"DM Mono",monospace', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#3d4e62' }}>{pair[0]}</span>
                      <span style={{ color: '#8b9bb4' }}>${Number(pair[1]).toFixed(2)}</span>
                    </div>
                  })}
                </div>
              ) : <div style={{ fontSize: 10, color: '#3d4e62' }}>No level data</div>}
            </div>

            <div style={s.box}>
              <div style={{ fontSize: 9, color: '#a78bfa', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>ANCHORED VWAPS</div>
              {scan.avwaps ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[['Swing Low', scan.avwaps.fromSwingLow, '#10b981'], ['Swing High', scan.avwaps.fromSwingHigh, '#ef4444'], ['Weekly', scan.avwaps.weekly, '#60a5fa']].filter(function(a){ return a[1]; }).map(function(a, i) {
                    return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>
                      <span style={{ color: '#4a5c7a' }}>{a[0]}</span>
                      <span style={{ color: a[2], fontWeight: 600 }}>${Number(a[1]).toFixed(2)}</span>
                    </div>
                  })}
                </div>
              ) : <div style={{ fontSize: 10, color: '#3d4e62' }}>No AVWAP data</div>}
            </div>
          </div>

          {/* Per-Timeframe Analysis */}
          {scan.perTimeframe && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: '#3d4e62', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Per-timeframe analysis</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {Object.keys(scan.perTimeframe).map(function(tf) {
                  var d = scan.perTimeframe[tf]
                  if (!d) return null
                  var cloud = d.emaCloud || 'unknown'
                  return (
                    <div key={tf} style={s.box}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, fontWeight: 700 }}>{tf.toUpperCase()}</span>
                        <span style={{ fontSize: 9, color: '#3d4e62' }}>{d.bars || 0} bars</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 9 }}>
                        <span style={{ color: cloud === 'bullish' ? '#10b981' : cloud === 'bearish' ? '#ef4444' : '#4a5c7a' }}>{cloud}</span>
                        {d.macd && <span style={{ color: '#4a5c7a' }}>MACD: {d.macd.histogram || '--'}</span>}
                        {d.adx && <span style={{ color: d.adx.trending ? '#10b981' : '#4a5c7a' }}>ADX: {d.adx.adx || '--'}</span>}
                        {d.squeeze && d.squeeze.on && <span style={{ color: '#f59e0b' }}>SQUEEZE</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sector Leaders */}
          {scan.leaders && Object.keys(scan.leaders).length > 0 && (
            <div style={{ ...s.box, marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: '#3d4e62', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>SECTOR LEADERS</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(scan.leaders).map(function(entry) {
                  return <span key={entry[0]} style={{ fontFamily: '"DM Mono",monospace', fontSize: 11 }}>
                    <span style={{ color: '#8b9bb4' }}>{entry[0]}</span>
                    <span style={{ color: String(entry[1]).charAt(0) === '-' ? '#ef4444' : '#10b981', marginLeft: 4 }}>{entry[1]}</span>
                  </span>
                })}
              </div>
            </div>
          )}


          {/* Alert Card with I'M IN button */}
          {scan && scan.alert && (
            <div style={{marginTop:16,padding:'16px 20px',background:scan.alert.direction==='BULLISH'?'rgba(16,185,129,0.06)':'rgba(239,68,68,0.06)',border:'1px solid '+(scan.alert.direction==='BULLISH'?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'),borderRadius:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontFamily:'"DM Mono",monospace',fontSize:14,fontWeight:800,color:scan.alert.direction==='BULLISH'?'#10b981':'#ef4444'}}>{scan.alert.direction} ALERT</span>
                  <span style={{fontSize:11,color:'#4a5c7a'}}>{scan.alert.confluencePct}%</span>
                  <span style={{fontSize:10,padding:'2px 8px',background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:4,color:'#a78bfa',fontWeight:700}}>Grade: {scan.alert.grade}</span>
                </div>
                <button onClick={function(){navigate('/app/command-center?entry='+scan.alert.entry+'&direction='+scan.alert.direction+'&stop='+scan.alert.stop+'&target1='+scan.alert.target1)}} style={{padding:'10px 24px',background:'linear-gradient(135deg,#ef4444,#a78bfa)',border:'none',borderRadius:8,color:'#fff',fontSize:13,cursor:'pointer',fontWeight:800}}>I'M IN</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,fontSize:10,fontFamily:'"DM Mono",monospace'}}>
                <div style={{background:'rgba(255,255,255,0.03)',padding:'6px 10px',borderRadius:6}}><div style={{color:'#4a5c7a',fontSize:8}}>ENTRY</div><div style={{fontWeight:700}}>${scan.alert.entry}</div></div>
                <div style={{background:'rgba(255,255,255,0.03)',padding:'6px 10px',borderRadius:6}}><div style={{color:'#ef4444',fontSize:8}}>STOP</div><div style={{fontWeight:700,color:'#ef4444'}}>${scan.alert.stop}</div></div>
                <div style={{background:'rgba(255,255,255,0.03)',padding:'6px 10px',borderRadius:6}}><div style={{color:'#10b981',fontSize:8}}>TARGET</div><div style={{fontWeight:700,color:'#10b981'}}>${scan.alert.target1} ({scan.alert.target1_rr}:1)</div></div>
                <div style={{background:'rgba(255,255,255,0.03)',padding:'6px 10px',borderRadius:6}}><div style={{color:'#4a5c7a',fontSize:8}}>TIMEFRAME</div><div style={{fontWeight:700}}>{scan.alert.timeframe}</div></div>
              </div>
            </div>
          )}

          {/* Cross-links */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <button onClick={function(){ navigate('/app/journal') }} style={{ padding: '8px 16px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, color: '#60a5fa', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Log Trade</button>
            <button onClick={function(){ navigate('/app/risk') }} style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, color: '#10b981', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Risk Calc</button>
            <button onClick={function(){ navigate('/app/strategies') }} style={{ padding: '8px 16px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 8, color: '#a78bfa', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Strategies</button>
          </div>

          {/* Timestamp */}
          {scan.timestamp && <div style={{ marginTop: 12, fontSize: 9, color: '#3d4e62', fontFamily: '"DM Mono",monospace' }}>Last scan: {scan.timestamp}</div>}
        </div>
      )}
    </div>
  )
}
