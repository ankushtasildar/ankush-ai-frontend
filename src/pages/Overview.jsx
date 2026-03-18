import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useRealtimeTable } from '../lib/useRealtime'
import { PnLBarChart } from '../components/Charts'

export default function Overview() {
  const { rows: signals, loading: sigLoading } = useRealtimeTable('signals', { limit: 25 })
  const { rows: positions, loading: posLoading } = useRealtimeTable('portfolio_positions')
  const [running, setRunning]           = useState(false)
  const [thesis, setThesis]             = useState(null)
  const [thesisSymbol, setThesisSymbol] = useState('')
  const [thesisLoading, setThesisLoading] = useState(false)
  const [health, setHealth]             = useState(null)

  useEffect(() => { api.health().then(setHealth).catch(() => {}) }, [])

  const runPipeline = async () => {
    setRunning(true)
    try { await api.signals.run() } catch {}
    setTimeout(() => setRunning(false), 8000)
  }

  const getThesis = async () => {
    if (!thesisSymbol) return
    setThesisLoading(true)
    try { setThesis(await api.thesis(thesisSymbol.toUpperCase())) }
    catch { setThesis({ symbol: thesisSymbol, thesis: 'Thesis unavailable Ã¢ÂÂ check ANTHROPIC_API_KEY' }) }
    setThesisLoading(false)
  }

  const totalValue = positions.reduce((s, p) => s + p.qty * (p.current_price || p.entry_price), 0)
  const totalPnl   = positions.reduce((s, p) => {
    const pnl = p.qty * ((p.current_price || p.entry_price) - p.entry_price)
    return s + (p.direction === 'long' ? pnl : -pnl)
  }, 0)
  const highConf = signals.filter(s => s.score >= 70).length

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-tile">
          <div className="metric-label">Portfolio Value</div>
          <div className="metric-value">{totalValue > 0 ? `$${totalValue.toLocaleString('en-US',{maximumFractionDigits:0})}` : 'Ã¢ÂÂ'}</div>
          <div className="metric-sub">{positions.length} positions</div>
        </div>
        <div className={`metric-tile ${totalPnl > 0 ? 'green' : totalPnl < 0 ? 'red' : ''}`}>
          <div className="metric-label">Unrealized P&L</div>
          <div className={`metric-value ${totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : ''}`}>
            {totalPnl !== 0 ? `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}` : 'Ã¢ÂÂ'}
          </div>
        </div>
        <div className={`metric-tile ${highConf > 0 ? 'green' : ''}`}>
          <div className="metric-label">Active Signals</div>
          <div className="metric-value">{signals.length}</div>
          <div className="metric-sub">{highConf} high confidence</div>
        </div>
        <div className={`metric-tile ${health ? 'green' : ''}`}>
          <div className="metric-label">Backend</div>
          <div className="metric-value" style={{ fontSize: 14 }}>{health ? 'Ã¢ÂÂ Online' : 'Ã¢ÂÂ Offline'}</div>
          <div className="metric-sub">{health?.supabase?.connected ? 'DB connected' : 'DB offline'}</div>
        </div>
      </div>

      <div className="grid-2 section">
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Ã¢Â¬Â¤ Live Signals
              <span style={{ fontSize: 9, color: 'var(--green)', marginLeft: 6, animation: 'pulse 2s infinite' }}>LIVE</span>
            </span>
            <button className="btn btn-primary" onClick={runPipeline} disabled={running}
              style={{ padding: '5px 12px', fontSize: 11 }}>
              {running ? 'Ã¢ÂÂ³ RunningÃ¢ÂÂ¦' : 'Ã¢ÂÂ¶ Run Pipeline'}
            </button>
          </div>
          {sigLoading ? <div className="loading">CONNECTING</div>
            : signals.length === 0 ? <div className="empty"><span style={{fontSize:24}}>Ã¢ÂÂ</span>No signals Ã¢ÂÂ click Run Pipeline</div>
            : (
              <table className="data-table">
                <thead><tr><th>Symbol</th><th>Signal</th><th>Score</th><th>Price</th><th>RSI</th></tr></thead>
                <tbody>
                  {signals.map((s, i) => {
                    const tier = s.score >= 70 ? 'high' : s.score >= 45 ? 'mid' : 'low'
                    const cls  = s.signal_type?.includes('bull') ? 'bullish' : s.signal_type?.includes('bear') ? 'bearish' : 'neutral'
                    return (
                      <tr key={s.id || i} style={{ cursor: 'pointer' }} onClick={() => setThesisSymbol(s.symbol)}>
                        <td className="mono" style={{ fontWeight: 600 }}>{s.symbol}</td>
                        <td><span className={`tag ${cls}`}>{s.signal_type?.replace(/_/g, ' ')}</span></td>
                        <td><span className={`score-badge ${tier}`}>{s.score}</span></td>
                        <td className="mono">{s.price ? `$${Number(s.price).toFixed(2)}` : 'Ã¢ÂÂ'}</td>
                        <td className="mono" style={{ color: s.rsi > 70 ? 'var(--red)' : s.rsi < 30 ? 'var(--green)' : 'var(--text-muted)' }}>
                          {s.rsi ? Number(s.rsi).toFixed(1) : 'Ã¢ÂÂ'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Ã¢Â¬Â¤ Positions
              <span style={{ fontSize: 9, color: 'var(--green)', marginLeft: 6 }}>LIVE</span>
            </span>
            <Link to="/portfolio" style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none' }}>Manage Ã¢ÂÂ</Link>
          </div>
          {posLoading ? <div className="loading">CONNECTING</div>
            : positions.length === 0 ? <div className="empty"><span style={{fontSize:24}}>Ã¢ÂÂ</span>No positions</div>
            : (
              <table className="data-table">
                <thead><tr><th>Symbol</th><th>Side</th><th>Entry</th><th>Current</th><th>P&L</th></tr></thead>
                <tbody>
                  {positions.slice(0, 10).map(p => {
                    const cur = p.current_price || p.entry_price
                    const pnl = p.qty * (cur - p.entry_price) * (p.direction === 'long' ? 1 : -1)
                    return (
                      <tr key={p.id}>
                        <td className="mono" style={{ fontWeight: 600 }}>{p.symbol}</td>
                        <td><span className={`tag ${p.direction === 'long' ? 'bullish' : 'bearish'}`}>{p.direction?.toUpperCase()}</span></td>
                        <td className="mono">${Number(p.entry_price).toFixed(2)}</td>
                        <td className="mono">${Number(cur).toFixed(2)}</td>
                        <td className={pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </div>
      </div>

      <div className="card section">
        <div className="card-header">
          <span className="card-title">Ã¢ÂÂ¡ AI Thesis Generator</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Click any signal row to pre-fill</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input placeholder="Symbol e.g. NVDA" value={thesisSymbol}
            onChange={e => setThesisSymbol(e.target.value.toUpperCase())}
            style={{ maxWidth: 160 }}
            onKeyDown={e => e.key === 'Enter' && getThesis()} />
          <button className="btn btn-primary" onClick={getThesis} disabled={thesisLoading || !thesisSymbol}>
            {thesisLoading ? 'GeneratingÃ¢ÂÂ¦' : 'Generate Thesis'}
          </button>
        </div>
        {thesis && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderLeft: '3px solid var(--blue)', borderRadius: 'var(--radius)',
            padding: '16px 20px', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)', marginBottom: 10, letterSpacing: '.1em' }}>
              THESIS ÃÂ· {thesis.symbol}
            </div>
            {thesis.thesis}
          </div>
        )}
      </div>
    </div>
  )
}
