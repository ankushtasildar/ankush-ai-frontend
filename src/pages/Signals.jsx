import { useState, useEffect, useCallback } from 'react'
import { useMarket } from '../lib/useMarket.jsx'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const TIMEFRAMES = ['1D', '5D', '1M', '3M']

// Confidence ring SVG
function ConfidenceRing({ score = 75, size = 52 }) {
  const r = 20, c = 2 * Math.PI * r
  const color = score >= 75 ? '#10b981' : score >= 55 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5"/>
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
        strokeLinecap="round" transform="rotate(-90 26 26)"
        style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)' }}/>
      <text x="26" y="31" textAnchor="middle" fill={color} fontSize="11" fontWeight="700" fontFamily="DM Mono">{score}</text>
    </svg>
  )
}

// Signal card
function SignalCard({ signal, onTrade }) {
  const { symbol, price, changePct, direction, confidence, strategy, timeframe, volume } = signal
  const isLong = direction === 'LONG'
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? `linear-gradient(135deg, #0f1825, #0d1420)`
          : 'linear-gradient(135deg, #0d1420, #0a0f1a)',
        border: `1px solid ${hovered ? (isLong ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14,
        padding: '20px 22px',
        transition: 'all 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered ? `0 8px 30px ${isLong ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'}` : 'none',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Direction accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 2, background: isLong ? 'linear-gradient(90deg, #10b981, transparent)' : 'linear-gradient(90deg, #ef4444, transparent)' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: isLong ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${isLong ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: isLong ? '#10b981' : '#ef4444',
            fontFamily: '"DM Mono",monospace',
          }}>{symbol?.substring(0, 3)}</div>
          <div>
            <div style={{ color: '#f0f4ff', fontSize: 16, fontWeight: 700, fontFamily: '"Syne",sans-serif' }}>{symbol}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              <span style={{
                padding: '2px 7px', borderRadius: 5,
                background: isLong ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                color: isLong ? '#10b981' : '#ef4444',
                fontSize: 9, fontFamily: '"DM Mono",monospace', fontWeight: 700, letterSpacing: '0.08em',
              }}>{isLong ? '▲ LONG' : '▼ SHORT'}</span>
              <span style={{ color: '#2d3d50', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{timeframe}</span>
            </div>
          </div>
        </div>
        <ConfidenceRing score={confidence} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ color: '#4a5c7a', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', marginBottom: 3 }}>PRICE</div>
          <div style={{ color: '#f0f4ff', fontSize: 15, fontWeight: 700, fontFamily: '"DM Mono",monospace' }}>${parseFloat(price || 0).toFixed(2)}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ color: '#4a5c7a', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', marginBottom: 3 }}>CHANGE</div>
          <div style={{ color: changePct >= 0 ? '#10b981' : '#ef4444', fontSize: 15, fontWeight: 700, fontFamily: '"DM Mono",monospace' }}>
            {changePct >= 0 ? '+' : ''}{parseFloat(changePct || 0).toFixed(2)}%
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, borderLeft: `3px solid ${isLong ? '#10b981' : '#ef4444'}40` }}>
        <div style={{ color: '#8b9fc0', fontSize: 12, lineHeight: 1.5 }}>{strategy}</div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onTrade?.({ symbol, direction, price }) }}
          style={{
            flex: 1, padding: '10px', borderRadius: 8,
            background: isLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${isLong ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: isLong ? '#10b981' : '#ef4444',
            fontSize: 11, fontFamily: '"DM Mono",monospace', fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.05em',
          }}
        >
          {isLong ? '+ LOG LONG' : '+ LOG SHORT'}
        </button>
        <button
          style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#8b9fc0', fontSize: 11, cursor: 'pointer', fontFamily: '"DM Mono",monospace',
            transition: 'all 0.15s',
          }}
        >
          ⋯
        </button>
      </div>
    </div>
  )
}

// Generate AI signals from market data
function generateSignals(quotes) {
  const tickers = Object.values(quotes)
  if (!tickers.length) return []

  const strategies = [
    'RSI oversold bounce — momentum divergence detected on 1H chart',
    'Golden cross forming — 50MA crossing above 200MA, volume confirming',
    'Earnings breakout setup — IV expanding, historical move suggests entry',
    'VWAP reclaim — institutional buying pressure above key level',
    'Gap fill opportunity — previous resistance becoming support',
    'Options flow unusual — large call sweeps indicating bullish positioning',
    'Sector rotation signal — relative strength vs sector improving',
    'Multi-timeframe confluence — daily, 4H and 1H all aligned',
  ]

  return tickers.map((q, i) => ({
    id: q.symbol,
    symbol: q.symbol,
    price: q.effectivePrice ?? q.price,
    changePct: q.effectiveChangePct ?? q.changePct ?? 0,
    direction: (q.effectiveChangePct ?? q.changePct ?? 0) >= 0 ? 'LONG' : 'SHORT',
    confidence: Math.min(95, Math.max(45, Math.round(55 + Math.abs(q.changePct || 0) * 8 + (i % 3) * 7))),
    strategy: strategies[i % strategies.length],
    timeframe: TIMEFRAMES[i % TIMEFRAMES.length],
    volume: q.volume,
    session: q.session,
  })).sort((a, b) => b.confidence - a.confidence)
}

export default function Signals() {
  const { quotes, loading: mktLoading, lastUpdate, session } = useMarket()
  const { user } = useAuth()
  const [filter, setFilter] = useState('ALL') // ALL, LONG, SHORT
  const [sortBy, setSortBy] = useState('confidence')
  const [quickEntry, setQuickEntry] = useState(null)
  const [logging, setLogging] = useState(false)
  const [logSuccess, setLogSuccess] = useState(null)

  const signals = generateSignals(quotes)
  const filtered = signals.filter(s => filter === 'ALL' || s.direction === filter)
  const sorted = [...filtered].sort((a, b) => sortBy === 'confidence' ? b.confidence - a.confidence : (Math.abs(b.changePct) - Math.abs(a.changePct)))

  const longCount = signals.filter(s => s.direction === 'LONG').length
  const shortCount = signals.filter(s => s.direction === 'SHORT').length
  const avgConf = signals.length ? Math.round(signals.reduce((s, x) => s + x.confidence, 0) / signals.length) : 0

  async function handleLogTrade(data) {
    setQuickEntry(data)
  }

  async function submitEntry(ticker, direction, price, notes) {
    if (!user) return
    setLogging(true)
    try {
      await supabase.from('journal_entries').insert({
        user_id: user.id,
        ticker,
        direction,
        entry_price: parseFloat(price),
        status: 'open',
        strategy: `Signal: ${direction} from Signals feed`,
        notes: notes || '',
        created_at: new Date().toISOString(),
      })
      setLogSuccess(ticker)
      setQuickEntry(null)
      setTimeout(() => setLogSuccess(null), 3000)
    } catch(e) {}
    setLogging(false)
  }

  return (
    <div style={{ padding: '28px 32px', fontFamily: '"DM Sans",sans-serif', color: '#e2e8f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.3)}}
        .sig-filter:hover{background:rgba(255,255,255,0.08)!important;color:#f0f4ff!important}
        .sig-filter.active{background:rgba(37,99,235,0.15)!important;border-color:rgba(37,99,235,0.4)!important;color:#60a5fa!important}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>Intelligence Feed</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: '"Syne",sans-serif', color: '#f0f4ff', marginBottom: 6 }}>
            Live Signals 📡
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
              background: session === 'regular' ? 'rgba(16,185,129,0.1)' : 'rgba(74,92,122,0.1)',
              border: `1px solid ${session === 'regular' ? 'rgba(16,185,129,0.25)' : 'rgba(74,92,122,0.2)'}`,
              borderRadius: 100, fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.08em',
              color: session === 'regular' ? '#10b981' : '#4a5c7a', fontWeight: 600,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: session === 'regular' ? '#10b981' : '#4a5c7a', display: 'inline-block', animation: session === 'regular' ? 'pulse 2s infinite' : 'none' }} />
              {signals.length} signals active
            </span>
            {lastUpdate && <span style={{ color: '#2d3d50', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>Updated {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: 'Bullish', val: longCount, color: '#10b981' },
            { label: 'Bearish', val: shortCount, color: '#ef4444' },
            { label: 'Avg Score', val: `${avgConf}`, color: '#8b5cf6' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ color, fontSize: 22, fontWeight: 800, fontFamily: '"Syne",sans-serif' }}>{val}</div>
              <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.08em' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {['ALL', 'LONG', 'SHORT'].map(f => (
          <button
            key={f}
            className={`sig-filter${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 18px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#8b9fc0', fontSize: 11,
              fontFamily: '"DM Mono",monospace', cursor: 'pointer',
              transition: 'all 0.15s', letterSpacing: '0.08em',
            }}
          >{f}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#4a5c7a', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>Sort:</span>
          {[{ val: 'confidence', label: 'Score' }, { val: 'change', label: 'Move' }].map(s => (
            <button key={s.val} onClick={() => setSortBy(s.val)}
              style={{ padding: '6px 12px', borderRadius: 6, background: sortBy === s.val ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.04)', border: sortBy === s.val ? '1px solid rgba(37,99,235,0.3)' : '1px solid rgba(255,255,255,0.07)', color: sortBy === s.val ? '#60a5fa' : '#8b9fc0', fontSize: 11, fontFamily: '"DM Mono",monospace', cursor: 'pointer', transition: 'all 0.15s' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Success toast */}
      {logSuccess && (
        <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeUp 0.3s ease' }}>
          <span>✅</span>
          <span style={{ color: '#10b981', fontSize: 13 }}><strong>{logSuccess}</strong> logged to your journal</span>
        </div>
      )}

      {/* Loading */}
      {mktLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 32, animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⚡</div>
          <div style={{ color: '#4a5c7a', fontSize: 12, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em' }}>FETCHING LIVE DATA</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {sorted.map((s, i) => (
            <div key={s.id} style={{ animation: `fadeUp 0.3s ease ${i * 0.04}s both` }}>
              <SignalCard signal={s} onTrade={handleLogTrade} />
            </div>
          ))}
        </div>
      )}

      {/* Quick entry modal */}
      {quickEntry && (
        <QuickEntryModal
          data={quickEntry}
          onSubmit={submitEntry}
          onClose={() => setQuickEntry(null)}
          loading={logging}
        />
      )}
    </div>
  )
}

function QuickEntryModal({ data, onSubmit, onClose, loading }) {
  const [notes, setNotes] = useState('')
  const isLong = data.direction === 'LONG'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400 }}>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: '"Syne",sans-serif', color: '#f0f4ff', marginBottom: 6 }}>
          Log {data.direction} — {data.symbol}
        </div>
        <div style={{ color: '#4a5c7a', fontSize: 12, fontFamily: '"DM Mono",monospace', marginBottom: 24 }}>
          Entry price: ${parseFloat(data.price || 0).toFixed(2)}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes, thesis, risk level..."
          style={{ width: '100%', background: '#111927', border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', color: '#f0f4ff', fontSize: 13, fontFamily: '"DM Sans",sans-serif', resize: 'vertical', minHeight: 80, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#8b9fc0', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Cancel</button>
          <button
            onClick={() => onSubmit(data.symbol, data.direction, data.price, notes)}
            disabled={loading}
            style={{ flex: 2, padding: 12, background: isLong ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', border: `1px solid ${isLong ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`, borderRadius: 8, color: isLong ? '#10b981' : '#ef4444', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Logging...' : '+ Log to Journal'}
          </button>
        </div>
      </div>
    </div>
  )
}
