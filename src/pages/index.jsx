import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeTable } from '../lib/useRealtime'


// ── Journal ───────────────────────────────────────────────────
export function Journal() {
  const [entries, setEntries]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [patterns, setPatterns] = useState(null)
  const [patLoading, setPatLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    symbol: '', direction: 'long', entry_price: '', exit_price: '',
    qty: '', close_reason: 'hit_target', note: '', asset_type: 'equity',
  })

  const loadEntries = () => {
    api.journal.list(100).then(setEntries).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadEntries() }, [])

  const submit = async () => {
    if (!form.symbol || !form.qty || !form.entry_price) return
    try {
      await api.journal.add({
        ...form,
        qty: parseFloat(form.qty),
        entry_price: parseFloat(form.entry_price),
        exit_price: form.exit_price ? parseFloat(form.exit_price) : null,
        symbol: form.symbol.toUpperCase(),
      })
      setShowForm(false)
      setForm({ symbol:'', direction:'long', entry_price:'', exit_price:'', qty:'', close_reason:'hit_target', note:'', asset_type:'equity' })
      loadEntries()
    } catch (e) { alert('Error saving: ' + e.message) }
  }

  const getPatterns = async () => {
    setPatLoading(true)
    try { setPatterns(await api.journal.patterns()) }
    catch { setPatterns({ summary: 'Pattern analysis unavailable — check ANTHROPIC_API_KEY', patterns: [] }) }
    setPatLoading(false)
  }

  const REASONS = ['hit_target','stop_loss','time_stop','thesis_invalidated','needed_liquidity','emotional','partial_profit','rolled','expired','other']
  const totalPnl = entries.reduce((s, e) => s + (e.realized_pnl || 0), 0)
  const wins     = entries.filter(e => (e.realized_pnl || 0) > 0).length
  const winRate  = entries.length > 0 ? Math.round(wins / entries.length * 100) : 0

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-tile">
          <div className="metric-label">Total Trades</div>
          <div className="metric-value">{entries.length}</div>
        </div>
        <div className={`metric-tile ${totalPnl >= 0 ? 'green' : 'red'}`}>
          <div className="metric-label">Realized P&L</div>
          <div className={`metric-value ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
            {totalPnl !== 0 ? `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}` : '—'}
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Win Rate</div>
          <div className="metric-value">{winRate}%</div>
          <div className="metric-sub">{wins}W / {entries.length - wins}L</div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Avg P&L / Trade</div>
          <div className="metric-value" style={{ fontSize: 18 }}>
            {entries.length > 0 ? `$${(totalPnl / entries.length).toFixed(2)}` : '—'}
          </div>
        </div>
      </div>

      {/* AI Pattern Analysis */}
      {patterns && (
        <div className="card section" style={{ borderLeft: '3px solid var(--blue)' }}>
          <div className="card-header">
            <span className="card-title">⚡ AI Pattern Analysis</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
              {patterns.entry_count} trades analyzed · win rate {patterns.win_rate != null ? (patterns.win_rate * 100).toFixed(0) + '%' : winRate + '%'}
            </span>
          </div>
          <div style={{ padding: '14px 16px', fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            {patterns.summary}
          </div>
          {patterns.patterns?.length > 0 && (
            <div style={{ padding: '0 16px 16px' }}>
              {patterns.patterns.map((p, i) => (
                <div key={i} style={{
                  padding: '10px 14px', marginBottom: 6,
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${p.severity === 'high' ? 'var(--red)' : p.severity === 'medium' ? 'var(--yellow)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontWeight:600, fontSize:12 }}>{p.name}</span>
                    <spa. style={{
                      fontFamily:'var(--font-mono)', fontSize:9, fontWeight:600,
                      color: p.severity==='high' ? 'var(--red)' : p.severity==='medium' ? 'var(--yellow)' : 'var(--green)',
                      textTransform:'uppercase',
                    }}>{p.severity} · {p.count} occurrences</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>{p.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card section">
        <div className="card-header">
          <span className="card-title">◇ Trade Journal</span>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" style={{ padding:'4px 12px', fontSize:11 }}
              onClick={getPatterns} disabled={patLoading}>
              {patLoading ? '⟳ Analyzing…' : '⚡ AI Patterns'}
            </button>
            <button className="btn btn-primary" style={{ padding:'4px 12px', fontSize:11 }}
              onClick={() => setShowForm(v => !v)}>
              {showForm ? '✕ Cancel' : '+ Log Trade'}
            </button>
          </div>
        </div>

        {showForm && (
          <div style={{ padding: 16, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
            <div className="grid-3" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Symbol</label>
                <input placeholder="AAPL" value={form.symbol} onChange={e => setForm({...form, symbol: e.target.value.toUpperCase()})} />
              </div>
              <div className="form-group">
                <label>Direction</label>
                <select value={form.direction} onChange={e => setForm({...form, direction: e.target.value})}>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              <div className="form-group">
                <label>Asset Type</label>
                <select value={form.asset_type} onChange={e => setForm({...form, asset_type: e.target.value})}>
                  <option value="equity">Equity</option>
                  <option value="option">Option</option>
                  <option value="etf">ETF</option>
                </select>
              </div>
            </div>
            <div className="grid-3" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Qty</label>
                <input type="number" placeholder="100" value={form.qty} onChange={e => setForm({...form, qty: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Entry Price</label>
                <input type="number" placeholder="150.00" value={form.entry_price} onChange={e => setForm({...form, entry_price: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Exit Price</label>
                <input type="number" placeholder="160.00" value={form.exit_price} onChange={e => setForm({...form, exit_price: e.target.value})} />
              </div>
            </div>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Close Reason</label>
                <select value={form.close_reason} onChange={e => setForm({...form, close_reason: e.target.value})}>
                  {REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input placeholder="Thesis, observations…" value={form.note} onChange={e => setForm({...form, note: e.target.value})} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={submit}>Save Trade</button>
          </div>
        )}

        {loading ? <div className="loading">LOADING JOURNAL</div>
          : entries.length === 0 ? <div className="empty"><span style={{fontSize:24}}>◇</span>No trades logged yet</div>
          : (
            <table className="data-table">
              <thead><tr>
                <th>Symbol</th><th>Side</th><th>Entry</th><th>Exit</th>
                <th>P&L</th><th>P&L %</th><th>Reason</th><th>Date</th>
              </tr></thead>
              <tbody>
                {entries.map(e => {
                  const pnl = e.realized_pnl || 0
                  return (
                    <tr key={e.id}>
                      <td className="mono" style={{ fontWeight: 600 }}>{e.symbol}</td>
                      <td><span className={`tag ${e.direction === 'long' ? 'bullish' : 'bearish'}`}>{e.direction?.toUpperCase()}</span></td>
                      <td className="mono">${Number(e.entry_price).toFixed(2)}</td>
                      <td className="mono">{e.exit_price ? `$${Number(e.exit_price).toFixed(2)}` : '—'}</td>
                      <td className={pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>{pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}</td>
                      <td className={pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>{e.pnl_pct ? `${e.pnl_pct >= 0 ? '+' : ''}${Number(e.pnl_pct).toFixed(2)}%` : '—'}</td>
                      <td style={{ color:'var(--text-muted)', fontSize:11 }}>{e.close_reason?.replace(/_/g,' ') || '—'}</td>
                      <td className="mono" style={{ color:'var(--text-muted)', fontSize:11 }}>{e.closed_at ? new Date(e.closed_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}


// ── Calendar ──────────────────────────────────────────────────
export function Calendar() {
  const [events, setEvents]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadEvents = () => {
    api.calendar.list().then(setEvents).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadEvents() }, [])

  const refresh = async () => {
    setRefreshing(true)
    try { await api.calendar.refresh(); setTimeout(loadEvents, 2000) }
    catch {}
    setRefreshing(false)
  }

  const impactColor = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--text-muted)' }
  const highCount  = events.filter(e => e.impact === 'high').length
  const todayCount = events.filter(e => {
    const d = new Date(e.event_date)
    const t = new Date()
    return d.toDateString() === t.toDateString()
  }).length

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-tile">
          <div className="metric-label">Total Events</div>
          <div className="metric-value">{events.length}</div>
        </div>
        <div className="metric-tile red">
          <div className="metric-label">High Impact</div>
          <div className="metric-value negative">{highCount}</div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Today</div>
          <div className="metric-value">{todayCount}</div>
        </div>
      </div>

      <div className="card section">
        <div className="card-header">
          <span className="card-title">○ Macro Calendar</span>
          <button className="btn btn-ghost" style={{ padding:'4px 12px', fontSize:11 }}
            onClick={refresh} disabled={refreshing}>
            {refreshing ? '⟳ Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {loading ? <div className="loading">LOADING CALENDAR</div>
          : events.length === 0 ? (
            <div className="empty">
              <span style={{ fontSize:24 }}>○</span>
              No events — click Refresh to fetch macro calendar
            </div>
          ) : (
            <table className="data-table">
              <thead><tr>
                <th>Date</th><th>Time</th><th>Event</th>
                <th>Country</th><th>Impact</th><th>Forecast</th><th>Previous</th>
              </tr></thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={e.id || i}>
                    <td className="mono">{e.event_date}</td>
                    <td className="mono" style={{ color:'var(--text-muted)' }}>{e.event_time || '—'}</td>
                    <td style={{ fontWeight:500 }}>{e.title}</td>
                    <td style={{ color:'var(--text-muted)', fontSize:11 }}>{e.country || e.currency}</td>
                    <td>
                      <span style={{
                        color: impactColor[e.impact] || 'var(--text-muted)',
                        fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700,
                        textTransform:'uppercase',
                      }}>{e.impact || '—'}</span>
                    </td>
                    <td className="mono" style={{ color:'var(--text-muted)' }}>{e.forecast || '—'}</td>
                    <td className="mono" style={{ color:'var(--text-muted)' }}>{e.previous || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}

export default Journal
