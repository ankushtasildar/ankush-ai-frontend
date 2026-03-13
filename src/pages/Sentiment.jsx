import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const SCORE_COLOR = (s) =>
  s >= 0.5 ? 'var(--green)' : s <= -0.5 ? 'var(--red)' : 'var(--yellow)'

const SCORE_LABEL = (s) =>
  s >= 0.5 ? 'BULLISH' : s <= -0.5 ? 'BEARISH' : 'NEUTRAL'

export default function Sentiment() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = useCallback(() => {
    api.sentiment.list().then(setItems).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setRefreshing(true)
    try { await api.sentiment.refresh(); setTimeout(load, 2000) } catch {}
    setRefreshing(false)
  }

  const filtered = filter === 'all' ? items : items.filter(i => SCORE_LABEL(i.score).toLowerCase() === filter)
  const bullCount = items.filter(i => i.score >= 0.5).length
  const bearCount = items.filter(i => i.score <= -0.5).length
  const neutCount = items.length - bullCount - bearCount
  const avgScore = items.length > 0 ? (items.reduce((s, i) => s + (i.score || 0), 0) / items.length) : 0

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-tile">
          <div className="metric-label">Total Signals</div>
          <div className="metric-value">{items.length}</div>
        </div>
        <div className="metric-tile green">
          <div className="metric-label">Bullish</div>
          <div className="metric-value positive">{bullCount}</div>
        </div>
        <div className="metric-tile red">
          <div className="metric-label">Bearish</div>
          <div className="metric-value negative">{bearCount}</div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Avg Score</div>
          <div className="metric-value" style={{ color: SCORE_COLOR(avgScore), fontSize: 20 }}>
            {avgScore >= 0 ? '+' : ''}{avgScore.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="card section">
        <div className="card-header">
          <span className="card-title">◈ Market Sentiment</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: 11 }}
            >
              <option value="all">All</option>
              <option value="bullish">Bullish</option>
              <option value="neutral">Neutral</option>
              <option value="bearish">Bearish</option>
            </select>
            <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }} onClick={refresh} disabled={refreshing}>
              {refreshing ? '⟳ Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading">LOADING SENTIMENT</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <span style={{ fontSize: 24 }}>◈</span>
            No sentiment data — click Refresh to fetch latest signals
          </div>
        ) : (
          <table className="data-table">
            <thead><tr>
              <th>Symbol</th>
              <th>Sentiment</th>
              <th>Score</th>
              <th>Source</th>
              <th>Headline</th>
              <th>Date</th>
            </tr></thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={item.id || i}>
                  <td className="mono" style={{ fontWeight: 600 }}>{item.symbol || '—'}</td>
                  <td>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      fontWeight: 700,
                      color: SCORE_COLOR(item.score || 0),
                      textTransform: 'uppercase',
                    }}>
                      {SCORE_LABEL(item.score || 0)}
                    </span>
                  </td>
                  <td className="mono" style={{ color: SCORE_COLOR(item.score || 0) }}>
                    {item.score != null ? (item.score >= 0 ? '+' : '') + Number(item.score).toFixed(3) : '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{item.source || '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.headline || item.title || '—'}
                  </td>
                  <td className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {item.published_at ? new Date(item.published_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
