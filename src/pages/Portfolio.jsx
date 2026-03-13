import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useRealtimeTable } from '../lib/useRealtime'
import { PnLBarChart, PriceChart, RSIChart } from '../components/Charts'

const EMPTY = { symbol:'', direction:'long', qty:'', entry_price:'', asset_type:'equity', dte:'' }
const RANGES = [
  { label:'1M', days:30 }, { label:'2M', days:60 }, { label:'3M', days:90 },
  { label:'6M', days:180 }, { label:'1Y', days:365 },
]

function PriceChartPanel({ symbol, entryPrice, onClose }) {
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [days, setDays]           = useState(90)
  const [showEMA, setShowEMA]     = useState(true)
  const [showRSI, setShowRSI]     = useState(true)

  const load = useCallback(async (d) => {
    setLoading(true); setError(null)
    try { setChartData(await api.charts.history(symbol, d)) }
    catch { setError('Price data unavailable — check POLYGON_API_KEY') }
    setLoading(false)
  }, [symbol])

  useEffect(() => { load(days) }, [load, days])

  const bars     = chartData?.bars || []
  const quote    = chartData?.quote
  const last     = bars[bars.length - 1]
  const first    = bars[0]
  const rangeChg = first && last ? ((last.close - first.close) / first.close * 100) : null

  return (
    <div style={{
      background:'var(--bg-elevated)', border:'1px solid var(--border-light)',
      borderLeft:'3px solid var(--blue)', borderRadius:'var(--radius)',
      padding:'20px 24px', marginTop:16,
    }}>
      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:17 }}>{symbol}</span>
          {quote && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:15 }}>
              ${quote.price?.toFixed(2)}
              <span style={{ fontSize:12, marginLeft:8, color: quote.change_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {quote.change_pct >= 0 ? '+' : ''}{quote.change_pct?.toFixed(2)}%
              </span>
            </span>
          )}
          {rangeChg !== null && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'3px 8px', borderRadius:4,
              background: rangeChg >= 0 ? 'rgba(0,255,128,.1)' : 'rgba(255,80,80,.1)',
              color: rangeChg >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {rangeChg >= 0 ? '+' : ''}{rangeChg.toFixed(2)}% ({RANGES.find(r=>r.days===days)?.label})
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
          {RANGES.map(r => (
            <button key={r.days} className={`btn ${days===r.days?'btn-primary':'btn-ghost'}`}
              style={{ padding:'3px 8px', fontSize:10 }} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
          <div style={{ width:1, height:18, background:'var(--border)', margin:'0 4px' }} />
          <button className={`btn ${showEMA?'btn-primary':'btn-ghost'}`}
            style={{ padding:'3px 8px', fontSize:10 }} onClick={() => setShowEMA(v=>!v)}>EMA</button>
          <button className={`btn ${showRSI?'btn-primary':'btn-ghost'}`}
            style={{ padding:'3px 8px', fontSize:10 }} onClick={() => setShowRSI(v=>!v)}>RSI</button>
          <button className="btn btn-ghost" style={{ padding:'3px 8px', fontSize:11 }} onClick={onClose}>✕</button>
        </div>
      </div>

      {loading ? <div className="loading" style={{ height:200 }}>LOADING CHART</div>
       : error   ? <div className="empty" style={{ height:140 }}><span style={{fontSize:20}}>◈</span>{error}</div>
       : (
        <>
          {/* OHLCV stat row */}
          <div style={{ display:'flex', gap:20, marginBottom:14,
            fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)' }}>
            {[['Open',last?.open,'$'],['High',last?.high,'$'],['Low',last?.low,'$'],
              ['Close',last?.close,'$'],['Volume',last?.volume,''],['Entry',entryPrice,'$']
            ].map(([lbl,val,pfx]) => (
              <div key={lbl}>
                <div style={{ fontSize:9, marginBottom:2 }}>{lbl}</div>
                <div style={{ color: lbl==='Entry'?'var(--yellow)':'var(--text-primary)', fontWeight:600 }}>
                  {val != null ? (pfx==='$' ? `$${Number(val).toFixed(2)}` : Number(val).toLocaleString()) : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Price + EMA chart */}
          <PriceChart data={bars} height={220} showEMA={showEMA} entryPrice={entryPrice} />

          {/* RSI panel */}
          {showRSI && (
            <div style={{ marginTop:10 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)',
                marginBottom:4, letterSpacing:'.08em' }}>RSI (14)</div>
              <RSIChart data={bars} height={80} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Portfolio() {
  const { rows: positions, loading } = useRealtimeTable('portfolio_positions')
  const [showForm, setShowForm]       = useState(false)
  const [form, setForm]               = useState(EMPTY)
  const [saving, setSaving]           = useState(false)
  const [activeChart, setActiveChart] = useState(null)   // symbol string

  const save = async () => {
    if (!form.symbol || !form.qty || !form.entry_price) return
    setSaving(true)
    try {
      await api.portfolio.add({
        symbol: form.symbol.toUpperCase(), direction: form.direction,
        qty: parseFloat(form.qty), entry_price: parseFloat(form.entry_price),
        asset_type: form.asset_type, dte: form.dte ? parseInt(form.dte) : null,
      })
    } catch {
      await supabase.from('portfolio_positions').upsert({
        symbol: form.symbol.toUpperCase(), direction: form.direction,
        qty: parseFloat(form.qty), entry_price: parseFloat(form.entry_price),
        asset_type: form.asset_type, updated_at: new Date().toISOString(),
      }, { onConflict: 'symbol' })
    }
    setSaving(false); setShowForm(false); setForm(EMPTY)
  }

  const remove = async (symbol) => {
    if (!confirm(`Remove ${symbol}?`)) return
    if (activeChart === symbol) setActiveChart(null)
    try { await api.portfolio.remove(symbol) }
    catch { await supabase.from('portfolio_positions').delete().eq('symbol', symbol) }
  }

  const toggleChart = (symbol) => setActiveChart(prev => prev === symbol ? null : symbol)

  const totalValue = positions.reduce((s, p) => s + p.qty * (p.current_price || p.entry_price), 0)
  const totalPnl   = positions.reduce((s, p) =>
    s + p.qty * ((p.current_price || p.entry_price) - p.entry_price) * (p.direction === 'long' ? 1 : -1), 0)

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-tile">
          <div className="metric-label">Total Value</div>
          <div className="metric-value">
            {totalValue > 0 ? `$${totalValue.toLocaleString('en-US',{maximumFractionDigits:0})}` : '—'}
          </div>
        </div>
        <div className={`metric-tile ${totalPnl > 0 ? 'green' : totalPnl < 0 ? 'red' : ''}`}>
          <div className="metric-label">Unrealized P&L</div>
          <div className={`metric-value ${totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : ''}`}>
            {totalPnl !== 0 ? `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}` : '—'}
          </div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Open Positions</div>
          <div className="metric-value">{positions.length}</div>
        </div>
      </div>

      {positions.length > 0 && (
        <div className="card section">
          <div className="card-header"><span className="card-title">P&L by Position</span></div>
          <PnLBarChart positions={positions} height={200} />
        </div>
      )}

      <div className="card section">
        <div className="card-header">
          <span className="card-title">
            ⬤ Open Positions
            <span style={{ fontSize:9, color:'var(--green)', marginLeft:6 }}>LIVE</span>
          </span>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cancel' : '+ Add Position'}
          </button>
        </div>

        {showForm && (
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)',
            borderRadius:'var(--radius)', padding:16, margin:16 }}>
            <div className="grid-3" style={{ marginBottom:12 }}>
              <div className="form-group">
                <label>Symbol</label>
                <input placeholder="AAPL" value={form.symbol}
                  onChange={e => setForm({...form, symbol: e.target.value.toUpperCase()})} />
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
            <div className="grid-3">
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" placeholder="100" value={form.qty}
                  onChange={e => setForm({...form, qty: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Entry Price</label>
                <input type="number" placeholder="150.00" value={form.entry_price}
                  onChange={e => setForm({...form, entry_price: e.target.value})} />
              </div>
              <div className="form-group">
                <label>DTE (options)</label>
                <input type="number" placeholder="30" value={form.dte}
                  onChange={e => setForm({...form, dte: e.target.value})} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Position'}
            </button>
          </div>
        )}

        {loading ? <div className="loading">CONNECTING</div>
         : positions.length === 0 ? <div className="empty"><span style={{fontSize:24}}>◉</span>No positions yet</div>
         : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th><th>Type</th><th>Side</th><th>Qty</th>
                <th>Entry</th><th>Current</th><th>P&L</th><th>P&L %</th><th>Chart</th><th></th>
              </tr>
            </thead>
            <tbody>
              {positions.map(p => {
                const cur  = p.current_price || p.entry_price
                const pnl  = p.qty * (cur - p.entry_price) * (p.direction === 'long' ? 1 : -1)
                const pct  = ((cur - p.entry_price) / p.entry_price) * 100 * (p.direction === 'long' ? 1 : -1)
                const isActive = activeChart === p.symbol
                return (
                  <React.Fragment key={p.id}>
                    <tr style={{ background: isActive ? 'rgba(0,120,255,.05)' : undefined }}>
                      <td className="mono" style={{ fontWeight:600 }}>{p.symbol}</td>
                      <td style={{ color:'var(--text-muted)', fontSize:11 }}>{p.asset_type}</td>
                      <td><span className={`tag ${p.direction==='long'?'bullish':'bearish'}`}>{p.direction?.toUpperCase()}</span></td>
                      <td className="mono">{p.qty}</td>
                      <td className="mono">${Number(p.entry_price).toFixed(2)}</td>
                      <td className="mono">${Number(cur).toFixed(2)}</td>
                      <td className={pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                        {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                      </td>
                      <td className={pct >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                      </td>
                      <td>
                        <button className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ padding:'3px 10px', fontSize:11 }}
                          onClick={() => toggleChart(p.symbol)}>
                          {isActive ? '▲ Hide' : '▼ Chart'}
                        </button>
                      </td>
                      <td>
                        <button className="btn btn-ghost"
                          style={{ padding:'3px 8px', fontSize:11 }}
                          onClick={() => remove(p.symbol)}>Remove</button>
                      </td>
                    </tr>
                    {isActive && (
                      <tr key={`chart-${p.id}`}>
                        <td colSpan={10} style={{ padding:'0 16px 16px' }}>
                          <PriceChartPanel
                            symbol={p.symbol}
                            entryPrice={p.entry_price}
                            onClose={() => setActiveChart(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
