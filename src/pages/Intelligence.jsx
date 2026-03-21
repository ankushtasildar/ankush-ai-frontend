import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function StatBox({ label, value, color = '#f0f6ff', sub }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 70 }}>
      <div style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, fontFamily: '"DM Mono",monospace', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ color: '#3d4e62', fontSize: 9, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function WinRateBar({ actual, claimed, label }) {
  const actualColor = actual >= claimed ? '#10b981' : '#ef4444'
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: '#8b9fc0', fontSize: 11 }}>{label}</span>
        <span style={{ color: actualColor, fontSize: 11, fontFamily: '"DM Mono",monospace' }}>
          {actual?.toFixed(1)}% actual vs {claimed}% claimed
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: actual + '%', height: '100%', background: actualColor, borderRadius: 3, transition: 'width 1s ease' }} />
        <div style={{ position: 'absolute', top: 0, left: claimed + '%', width: 1, height: '100%', background: '#f59e0b' }} />
      </div>
    </div>
  )
}

function PatternCard({ pattern }) {
  const wr = pattern.win_rate
  const color = wr >= 65 ? '#10b981' : wr >= 50 ? '#f59e0b' : wr ? '#ef4444' : '#4a5c7a'
  return (
    <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ color: '#f0f6ff', fontSize: 12, fontWeight: 600, flex: 1, marginRight: 8 }}>{pattern.pattern_name}</div>
        <div style={{ background: wr ? color + '18' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (wr ? color + '40' : 'rgba(255,255,255,0.1)'), borderRadius: 5, padding: '2px 8px', color: wr ? color : '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {wr ? wr.toFixed(1) + '%' : 'No data'}
        </div>
      </div>
      {pattern.sample_size > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ color: '#3d4e62', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>n={pattern.sample_size}</span>
          {pattern.avg_return_pct && <span style={{ color: pattern.avg_return_pct > 0 ? '#10b981' : '#ef4444', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{pattern.avg_return_pct > 0 ? '+' : ''}{(pattern.avg_return_pct * 100).toFixed(1)}% avg</span>}
          {pattern.is_validated && <span style={{ color: '#10b981', fontSize: 9 }}>✓ validated</span>}
        </div>
      )}
      {pattern.works_best_when && <div style={{ color: '#4a5c7a', fontSize: 10, lineHeight: 1.5 }}><span style={{ color: '#10b981' }}>✓</span> {pattern.works_best_when}</div>}
      {pattern.fails_when && <div style={{ color: '#4a5c7a', fontSize: 10, lineHeight: 1.5, marginTop: 2 }}><span style={{ color: '#ef4444' }}>✗</span> {pattern.fails_when}</div>}
      {pattern.recommended_iv_strategy && (
        <div style={{ marginTop: 6, background: 'rgba(37,99,235,0.06)', borderRadius: 5, padding: '3px 8px', display: 'inline-block', color: '#60a5fa', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>
          {pattern.recommended_iv_strategy.replace(/_/g, ' ')}
        </div>
      )}
    </div>
  )
}

function OutcomeRow({ outcome, symbol, returnPct, holdDays, date }) {
  const isWin = outcome === 'target_hit'
  const isLoss = outcome === 'stop_hit'
  const color = isWin ? '#10b981' : isLoss ? '#ef4444' : returnPct > 0 ? '#10b981' : '#f59e0b'
  const label = isWin ? '✓ TARGET' : isLoss ? '✗ STOP' : returnPct > 0 ? '↑ EXPIRED +' : '↓ EXPIRED'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ background: color + '15', border: '1px solid ' + color + '30', borderRadius: 4, padding: '1px 6px', color, fontSize: 9, fontFamily: '"DM Mono",monospace', minWidth: 70, textAlign: 'center' }}>{label}</div>
      <div style={{ fontFamily: '"DM Mono",monospace', fontWeight: 700, color: '#f0f6ff', minWidth: 50 }}>{symbol}</div>
      <div style={{ color, fontFamily: '"DM Mono",monospace', fontSize: 11, minWidth: 60 }}>{returnPct > 0 ? '+' : ''}{returnPct?.toFixed(2)}%</div>
      <div style={{ color: '#3d4e62', fontSize: 10 }}>{holdDays}d</div>
      <div style={{ color: '#2d3d50', fontSize: 9, marginLeft: 'auto' }}>{date?.split('T')[0]}</div>
    </div>
  )
}

export default function Intelligence() {
  const [stats, setStats] = useState(null)
  const [patterns, setPatterns] = useState([])
  const [outcomes, setOutcomes] = useState([])
  const [reports, setReports] = useState([])
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [running, setRunning] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/intelligence?action=stats', {
        headers: { 'Authorization': 'Bearer ' + session?.access_token }
      })
      if (r.ok) {
        const d = await r.json()
        setStats(d.overview)
        setPatterns(d.patterns || [])
        setReports(d.recent_reports || [])
        setUpcomingEvents(d.upcoming_events || [])
        setOutcomes(d.recent_outcomes || [])
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function triggerAction(action, label) {
    setRunning(label)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/intelligence?action=' + action, {
        headers: { 'Authorization': 'Bearer ' + session?.access_token }
      })
      const d = await r.json()
      alert(label + ' complete: ' + JSON.stringify(d).substring(0, 200))
      loadAll()
    } catch (e) { alert('Error: ' + e.message) }
    finally { setRunning(null) }
  }

  const tabs = ['overview', 'patterns', 'outcomes', 'calendar', 'reports']
  const tabStyle = (t) => ({
    padding: '6px 14px', background: activeTab === t ? 'rgba(37,99,235,0.12)' : 'none',
    border: '1px solid ' + (activeTab === t ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.06)'),
    borderRadius: 6, color: activeTab === t ? '#60a5fa' : '#4a5c7a',
    fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace', transition: 'all .15s'
  })

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#4a5c7a', background: '#080c14', minHeight: '100vh' }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(96,165,250,.2)', borderTopColor: '#60a5fa', animation: 'spin .6s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      Loading intelligence data...
    </div>
  )

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 3px' }}>
            🧠 AnkushAI Intelligence
          </h1>
          <div style={{ color: '#3d4e62', fontSize: 11 }}>
            Live learning system · Setup tracking · Pattern analysis · Outcome attribution
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['Resolve Outcomes', 'resolve_outcomes'], ['Run Pattern Analysis', 'pattern_analysis']].map(([label, action]) => (
            <button key={action} onClick={() => triggerAction(action, label)} disabled={!!running}
              style={{ padding: '6px 12px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 6, color: '#60a5fa', fontSize: 10, cursor: running ? 'default' : 'pointer', fontFamily: '"DM Mono",monospace', opacity: running ? .5 : 1 }}>
              {running === label ? '⟳ Running...' : label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>)}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          {/* Key stats */}
          <div style={{ display: 'flex', gap: 16, padding: '14px 18px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', marginBottom: 16 }}>
            <StatBox label="TOTAL SETUPS" value={stats?.total_setups} />
            <StatBox label="OPEN" value={stats?.open_setups} color="#f59e0b" />
            <StatBox label="WIN RATE" value={stats?.win_rate_pct ? stats.win_rate_pct + '%' : '—'} color={stats?.win_rate_pct >= 60 ? '#10b981' : '#ef4444'} />
            <StatBox label="AVG RETURN" value={stats?.avg_return_pct ? (stats.avg_return_pct > 0 ? '+' : '') + stats.avg_return_pct + '%' : '—'} color={stats?.avg_return_pct > 0 ? '#10b981' : '#ef4444'} />
            <StatBox label="BULLISH" value={stats?.bullish_setups} color="#10b981" />
            <StatBox label="BEARISH" value={stats?.bearish_setups} color="#ef4444" />
            <StatBox label="RESOLVED" value={stats?.resolved_setups} color="#8b9fc0" />
          </div>

          {/* Upcoming macro events */}
          {upcomingEvents.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 10 }}>UPCOMING MACRO EVENTS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {upcomingEvents.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: e.event_type === 'fomc' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', border: '1px solid ' + (e.event_type === 'fomc' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'), borderRadius: 4, padding: '1px 7px', color: e.event_type === 'fomc' ? '#ef4444' : '#f59e0b', fontSize: 9, fontFamily: '"DM Mono",monospace', minWidth: 65, textAlign: 'center' }}>
                      {e.event_type.toUpperCase()}
                    </div>
                    <div style={{ color: '#8b9fc0', fontSize: 11 }}>{e.title}</div>
                    <div style={{ marginLeft: 'auto', color: '#3d4e62', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{e.event_date}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latest report */}
          {reports[0] && (
            <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 8 }}>LATEST INTELLIGENCE REPORT — {reports[0].report_period?.replace(/_/g, ' ')}</div>
              {reports[0].win_rate_this_period && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                  <span style={{ color: '#a5b4fc', fontSize: 12 }}>Win rate: <strong>{reports[0].win_rate_this_period}%</strong></span>
                  {reports[0].avg_return_this_period && <span style={{ color: '#a5b4fc', fontSize: 12 }}>Avg return: <strong>{(reports[0].avg_return_this_period * 100).toFixed(2)}%</strong></span>}
                  <span style={{ color: '#6b7a90', fontSize: 11 }}>{reports[0].patterns_updated} patterns updated</span>
                </div>
              )}
              {reports[0].full_report_text && (
                <div style={{ color: '#8b9fc0', fontSize: 11, lineHeight: 1.7 }}>{reports[0].full_report_text.substring(0, 400)}{reports[0].full_report_text.length > 400 ? '...' : ''}</div>
              )}
              {reports[0].key_learnings_json?.prompt_adjustments?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', marginBottom: 6 }}>AI RECOMMENDED PROMPT ADJUSTMENTS</div>
                  {reports[0].key_learnings_json.prompt_adjustments.map((adj, i) => (
                    <div key={i} style={{ color: '#60a5fa', fontSize: 11, marginBottom: 3 }}>→ {adj}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Patterns Tab */}
      {activeTab === 'patterns' && (
        <div>
          <div style={{ color: '#3d4e62', fontSize: 11, marginBottom: 12 }}>
            {patterns.filter(p => p.is_validated).length} validated · {patterns.filter(p => !p.is_validated).length} accumulating data
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 10 }}>
            {patterns.map((p, i) => <PatternCard key={i} pattern={p} />)}
          </div>
        </div>
      )}

      {/* Outcomes Tab */}
      {activeTab === 'outcomes' && (
        <div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 10 }}>RECENT RESOLVED SETUPS</div>
            {outcomes.length === 0 ? (
              <div style={{ color: '#3d4e62', fontSize: 12, textAlign: 'center', padding: 24 }}>No resolved setups yet — outcomes build up as setups expire or hit targets</div>
            ) : (
              outcomes.map((o, i) => (
                <OutcomeRow key={i} outcome={o.outcome} symbol={o.symbol || '?'} returnPct={o.underlying_return_pct || 0} holdDays={o.hold_days_actual || 0} date={o.recorded_at || o.exit_date} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
          {upcomingEvents.length === 0 ? (
            <div style={{ color: '#3d4e62', fontSize: 12 }}>No upcoming events found</div>
          ) : upcomingEvents.map((e, i) => (
            <div key={i} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <div style={{ background: e.event_type === 'fomc' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: 4, padding: '1px 7px', color: e.event_type === 'fomc' ? '#ef4444' : '#f59e0b', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>
                  {e.event_type.toUpperCase()}
                </div>
                <div style={{ color: '#f0f6ff', fontSize: 12, fontWeight: 600 }}>{e.title}</div>
              </div>
              <div style={{ color: '#3d4e62', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{e.event_date} {e.event_time ? '@ ' + e.event_time : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.length === 0 ? (
            <div style={{ color: '#3d4e62', fontSize: 12, textAlign: 'center', padding: 32 }}>No reports yet — run Pattern Analysis to generate the first report</div>
          ) : reports.map((r, i) => (
            <div key={i} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ color: '#f0f6ff', fontSize: 13, fontWeight: 600 }}>{r.report_period?.replace(/_/g, ' ')}</div>
                <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>{r.generated_at?.split('T')[0]}</div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                {r.win_rate_this_period && <span style={{ color: '#10b981', fontSize: 11 }}>Win: {r.win_rate_this_period}%</span>}
                {r.total_setups_evaluated && <span style={{ color: '#8b9fc0', fontSize: 11 }}>{r.total_setups_evaluated} setups</span>}
                <span style={{ color: '#6b7a90', fontSize: 11 }}>{r.patterns_updated} patterns updated</span>
              </div>
              {r.full_report_text && <div style={{ color: '#8b9fc0', fontSize: 11, lineHeight: 1.7 }}>{r.full_report_text}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
