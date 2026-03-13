import { useState } from 'react'
import { api } from '../lib/api'
import { useRealtimeTable } from '../lib/useRealtime'
import { ScoreHistogram } from '../components/Charts'

export default function Signals() {
  const { rows: signals, loading } = useRealtimeTable('signals', { limit: 100 })
  const [filter, setFilter]  = useState('all')
  const [running, setRunning] = useState(false)

  const runPipeline = async () => {
    setRunning(true)
    try { await api.signals.run() } catch {}
    setTimeout(() => setRunning(false), 8000)
  }

  const filtered = filter === 'all' ? signals
    : filter === 'high' ? signals.filter(s => s.score >= 70)
    : filter === 'mid'  ? signals.filter(s => s.score >= 45 && s.score < 70)
    : signals.filter(s => s.score < 45)

  const avgScore = signals.length
    ? Math.round(signals.reduce((s, x) => s + (x.score || 0), 0) / signals.length)
    : null

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-tile">
          <div className="metric-label">Total Signals</div>
          <div className="metric-value">{signals.length}</div>
        </div>
        <div className="metric-tile green">
          <div className="metric-label">High Confidence</div>
          <div className="metric-value positive">{signals.filter(s => s.score >= 70).length}</div>
          <div className="metric-sub">Score ≥ 70</div>
        </div>
        <div className="metric-tile yellow">
          <div className="metric-label">Mid Confidence</div>
          <div className="metric-value" style={{ color: 'var(--yellow)' }}>
            {signals.filter(s => s.score >= 45 && s.score < 70).length}
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Avg Score</div>
          <div className="metric-value">{avgScore ?? '—'}</div>
        </div>
      </div>

      {signals.length > 0 && (
        <div className="card section">
          <div className="card-header"><span className="card-title">Score Distribution</span></div>
          <ScoreHistogram signals={signals} height={160} />
        </div>
      )}

      <div className="card section">
        <div className="card-header">
          <span className="card-title">
            ⬤ Signal Feed
            <span style={{ fontSize: 9, color: 'var(--green)', marginLeft: 6 }}>LIVE</span>
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all','high','mid','low'].map(f => (
              <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setFilter(f)}>
                {f.toUpperCase()}
              </button>
            ))}
            <button className="btn btn-primary" onClick={runPipeline} disabled={running}
              style={{ padding: '4px 12px', fontSize: 11 }}>
              {running ? '⟳' : '▶'} Run
            </button>
          </div>
        </div>

        {loading ? <div className="loading">CONNECTING</div>
          : filtered.length === 0 ? (
            <div className="empty"><span style={{fontSize:24}}>◆</span>No signals yet</div>
          ) : (
            <table className="data-table">
              <thead><tr>
                <th>Symbol</th><th>Signal</th><th>Score</th>
                <th>Price</th><th>RSI</th><th>Time</th>
              </tr></thead>
              <tbody>
                {filtered.map((s, i) => {
                  const tier = s.score >= 70 ? 'high' : s.score >= 45 ? 'mid' : 'low'
                  const cls  = s.signal_type?.includes('bull') ? 'bullish' : s.signal_type?.includes('bear') ? 'bearish' : 'neutral'
                  return (
                    <tr key={s.id || i}>
                      <td className="mono" style={{ fontWeight: 600 }}>{s.symbol}</td>
                      <td><span className={`tag ${cls}`}>{s.signal_type?.replace(/_/g, ' ')}</span></td>
                      <td><span className={`score-badge ${tier}`}>{s.score}</span></td>
                      <td className="mono">{s.price ? `$${Number(s.price).toFixed(2)}` : '—'}</td>
                      <td className="mono" style={{ color: s.rsi > 70 ? 'var(--red)' : s.rsi < 30 ? 'var(--green)' : 'var(--text-muted)' }}>
                        {s.rsi ? Number(s.rsi).toFixed(1) : '—'}
                      </td>
                      <td className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {s.created_at ? new Date(s.created_at).toLocaleTimeString() : '—'}
                      </td>
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
