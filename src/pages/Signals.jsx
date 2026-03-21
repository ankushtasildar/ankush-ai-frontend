import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const fmt = (n, dec=2) => n == null ? '—' : Number(n).toLocaleString('en-US', {minimumFractionDigits:dec, maximumFractionDigits:dec})
const fmtPct = n => n == null ? '—' : (n > 0 ? '+' : '') + fmt(n, 2) + '%'
const fmtVol = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : n?.toFixed(0) || '—'

const WATCHLIST_KEY = 'ankushai_signals_wl'

// Price alerts stored in localStorage
function getAlerts() { try { return JSON.parse(localStorage.getItem('ankushai_alerts') || '[]') } catch { return [] } }
function saveAlerts(a) { localStorage.setItem('ankushai_alerts', JSON.stringify(a)) }

function SignalCard({ signal, onAddAlert }) {
  const isCall = signal.type === 'call' || signal.sentiment === 'bullish'
  const isBullish = signal.sentiment === 'bullish' || signal.change > 0
  const urgency = signal.confidence >= 8 ? 'high' : signal.confidence >= 6 ? 'medium' : 'low'
  const urgencyColor = urgency === 'high' ? '#ef4444' : urgency === 'medium' ? '#f59e0b' : '#6b7a90'

  return (
    <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px', cursor: 'default', transition: 'border-color .15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(96,165,250,0.3)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 16, fontWeight: 800, color: '#f0f6ff' }}>{signal.symbol}</span>
          <span style={{ background: isBullish ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${isBullish ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 5, padding: '2px 8px', color: isBullish ? '#10b981' : '#ef4444', fontSize: 10, fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>
            {isCall ? '▲ CALL' : '▼ PUT'}
          </span>
          {urgency === 'high' && <span style={{ fontSize: 9, color: urgencyColor, fontFamily: '"DM Mono",monospace', animation: 'pulse 1.5s infinite' }}>⚡ URGENT</span>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: isBullish ? '#10b981' : '#ef4444', fontFamily: '"DM Mono",monospace', fontSize: 14, fontWeight: 700 }}>{fmtPct(signal.changePercent)}</div>
          <div style={{ color: '#3d4e62', fontSize: 10 }}>${fmt(signal.price)}</div>
        </div>
      </div>

      <div style={{ color: '#8b9fc0', fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>{signal.description || signal.reason || 'Technical signal detected'}</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {signal.optionsStrike && <span style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 5, padding: '2px 8px', color: '#a5b4fc', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>${signal.optionsStrike} strike</span>}
        {signal.expiry && <span style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '2px 8px', color: '#6b7a90', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{signal.expiry}</span>}
        {signal.volume && <span style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '2px 8px', color: '#6b7a90', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>Vol: {fmtVol(signal.volume)}</span>}
        {signal.unusualVolume && <span style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 5, padding: '2px 8px', color: '#f59e0b', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>🔥 {signal.unusualVolume}x avg vol</span>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onAddAlert(signal.symbol, signal.price)} style={{ flex: 1, padding: '5px 0', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 6, color: '#60a5fa', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>
          + Set Alert
        </button>
        <button onClick={() => window.location.href = '/app/charts?symbol=' + signal.symbol} style={{ flex: 1, padding: '5px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#6b7a90', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>
          View Chart
        </button>
      </div>
    </div>
  )
}

function AlertRow({ alert, quotes, onDelete }) {
  const quote = quotes[alert.symbol]
  const currentPrice = quote?.price || 0
  const isTriggered = alert.direction === 'above' ? currentPrice >= alert.targetPrice : currentPrice <= alert.targetPrice
  const pctAway = currentPrice && alert.targetPrice ? ((alert.targetPrice - currentPrice) / currentPrice * 100) : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ background: isTriggered ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isTriggered ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 5, padding: '2px 8px', color: isTriggered ? '#10b981' : '#4a5c7a', fontSize: 9, fontFamily: '"DM Mono",monospace', minWidth: 65, textAlign: 'center' }}>
        {isTriggered ? '✓ TRIGGERED' : (alert.direction === 'above' ? '▲ ABOVE' : '▼ BELOW')}
      </div>
      <span style={{ fontFamily: '"DM Mono",monospace', fontWeight: 700, color: '#f0f6ff', minWidth: 55 }}>{alert.symbol}</span>
      <span style={{ color: '#8b9fc0', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>${fmt(alert.targetPrice)}</span>
      <span style={{ color: '#4a5c7a', fontSize: 10 }}>now ${fmt(currentPrice)}</span>
      <span style={{ color: Math.abs(pctAway) < 1 ? '#f59e0b' : '#3d4e62', fontSize: 10, marginLeft: 'auto', fontFamily: '"DM Mono",monospace' }}>{Math.abs(pctAway) < 0.1 ? 'AT TARGET' : fmtPct(pctAway) + ' away'}</span>
      <button onClick={() => onDelete(alert.id)} style={{ background: 'none', border: 'none', color: '#3d4e62', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
    </div>
  )
}

export default function Signals() {
  const [signals, setSignals] = useState([])
  const [alerts, setAlerts] = useState(getAlerts())
  const [quotes, setQuotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('signals')
  const [alertModal, setAlertModal] = useState(null) // {symbol, price}
  const [alertPrice, setAlertPrice] = useState('')
  const [alertDir, setAlertDir] = useState('above')
  const [filter, setFilter] = useState('all')
  const intervalRef = useRef(null)

  useEffect(() => {
    loadSignals()
    const interval = setInterval(refreshPrices, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadSignals() {
    setLoading(true)
    try {
      // Load from Supabase signals table
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/analysis?type=signals', {
        headers: session ? { 'Authorization': 'Bearer ' + session.access_token } : {}
      })
      if (r.ok) {
        const d = await r.json()
        setSignals(d.signals || d || [])
      }
    } catch (e) {
      // Fallback: generate signals from setup_records
      const { data } = await supabase.from('setup_records').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(20)
      if (data) {
        setSignals(data.map(s => ({
          id: s.id, symbol: s.symbol, type: s.bias === 'bullish' ? 'call' : 'put',
          sentiment: s.bias, price: s.price_at_generation, changePercent: 0,
          description: s.setup_type, confidence: s.confidence,
          optionsStrike: s.options_strike, expiry: s.options_expiry,
          frameworks: s.frameworks, created_at: s.created_at
        })))
      }
    }
    setLoading(false)
    await refreshPrices()
  }

  async function refreshPrices() {
    const allSymbols = [...new Set([...signals.map(s => s.symbol), ...alerts.map(a => a.symbol)])]
    if (!allSymbols.length) return
    try {
      const r = await fetch('/api/market?type=quotes&symbols=' + allSymbols.join(','))
      if (r.ok) setQuotes(await r.json())
    } catch (e) {}
  }

  function addAlert(symbol, currentPrice) {
    setAlertModal({ symbol, price: currentPrice })
    setAlertPrice(currentPrice?.toFixed(2) || '')
    setAlertDir('above')
  }

  function confirmAlert() {
    if (!alertModal || !alertPrice) return
    const newAlert = { id: Date.now(), symbol: alertModal.symbol, targetPrice: parseFloat(alertPrice), direction: alertDir, created: Date.now() }
    const updated = [...alerts, newAlert]
    setAlerts(updated)
    saveAlerts(updated)
    setAlertModal(null)
  }

  function deleteAlert(id) {
    const updated = alerts.filter(a => a.id !== id)
    setAlerts(updated)
    saveAlerts(updated)
  }

  const filtered = filter === 'all' ? signals : signals.filter(s => filter === 'bullish' ? s.sentiment === 'bullish' : s.sentiment === 'bearish')
  const tabStyle = (t) => ({ padding: '6px 14px', background: activeTab === t ? 'rgba(37,99,235,0.12)' : 'none', border: '1px solid ' + (activeTab === t ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 6, color: activeTab === t ? '#60a5fa' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' })

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 3px' }}>⚡ Signals & Alerts</h1>
          <div style={{ color: '#3d4e62', fontSize: 11 }}>Live signals from open setups · Set price alerts · Track unusual activity</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all','bullish','bearish'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ ...tabStyle(f), background: filter === f ? (f === 'bullish' ? 'rgba(16,185,129,0.1)' : f === 'bearish' ? 'rgba(239,68,68,0.1)' : 'rgba(37,99,235,0.12)') : 'none', border: `1px solid ${filter === f ? (f === 'bullish' ? 'rgba(16,185,129,0.3)' : f === 'bearish' ? 'rgba(239,68,68,0.3)' : 'rgba(37,99,235,0.3)') : 'rgba(255,255,255,0.06)'}`, color: filter === f ? (f === 'bullish' ? '#10b981' : f === 'bearish' ? '#ef4444' : '#60a5fa') : '#4a5c7a' }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['signals', `Signals (${signals.length})`], ['alerts', `Alerts (${alerts.length})`]].map(([t, label]) => (
          <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{label}</button>
        ))}
      </div>

      {activeTab === 'signals' && (
        loading ? (
          <div style={{ textAlign: 'center', color: '#4a5c7a', padding: 40 }}>Loading signals...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#3d4e62', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
            <div style={{ fontSize: 14 }}>No signals yet — signals populate from Top Setups scans</div>
            <button onClick={() => window.location.href='/app/setups'} style={{ marginTop: 12, padding: '8px 16px', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8, color: '#60a5fa', fontSize: 11, cursor: 'pointer' }}>→ Go to Top Setups</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
            {filtered.map((s, i) => <SignalCard key={s.id || i} signal={s} onAddAlert={addAlert} />)}
          </div>
        )
      )}

      {activeTab === 'alerts' && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em' }}>PRICE ALERTS ({alerts.length})</div>
            <button onClick={() => setAlertModal({ symbol: '', price: '' })} style={{ padding: '4px 10px', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 6, color: '#60a5fa', fontSize: 10, cursor: 'pointer' }}>+ New Alert</button>
          </div>
          {alerts.length === 0 ? (
            <div style={{ color: '#3d4e62', fontSize: 12, textAlign: 'center', padding: 24 }}>No alerts set — click "+ New Alert" or "Set Alert" on any signal card</div>
          ) : (
            alerts.map(a => <AlertRow key={a.id} alert={a} quotes={quotes} onDelete={deleteAlert} />)
          )}
        </div>
      )}

      {/* Alert modal */}
      {alertModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: 320 }}>
            <div style={{ fontFamily: '"Syne",sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Set Price Alert</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: '#4a5c7a', fontSize: 11, marginBottom: 6 }}>Symbol</div>
              <input value={alertModal.symbol} onChange={e => setAlertModal(m => ({...m, symbol: e.target.value.toUpperCase()}))} placeholder="AAPL" style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f6ff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: '#4a5c7a', fontSize: 11, marginBottom: 6 }}>Alert when price is</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['above','below'].map(d => (
                  <button key={d} onClick={() => setAlertDir(d)} style={{ flex: 1, padding: '8px', background: alertDir === d ? 'rgba(37,99,235,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${alertDir === d ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, color: alertDir === d ? '#60a5fa' : '#6b7a90', fontSize: 11, cursor: 'pointer' }}>{d === 'above' ? '▲ Above' : '▼ Below'}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: '#4a5c7a', fontSize: 11, marginBottom: 6 }}>Target Price ($)</div>
              <input type="number" value={alertPrice} onChange={e => setAlertPrice(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f6ff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setAlertModal(null)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#6b7a90', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmAlert} style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Set Alert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
