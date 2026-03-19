import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useMarket } from '../lib/useMarket.jsx'
import { supabase } from '../lib/supabase'

// Mini sparkline
function MiniSpark({ color = '#10b981', up = true }) {
  const d = up
    ? 'M0,14 L5,11 L10,12 L15,8 L20,9 L25,5 L30,3'
    : 'M0,3 L5,5 L10,4 L15,8 L20,7 L25,11 L30,14'
  return (
    <svg width={32} height={16} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
      <circle cx={up ? 30 : 30} cy={up ? 3 : 14} r="2" fill={color}/>
    </svg>
  )
}

// Allocation donut
function AllocationDonut({ positions, size = 120 }) {
  if (!positions.length) return null
  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']
  const total = positions.reduce((s, p) => s + Math.abs(p.value || 0), 0)
  if (!total) return null

  let angle = -Math.PI / 2
  const cx = size / 2, cy = size / 2, r = size * 0.38, inner = r * 0.6

  const slices = positions.slice(0, 7).map((p, i) => {
    const pct = Math.abs(p.value || 0) / total
    const sweep = pct * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle)
    const xi1 = cx + inner * Math.cos(angle - sweep), yi1 = cy + inner * Math.sin(angle - sweep)
    const xi2 = cx + inner * Math.cos(angle), yi2 = cy + inner * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return {
      d: `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${xi2.toFixed(2)},${yi2.toFixed(2)} A${inner},${inner} 0 ${large},0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z`,
      color: colors[i % colors.length],
      symbol: p.ticker,
      pct: Math.round(pct * 100),
    }
  })

  return (
    <svg width={size} height={size}>
      {slices.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} opacity="0.85" stroke="#080c14" strokeWidth="1.5"/>
      ))}
      <circle cx={cx} cy={cy} r={inner} fill="#080c14"/>
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#f0f4ff" fontSize="11" fontWeight="700" fontFamily="DM Mono">{positions.length}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#4a5c7a" fontSize="8" fontFamily="DM Mono">POSITIONS</text>
    </svg>
  )
}

export default function Portfolio() {
  const { user } = useAuth()
  const { quotes, getQuote } = useMarket()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ticker: '', shares: '', cost_basis: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) loadPositions() }, [user])

  async function loadPositions() {
    setLoading(true)
    const { data } = await supabase.from('positions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (data) setPositions(data)
    setLoading(false)
  }

  async function addPosition() {
    if (!form.ticker || !form.shares) return
    setSaving(true)
    await supabase.from('positions').insert({
      user_id: user.id,
      ticker: form.ticker.toUpperCase(),
      shares: parseFloat(form.shares),
      cost_basis: parseFloat(form.cost_basis) || 0,
      notes: form.notes,
      created_at: new Date().toISOString(),
    })
    setSaving(false)
    setShowAdd(false)
    setForm({ ticker: '', shares: '', cost_basis: '', notes: '' })
    loadPositions()
  }

  async function deletePosition(id) {
    await supabase.from('positions').delete().eq('id', id)
    loadPositions()
  }

  // Enrich positions with live quotes
  const enriched = positions.map(p => {
    const q = getQuote(p.ticker)
    const currentPrice = q?.effectivePrice ?? q?.price ?? p.cost_basis
    const value = (currentPrice || 0) * (p.shares || 0)
    const cost = (p.cost_basis || 0) * (p.shares || 0)
    const pnl = value - cost
    const pnlPct = cost ? (pnl / cost) * 100 : 0
    const changePct = q?.effectiveChangePct ?? q?.changePct ?? 0
    return { ...p, currentPrice, value, cost, pnl, pnlPct, changePct, hasLive: !!q }
  })

  const totalValue = enriched.reduce((s, p) => s + (p.value || 0), 0)
  const totalCost = enriched.reduce((s, p) => s + (p.cost || 0), 0)
  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost ? (totalPnl / totalCost) * 100 : 0
  const dayChange = enriched.reduce((s, p) => s + (p.currentPrice || 0) * (p.shares || 0) * (p.changePct || 0) / 100, 0)

  return (
    <div style={{ padding: '28px 32px', fontFamily: '"DM Sans",sans-serif', color: '#e2e8f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        .pos-row:hover{background:rgba(255,255,255,0.02)!important}
        .pf-input{width:100%;background:#111927;border:1.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 14px;color:#f0f4ff;font-family:"DM Sans",sans-serif;font-size:14px;outline:none;transition:border-color 0.15s;box-sizing:border-box}
        .pf-input:focus{border-color:#2563eb}
        .pf-input::placeholder{color:#4a5c7a}
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>Portfolio Tracker</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: '"Syne",sans-serif', color: '#f0f4ff' }}>Holdings 💼</div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', borderRadius: 8, background: '#2563eb', border: 'none', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>
          + Add Position
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Portfolio Value', val: `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#f0f4ff', sub: `${positions.length} positions` },
          { label: 'Total Return', val: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? '#10b981' : '#ef4444', sub: `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%` },
          { label: "Today's Change", val: `${dayChange >= 0 ? '+' : ''}$${dayChange.toFixed(2)}`, color: dayChange >= 0 ? '#10b981' : '#ef4444', sub: 'Live market data' },
          { label: 'Cost Basis', val: `$${totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, color: '#8b9fc0', sub: 'Total invested' },
        ].map(({ label, val, color, sub }) => (
          <div key={label} style={{
            background: 'linear-gradient(135deg, #0d1420, #0a0f1a)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '18px 20px',
            transition: 'all 0.2s', cursor: 'default',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{ color: '#4a5c7a', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
            <div style={{ color, fontSize: 22, fontWeight: 700, fontFamily: '"DM Mono",monospace', marginBottom: 4 }}>{val}</div>
            <div style={{ color: '#2d3d50', fontSize: 11 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Allocation + positions */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 28, animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⚡</div>
          <div style={{ color: '#4a5c7a', fontSize: 12, fontFamily: '"DM Mono",monospace' }}>Loading positions...</div>
        </div>
      ) : positions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#2d3d50' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
          <div style={{ fontSize: 16, fontWeight: 600, fontFamily: '"Syne",sans-serif', color: '#4a5c7a', marginBottom: 8 }}>No positions yet</div>
          <div style={{ fontSize: 12, fontFamily: '"DM Mono",monospace', marginBottom: 20 }}>Add your first holding to start tracking</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '12px 24px', background: '#2563eb', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>+ Add First Position</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: enriched.length > 3 ? '200px 1fr' : '1fr', gap: 20, alignItems: 'start' }}>

          {/* Donut */}
          {enriched.length > 3 && (
            <div style={{ background: 'linear-gradient(135deg, #0d1420, #0a0f1a)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: '"Syne",sans-serif', color: '#f0f4ff', marginBottom: 16 }}>Allocation</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <AllocationDonut positions={enriched} size={120} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enriched.slice(0, 5).map((p, i) => {
                  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444']
                  const pct = totalValue ? Math.round((p.value / totalValue) * 100) : 0
                  return (
                    <div key={p.ticker} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[i], flexShrink: 0 }} />
                        <span style={{ color: '#8b9fc0', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>{p.ticker}</span>
                      </div>
                      <span style={{ color: '#4a5c7a', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Table */}
          <div style={{ background: 'linear-gradient(135deg, #0d1420, #0a0f1a)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {['Symbol', 'Shares', 'Cost', 'Current', 'Value', 'P&L', 'Return', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#2d3d50', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.12em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.map((p, i) => (
                  <tr key={p.id} className="pos-row" style={{ transition: 'background 0.15s' }}>
                    <td style={{ padding: '14px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: p.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: p.pnl >= 0 ? '#10b981' : '#ef4444', fontFamily: '"DM Mono",monospace' }}>
                          {p.ticker?.substring(0, 3)}
                        </div>
                        <div>
                          <div style={{ color: '#f0f4ff', fontSize: 13, fontWeight: 600 }}>{p.ticker}</div>
                          {p.hasLive && <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}/><span style={{ color: '#10b981', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>LIVE</span></div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#8b9fc0', fontSize: 13, fontFamily: '"DM Mono",monospace' }}>{p.shares}</td>
                    <td style={{ padding: '14px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#8b9fc0', fontSize: 13, fontFamily: '"DM Mono",monospace' }}>${parseFloat(p.cost_basis || 0).toFixed(2)}</td>
                    <td style={{ padding: '14px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: '"DM Mono",monospace' }}>
                      <div style={{ color: '#f0f4ff', fontSize: 13, fontWeight: 600 }}>${parseFloat(p.currentPrice || 0).toFixed(2)}</div>
                      {p.changePct !== 0 && <div style={{ color: p.changePct >= 0 ? '#10b981' : '#ef4444', fontSize: 10, marginTop: 1 }}>{p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%</div>}
                    </td>
                    <td style={{ padding: '14px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
                      ${p.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '14px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: p.pnl >= 0 ? '#10b981' : '#ef4444', fontSize: 13, fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
                        {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 6,
                          background: p.pnlPct >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: p.pnlPct >= 0 ? '#10b981' : '#ef4444',
                          fontSize: 11, fontFamily: '"DM Mono",monospace', fontWeight: 600,
                        }}>
                          {p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(2)}%
                        </span>
                        <MiniSpark color={p.pnlPct >= 0 ? '#10b981' : '#ef4444'} up={p.pnlPct >= 0} />
                      </div>
                    </td>
                    <td style={{ padding: '14px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <button onClick={() => deletePosition(p.id)} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6, color: '#ef4444', padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: '"DM Mono",monospace', transition: 'all 0.15s' }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add position modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: 36, width: '100%', maxWidth: 440, animation: 'fadeUp 0.2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: '"Syne",sans-serif', color: '#f0f4ff' }}>Add Position</div>
              <button onClick={() => setShowAdd(false)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#8b9fc0', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>TICKER *</label>
                <input className="pf-input" placeholder="AAPL" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>SHARES *</label>
                <input className="pf-input" type="number" placeholder="100" value={form.shares} onChange={e => setForm({ ...form, shares: e.target.value })} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>COST BASIS (per share)</label>
                <input className="pf-input" type="number" step="0.01" placeholder="150.00" value={form.cost_basis} onChange={e => setForm({ ...form, cost_basis: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>NOTES</label>
              <input className="pf-input" placeholder="Thesis, conviction level..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#8b9fc0', fontSize: 13, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Cancel</button>
              <button onClick={addPosition} disabled={saving || !form.ticker || !form.shares}
                style={{ flex: 2, padding: 13, background: '#2563eb', border: 'none', borderRadius: 10, color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 700, opacity: saving || !form.ticker || !form.shares ? 0.6 : 1 }}>
                {saving ? 'Adding...' : 'Add Position'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
