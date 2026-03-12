import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: 12,
      fontFamily: 'var(--font-mono)'
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text-primary)' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  )
}

export default function Backtest() {
  const [results, setResults]     = useState([])
  const [running, setRunning]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState(null)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate]     = useState(new Date().toISOString().split('T')[0])
  const [minScore, setMinScore]   = useState(60)

  const loadResults = async () => {
    try {
      const data = await api.backtest.results()
      setResults(Array.isArray(data) ? data : [])
      if (data?.length) setSelected(data[0])
    } catch {
      // fallback to Supabase direct
      const { data } = await supabase
        .from('backtest_results').select('*')
        .order('created_at', { ascending: false }).limit(10)
      setResults(data || [])
      if (data?.length) setSelected(data[0])
    }
    setLoading(false)
  }

  useEffect(() => { loadResults() }, [])

  const runBacktest = async () => {
    setRunning(true)
    try {
      await api.backtest.run(startDate, endDate, minScore)
      // Poll for results
      setTimeout(async () => {
        await loadResults()
        setRunning(false)
      }, 6000)
    } catch (e) {
      alert('Backend not running — start with: cd backend && uvicorn api:app --reload')
      setRunning(false)
    }
  }

  // Build equity curve from selected result's details
  const equityCurve = (() => {
    if (!selected?.details?.length) return []
    let cumPnl = 0
    return selected.details.map((d, i) => {
      const outcome = d.outcome === 'win' ? 1 : d.outcome === 'loss' ? -1 : 0
      cumPnl += outcome
      return { idx: i + 1, pnl: cumPnl, symbol: d.symbol, score: d.score }
    })
  })()

  // Score distribution
  const scoreDist = (() => {
    if (!selected?.details?.length) return []
    const buckets = {}
    selected.details.forEach(d => {
      const bucket = Math.floor(d.score / 10) * 10
      if (!buckets[bucket]) buckets[bucket] = { range: `${bucket}-${bucket+9}`, wins: 0, losses: 0 }
      if (d.outcome === 'win') buckets[bucket].wins++
      else if (d.outcome === 'loss') buckets[bucket].losses++
    })
    return Object.values(buckets).sort((a, b) => parseInt(a.range) - parseInt(b.range))
  })()

  const winRate = selected ? ((selected.wins / Math.max(selected.total_signals, 1)) * 100).toFixed(1) : null

  return (
    <div>
      {/* Run controls */}
      <div className="card section">
        <div className="card-header">
          <span className="card-title">Run Backtest</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ width: 160 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ width: 160 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Min Score</label>
            <input type="number" value={minScore} onChange={e => setMinScore(parseInt(e.target.value))}
              min={0} max={100} style={{ width: 100 }} />
          </div>
          <button className="btn btn-primary" onClick={runBacktest} disabled={running}
            style={{ height: 36 }}>
            {running ? '⟳ Running…' : '▶ Run Backtest'}
          </button>
          {running && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Testing signals against historical prices…
            </span>
          )}
        </div>
      </div>

      {/* Past runs */}
      {results.length > 1 && (
        <div className="card section">
          <div className="card-header"><span className="card-title">Past Runs</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {results.map(r => (
              <button key={r.id}
                className={`btn ${selected?.id === r.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 11 }}
                onClick={() => setSelected(r)}>
                {r.start_date} → {r.end_date}
                &nbsp;·&nbsp;
                {((r.wins / Math.max(r.total_signals, 1)) * 100).toFixed(0)}% WR
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? <div className="loading">LOADING RESULTS</div>
        : !selected ? (
          <div className="empty" style={{ height: 200 }}>
            <span style={{ fontSize: 32 }}>◈</span>
            No backtest results yet — configure dates and click Run
          </div>
        ) : (
          <>
            {/* Summary metrics */}
            <div className="metrics-grid section">
              <div className="metric-tile">
                <div className="metric-label">Total Signals</div>
                <div className="metric-value">{selected.total_signals}</div>
                <div className="metric-sub">{selected.start_date} → {selected.end_date}</div>
              </div>
              <div className={`metric-tile ${parseFloat(winRate) >= 55 ? 'green' : parseFloat(winRate) >= 45 ? 'yellow' : 'red'}`}>
                <div className="metric-label">Win Rate</div>
                <div className={`metric-value ${parseFloat(winRate) >= 55 ? 'positive' : parseFloat(winRate) < 45 ? 'negative' : ''}`}>
                  {winRate}%
                </div>
                <div className="metric-sub">{selected.wins}W / {selected.losses}L / {selected.neutral ?? 0}N</div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">Avg Score</div>
                <div className="metric-value">{selected.avg_score ? Number(selected.avg_score).toFixed(1) : '—'}</div>
              </div>
              <div className={`metric-tile ${equityCurve.length && equityCurve[equityCurve.length - 1].pnl > 0 ? 'green' : 'red'}`}>
                <div className="metric-label">Net Outcome</div>
                <div className={`metric-value ${equityCurve.length && equityCurve[equityCurve.length - 1].pnl > 0 ? 'positive' : 'negative'}`}>
                  {equityCurve.length ? (equityCurve[equityCurve.length - 1].pnl > 0 ? '+' : '') + equityCurve[equityCurve.length - 1].pnl : '—'}
                </div>
                <div className="metric-sub">cumulative W-L</div>
              </div>
            </div>

            <div className="grid-2 section">
              {/* Equity curve */}
              <div className="card">
                <div className="card-header"><span className="card-title">Cumulative W-L Curve</span></div>
                {equityCurve.length === 0 ? (
                  <div className="empty">No signal details available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={equityCurve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="var(--green)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="idx" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        axisLine={false} tickLine={false} width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="pnl" name="Cum W-L"
                        stroke="var(--green)" fill="url(#pnlGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Score distribution */}
              <div className="card">
                <div className="card-header"><span className="card-title">Wins vs Losses by Score</span></div>
                {scoreDist.length === 0 ? (
                  <div className="empty">No score data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={scoreDist} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="range" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        axisLine={false} tickLine={false} width={25} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="wins"   name="Wins"   fill="var(--green)" radius={[2,2,0,0]} />
                      <Bar dataKey="losses" name="Losses" fill="var(--red)"   radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Signal breakdown table */}
            {selected.details?.length > 0 && (
              <div className="card section">
                <div className="card-header">
                  <span className="card-title">Signal Breakdown</span>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }}
                    onClick={() => {
                      const csv = ['Symbol,Signal,Score,Date,Outcome,Entry,Exit']
                        .concat(selected.details.map(d =>
                          `${d.symbol},${d.signal_type},${d.score},${d.date},${d.outcome},${d.entry_price ?? ''},${d.exit_price ?? ''}`
                        )).join('\n')
                      const a = document.createElement('a')
                      a.href = 'data:text/csv,' + encodeURIComponent(csv)
                      a.download = `backtest_${selected.start_date}_${selected.end_date}.csv`
                      a.click()
                    }}>
                    ↓ Export CSV
                  </button>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Symbol</th><th>Signal</th><th>Score</th>
                        <th>Date</th><th>Entry</th><th>Exit</th><th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.details.map((d, i) => (
                        <tr key={i}>
                          <td className="mono" style={{ fontWeight: 600 }}>{d.symbol}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {d.signal_type?.replace(/_/g, ' ')}
                          </td>
                          <td>
                            <span className={`score-badge ${d.score >= 70 ? 'high' : d.score >= 45 ? 'mid' : 'low'}`}>
                              {d.score}
                            </span>
                          </td>
                          <td className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{d.date}</td>
                          <td className="mono">{d.entry_price ? `$${Number(d.entry_price).toFixed(2)}` : '—'}</td>
                          <td className="mono">{d.exit_price  ? `$${Number(d.exit_price).toFixed(2)}`  : '—'}</td>
                          <td>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                              color: d.outcome === 'win' ? 'var(--green)' : d.outcome === 'loss' ? 'var(--red)' : 'var(--text-muted)'
                            }}>
                              {d.outcome?.toUpperCase() ?? '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  )
}
