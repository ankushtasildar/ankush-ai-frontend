import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

// Mini equity curve SVG
function EquityCurve({ trades, width = 300, height = 80 }) {
  if (!trades.length) return null
  let running = 0
  const points = trades.map((t, i) => {
    running += parseFloat(t.pnl || 0)
    return { x: i, y: running }
  })
  const minY = Math.min(0, ...points.map(p => p.y))
  const maxY = Math.max(0, ...points.map(p => p.y))
  const rangeY = maxY - minY || 1
  const scaleX = width / (points.length - 1 || 1)
  const scaleY = (height - 8) / rangeY
  const zeroY = height - (0 - minY) * scaleY - 4

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * scaleX).toFixed(1)},${(height - (p.y - minY) * scaleY - 4).toFixed(1)}`).join(' ')
  const isPos = running >= 0

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="ec-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isPos ? '#10b981' : '#ef4444'} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={isPos ? '#10b981' : '#ef4444'} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Zero line */}
      <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4,4"/>
      {/* Area fill */}
      <path d={path + ` L${(points.length - 1) * scaleX},${zeroY} L0,${zeroY} Z`} fill="url(#ec-grad)"/>
      {/* Line */}
      <path d={path} fill="none" stroke={isPos ? '#10b981' : '#ef4444'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* End dot */}
      {points.length > 0 && <circle cx={(points[points.length-1].x * scaleX).toFixed(1)} cy={(height - (points[points.length-1].y - minY) * scaleY - 4).toFixed(1)} r="3" fill={isPos ? '#10b981' : '#ef4444'}/>}
    </svg>
  )
}

// Trade row
function TradeRow({ trade, onEdit, onClose, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const pnl = parseFloat(trade.pnl || 0)
  const isOpen = trade.status === 'open'
  const isWin = !isOpen && pnl > 0
  const statusColor = isOpen ? '#3b82f6' : isWin ? '#10b981' : '#ef4444'

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', transition: 'background 0.15s', background: expanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}
        onMouseEnter={e => !expanded && (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
        onMouseLeave={e => !expanded && (e.currentTarget.style.background = 'transparent')}
      >
        <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: isOpen ? 'rgba(59,130,246,0.12)' : isWin ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${statusColor}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: statusColor,
              fontFamily: '"DM Mono",monospace',
            }}>{trade.ticker?.substring(0, 3)}</div>
            <div>
              <div style={{ color: '#f0f4ff', fontSize: 14, fontWeight: 600 }}>{trade.ticker}</div>
              <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', marginTop: 1 }}>
                {trade.direction || (trade.pnl > 0 ? 'LONG' : 'SHORT')}
              </div>
            </div>
          </div>
        </td>
        <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ color: '#8b9fc0', fontSize: 12 }}>{trade.strategy || '—'}</div>
        </td>
        <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: '"DM Mono",monospace' }}>
          <div style={{ color: '#8b9fc0', fontSize: 12 }}>${parseFloat(trade.entry_price || 0).toFixed(2)}</div>
          {trade.exit_price && <div style={{ color: '#4a5c7a', fontSize: 10, marginTop: 2 }}>→ ${parseFloat(trade.exit_price).toFixed(2)}</div>}
        </td>
        <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {isOpen ? (
            <span style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontSize: 11, fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>● OPEN</span>
          ) : (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 8 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 6,
                background: isWin ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                color: isWin ? '#10b981' : '#ef4444',
                fontSize: 12, fontFamily: '"DM Mono",monospace', fontWeight: 700,
              }}>
                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
              </span>
            </div>
          )}
        </td>
        <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#4a5c7a', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>
          {trade.created_at?.split('T')[0]}
        </td>
        <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ color: '#2d3d50', fontSize: 14, transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ padding: '0 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ padding: '14px 0', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {trade.notes && (
                <div style={{ flex: 2, minWidth: 200 }}>
                  <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', marginBottom: 6 }}>NOTES</div>
                  <div style={{ color: '#8b9fc0', fontSize: 13, lineHeight: 1.6 }}>{trade.notes}</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {isOpen && (
                  <button onClick={() => onClose(trade)} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: 11, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
                    Close Trade
                  </button>
                )}
                <button onClick={() => onEdit(trade)} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#8b9fc0', fontSize: 11, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>
                  Edit
                </button>
                <button onClick={() => onDelete(trade.id)} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>
                  Delete
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function Journal() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTrade, setEditTrade] = useState(null)
  const [closeTrade, setCloseTrade] = useState(null)
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [form, setForm] = useState({ ticker: '', direction: 'LONG', entry_price: '', exit_price: '', pnl: '', strategy: '', notes: '', status: 'open' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) loadEntries() }, [user])

  async function loadEntries() {
    setLoading(true)
    const { data } = await supabase.from('journal_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (data) setEntries(data)
    setLoading(false)
  }

  async function saveEntry() {
    if (!form.ticker) return
    setSaving(true)
    const payload = { ...form, user_id: user.id, updated_at: new Date().toISOString() }
    if (editTrade) {
      await supabase.from('journal_entries').update(payload).eq('id', editTrade.id)
    } else {
      await supabase.from('journal_entries').insert({ ...payload, created_at: new Date().toISOString() })
    }
    setSaving(false)
    setShowForm(false)
    setEditTrade(null)
    setForm({ ticker: '', direction: 'LONG', entry_price: '', exit_price: '', pnl: '', strategy: '', notes: '', status: 'open' })
    loadEntries()
  }

  async function deleteEntry(id) {
    await supabase.from('journal_entries').delete().eq('id', id)
    loadEntries()
  }

  function openEdit(trade) {
    setForm({ ticker: trade.ticker || '', direction: trade.direction || 'LONG', entry_price: trade.entry_price || '', exit_price: trade.exit_price || '', pnl: trade.pnl || '', strategy: trade.strategy || '', notes: trade.notes || '', status: trade.status || 'open' })
    setEditTrade(trade)
    setShowForm(true)
  }

  function openClose(trade) {
    setForm({ ...form, ticker: trade.ticker, exit_price: '', pnl: '', status: 'closed' })
    setCloseTrade(trade)
    setEditTrade(trade)
    setShowForm(true)
  }

  function exportCSV() {
    const header = 'Ticker,Direction,Entry,Exit,P&L,Strategy,Status,Date\n'
    const rows = entries.map(e => `${e.ticker},${e.direction || ''},${e.entry_price || ''},${e.exit_price || ''},${e.pnl || 0},${e.strategy || ''},${e.status},${e.created_at?.split('T')[0]}`).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'ankushai_journal.csv'; a.click()
  }

  // Stats
  const closed = entries.filter(e => e.status === 'closed')
  const open = entries.filter(e => e.status === 'open')
  const totalPnl = closed.reduce((s, e) => s + parseFloat(e.pnl || 0), 0)
  const wins = closed.filter(e => parseFloat(e.pnl || 0) > 0)
  const winRate = closed.length ? Math.round(wins.length / closed.length * 100) : 0
  const filtered = filterStatus === 'ALL' ? entries : entries.filter(e => e.status === filterStatus.toLowerCase())

  return (
    <div style={{ padding: '28px 32px', fontFamily: '"DM Sans",sans-serif', color: '#e2e8f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        .jnl-input{width:100%;background:#111927;border:1.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 14px;color:#f0f4ff;font-family:"DM Sans",sans-serif;font-size:14px;outline:none;transition:border-color 0.15s;box-sizing:border-box}
        .jnl-input:focus{border-color:#2563eb}
        .jnl-input::placeholder{color:#4a5c7a}
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>Trade Journal</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: '"Syne",sans-serif', color: '#f0f4ff' }}>Trading Log 📓</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={exportCSV} style={{ padding: '10px 18px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#8b9fc0', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>
            ↓ Export CSV
          </button>
          <button onClick={() => { setShowForm(true); setEditTrade(null); setForm({ ticker: '', direction: 'LONG', entry_price: '', exit_price: '', pnl: '', strategy: '', notes: '', status: 'open' }) }}
            style={{ padding: '10px 20px', borderRadius: 8, background: '#2563eb', border: 'none', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>
            + New Trade
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total P&L', val: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Win Rate', val: `${winRate}%`, color: winRate >= 60 ? '#10b981' : winRate >= 45 ? '#f59e0b' : '#ef4444' },
          { label: 'Closed Trades', val: closed.length, color: '#8b9fc0' },
          { label: 'Open Positions', val: open.length, color: '#3b82f6' },
          { label: 'Wins / Losses', val: `${wins.length} / ${closed.length - wins.length}`, color: '#8b5cf6' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'linear-gradient(135deg, #0d1420, #0a0f1a)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ color: '#4a5c7a', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: '"DM Mono",monospace' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      {closed.length > 1 && (
        <div style={{ background: 'linear-gradient(135deg, #0d1420, #0a0f1a)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: '"Syne",sans-serif', color: '#f0f4ff' }}>Equity Curve</div>
            <div style={{ color: totalPnl >= 0 ? '#10b981' : '#ef4444', fontSize: 16, fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </div>
          </div>
          <EquityCurve trades={[...closed].reverse()} width={Math.min(700, window.innerWidth - 100)} height={90} />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['ALL', 'OPEN', 'CLOSED'].map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            style={{ padding: '7px 16px', borderRadius: 7, background: filterStatus === f ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.04)', border: filterStatus === f ? '1px solid rgba(37,99,235,0.35)' : '1px solid rgba(255,255,255,0.07)', color: filterStatus === f ? '#60a5fa' : '#8b9fc0', fontSize: 11, fontFamily: '"DM Mono",monospace', cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.08em' }}>
            {f}
          </button>
        ))}
        <div style={{ color: '#2d3d50', fontSize: 12, fontFamily: '"DM Mono",monospace', alignSelf: 'center', marginLeft: 8 }}>
          {filtered.length} entries
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 28, animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⚡</div>
          <div style={{ color: '#4a5c7a', fontSize: 12, fontFamily: '"DM Mono",monospace' }}>Loading journal...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#2d3d50' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📓</div>
          <div style={{ fontSize: 16, fontWeight: 600, fontFamily: '"Syne",sans-serif', color: '#4a5c7a', marginBottom: 8 }}>No trades yet</div>
          <div style={{ fontSize: 12, fontFamily: '"DM Mono",monospace', marginBottom: 20 }}>Start logging your trades to track performance</div>
          <button onClick={() => setShowForm(true)} style={{ padding: '12px 24px', background: '#2563eb', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>+ Log First Trade</button>
        </div>
      ) : (
        <div style={{ background: 'linear-gradient(135deg, #0d1420, #0a0f1a)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                {['Ticker', 'Strategy', 'Entry / Exit', 'P&L', 'Date', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#2d3d50', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.12em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <TradeRow key={entry.id} trade={entry} onEdit={openEdit} onClose={openClose} onDelete={deleteEntry} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Entry Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: 36, width: '100%', maxWidth: 520, animation: 'fadeUp 0.2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: '"Syne",sans-serif', color: '#f0f4ff' }}>
                {editTrade ? (closeTrade ? 'Close Trade' : 'Edit Trade') : 'New Trade'}
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#8b9fc0', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>TICKER *</label>
                <input className="jnl-input" placeholder="AAPL" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>DIRECTION</label>
                <select className="jnl-input" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })} style={{ cursor: 'pointer' }}>
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </div>
              <div>
                <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>ENTRY PRICE</label>
                <input className="jnl-input" type="number" step="0.01" placeholder="0.00" value={form.entry_price} onChange={e => setForm({ ...form, entry_price: e.target.value })} />
              </div>
              <div>
                <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>EXIT PRICE</label>
                <input className="jnl-input" type="number" step="0.01" placeholder="0.00" value={form.exit_price} onChange={e => setForm({ ...form, exit_price: e.target.value })} />
              </div>
              <div>
                <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>P&L ($)</label>
                <input className="jnl-input" type="number" step="0.01" placeholder="0.00" value={form.pnl} onChange={e => setForm({ ...form, pnl: e.target.value })} />
              </div>
              <div>
                <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>STATUS</label>
                <select className="jnl-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={{ cursor: 'pointer' }}>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>STRATEGY</label>
              <input className="jnl-input" placeholder="e.g. RSI bounce, momentum breakout..." value={form.strategy} onChange={e => setForm({ ...form, strategy: e.target.value })} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>NOTES</label>
              <textarea className="jnl-input" placeholder="Thesis, risk level, observations..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ resize: 'vertical', minHeight: 70 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#8b9fc0', fontSize: 13, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Cancel</button>
              <button onClick={saveEntry} disabled={saving || !form.ticker}
                style={{ flex: 2, padding: 13, background: '#2563eb', border: 'none', borderRadius: 10, color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 700, opacity: saving || !form.ticker ? 0.6 : 1 }}>
                {saving ? 'Saving...' : editTrade ? 'Save Changes' : 'Log Trade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
