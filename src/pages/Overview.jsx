import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useMarket } from '../lib/useMarket.jsx'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

// Animated counter hook
function useCounter(target, duration = 1200) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!target && target !== 0) return
    const start = Date.now()
    const from = 0
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setVal(from + (target - from) * eased)
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target])
  return val
}

// Sparkline component
function Sparkline({ data = [], color = '#10b981', width = 80, height = 32 }) {
  if (!data.length) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - ((v - min) / range) * (height - 4) - 2
  ])
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = path + ` L${width},${height} L0,${height} Z`
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace('#','')})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.length > 0 && (
        <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.5" fill={color}/>
      )}
    </svg>
  )
}

// Mini donut gauge
function Gauge({ value = 0, max = 100, color = '#10b981', size = 56 }) {
  const r = 20, c = 2 * Math.PI * r
  const pct = Math.min(value / max, 1)
  return (
    <svg width={size} height={size} viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round" transform="rotate(-90 28 28)"
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)' }}/>
      <text x="28" y="33" textAnchor="middle" fill={color} fontSize="11" fontWeight="700" fontFamily="DM Mono">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

// Stat card with animation
function StatCard({ label, value, sub, color = '#e2e8f0', icon, trend, sparkData }) {
  const num = parseFloat(value) || 0
  const animated = useCounter(num)
  const isFloat = String(value).includes('.')
  const displayVal = typeof value === 'string' && isNaN(parseFloat(value))
    ? value
    : isFloat ? animated.toFixed(2) : Math.round(animated).toLocaleString()

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0d1420 0%, #0a0f1a 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: '20px 22px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'border-color 0.2s, transform 0.2s',
      cursor: 'default',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at 80% 20%, ${color}18, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      </div>
      <div style={{ color, fontSize: 26, fontWeight: 800, fontFamily: '"Syne",sans-serif', lineHeight: 1, marginBottom: 6 }}>
        {displayVal}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        {sub && <div style={{ color: '#4a5c7a', fontSize: 11 }}>{sub}</div>}
        {sparkData && <Sparkline data={sparkData} color={color} width={70} height={28} />}
        {trend !== undefined && (
          <div style={{ color: trend >= 0 ? '#10b981' : '#ef4444', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  )
}

// Market ticker row with mini bar
function TickerRow({ q, onClick }) {
  const pct = q.effectiveChangePct ?? q.changePct ?? 0
  const price = q.effectivePrice ?? q.price
  const isPos = pct >= 0
  const barW = Math.min(Math.abs(pct) * 8, 60)

  return (
    <tr
      onClick={() => onClick?.(q.symbol)}
      style={{ cursor: 'pointer', transition: 'background 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: isPos ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: isPos ? '#10b981' : '#ef4444',
            fontFamily: '"DM Mono",monospace',
          }}>
            {q.symbol?.substring(0, 2)}
          </div>
          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, fontFamily: '"DM Mono",monospace' }}>{q.symbol}</span>
        </div>
      </td>
      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13, fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
        ${parseFloat(price || 0).toFixed(2)}
      </td>
      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            padding: '3px 8px', borderRadius: 6,
            background: isPos ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            color: isPos ? '#10b981' : '#ef4444',
            fontSize: 12, fontFamily: '"DM Mono",monospace', fontWeight: 600,
          }}>
            {isPos ? '+' : ''}{parseFloat(pct).toFixed(2)}%
          </div>
          <div style={{ width: barW, height: 3, borderRadius: 2, background: isPos ? '#10b981' : '#ef4444', opacity: 0.6 }} />
        </div>
      </td>
      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#4a5c7a', fontSize: 12, fontFamily: '"DM Mono",monospace' }}>
        {q.volume ? (q.volume / 1e6).toFixed(1) + 'M' : '—'}
      </td>
      <td style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{
          padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
          fontFamily: '"DM Mono",monospace', letterSpacing: '0.05em',
          color: q.session === 'regular' ? '#10b981' : q.session === 'premarket' || q.session === 'afterhours' ? '#f59e0b' : '#4a5c7a',
          background: q.session === 'regular' ? 'rgba(16,185,129,0.1)' : q.session === 'premarket' || q.session === 'afterhours' ? 'rgba(245,158,11,0.1)' : 'rgba(74,92,122,0.08)',
        }}>
          {q.session === 'regular' ? '● LIVE' : q.session === 'premarket' ? '◐ PRE' : q.session === 'afterhours' ? '◐ AH' : '○ CLOSED'}
        </span>
      </td>
    </tr>
  )
}

export default function Overview() {
  const { user } = useAuth()
  const { quotes, getQuote, session, loading: mktLoading, lastUpdate } = useMarket()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [journal, setJournal] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeStr, setTimeStr] = useState('')
  const [greeting, setGreeting] = useState('')
  const [pnlHistory, setPnlHistory] = useState([])

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
    const tick = () => setTimeStr(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!user) return
    Promise.all([loadProfile(), loadJournal()]).finally(() => setLoading(false))
  }, [user])

  async function loadProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data)
  }

  async function loadJournal() {
    try {
      const { data } = await supabase
        .from('journal_entries')
        .select('pnl, status, ticker, strategy, created_at, entry_price, exit_price')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (data) {
        setJournal(data)
        // Build cumulative P&L history for sparkline
        const closed = data.filter(j => j.status === 'closed').reverse()
        let running = 0
        setPnlHistory(closed.map(j => { running += parseFloat(j.pnl || 0); return running }))
      }
    } catch(e) {}
  }

  // Market calculations
  const quoteList = Object.values(quotes)
  const upCount = quoteList.filter(q => (q.changePct || 0) > 0).length
  const downCount = quoteList.filter(q => (q.changePct || 0) < 0).length
  const spy = getQuote('SPY')
  const qqq = getQuote('QQQ')
  const vix = getQuote('VIX')
  const marketMood = upCount > downCount ? 'Bullish' : upCount < downCount ? 'Bearish' : 'Mixed'
  const moodColor = upCount > downCount ? '#10b981' : upCount < downCount ? '#ef4444' : '#f59e0b'
  const sessLabel = { regular: 'MARKET OPEN', premarket: 'PRE-MARKET', afterhours: 'AFTER HOURS', closed: 'MARKET CLOSED' }[session] || 'CLOSED'
  const sessColor = { regular: '#10b981', premarket: '#f59e0b', afterhours: '#8b5cf6', closed: '#4a5c7a' }[session] || '#4a5c7a'

  // Journal stats
  const closed = journal.filter(j => j.status === 'closed')
  const open = journal.filter(j => j.status === 'open')
  const totalPnl = closed.reduce((s, j) => s + parseFloat(j.pnl || 0), 0)
  const wins = closed.filter(j => parseFloat(j.pnl || 0) > 0)
  const losses = closed.filter(j => parseFloat(j.pnl || 0) < 0)
  const winRate = closed.length ? Math.round(wins.length / closed.length * 100) : 0
  const avgWin = wins.length ? wins.reduce((s, j) => s + parseFloat(j.pnl), 0) / wins.length : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, j) => s + parseFloat(j.pnl), 0) / losses.length) : 0
  const profitFactor = avgLoss ? (avgWin / avgLoss).toFixed(2) : '∞'
  const name = user?.email?.split('@')[0] || 'trader'

  // Streak calculation
  let streak = 0
  for (const j of closed) {
    if (parseFloat(j.pnl || 0) > 0) streak++
    else break
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 32, animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⚡</div>
      <div style={{ color: '#4a5c7a', fontSize: 12, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em' }}>LOADING DASHBOARD</div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', fontFamily: '"DM Sans",sans-serif', color: '#e2e8f0', maxWidth: 1200 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.3)}}
        .ov-row:hover{background:rgba(255,255,255,0.02)!important}
        .ov-action:hover{opacity:1!important;transform:translateY(-2px)!important}
        .ov-section{animation:fadeUp 0.4s ease forwards}
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ color: '#4a5c7a', fontSize: 11, fontFamily: '"DM Mono",monospace', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>
            {greeting}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: '"Syne",sans-serif', color: '#f0f4ff', marginBottom: 4 }}>
            {name.charAt(0).toUpperCase() + name.slice(1)} ⚡
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
              background: sessColor + '18', border: `1px solid ${sessColor}40`,
              borderRadius: 100, fontSize: 10, fontFamily: '"DM Mono",monospace',
              letterSpacing: '0.1em', color: sessColor, fontWeight: 600,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: sessColor, display: 'inline-block', animation: session === 'regular' ? 'pulse-dot 2s infinite' : 'none' }} />
              {sessLabel}
            </span>
            {lastUpdate && (
              <span style={{ color: '#2d3d50', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>
                Last sync {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {streak > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 100, fontSize: 10, fontFamily: '"DM Mono",monospace', color: '#fbbf24', fontWeight: 600 }}>
                🔥 {streak} trade win streak
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: '"DM Mono",monospace', color: '#f0f4ff', letterSpacing: '0.05em' }}>{timeStr}</div>
          <div style={{ color: '#4a5c7a', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div className="ov-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 28, animationDelay: '0.05s' }}>
        <StatCard
          label="Market Mood"
          value={marketMood}
          sub={`${upCount} advancing · ${downCount} declining`}
          color={moodColor}
          icon={upCount > downCount ? '📈' : upCount < downCount ? '📉' : '⚖️'}
        />
        <StatCard
          label="SPY"
          value={spy ? `$${spy.price?.toFixed(2)}` : '—'}
          sub={spy ? `${spy.changePct >= 0 ? '+' : ''}${spy.changePct?.toFixed(2)}% today` : 'Loading...'}
          color={spy ? (spy.changePct >= 0 ? '#10b981' : '#ef4444') : '#4a5c7a'}
          icon="🇺🇸"
          trend={spy?.changePct}
        />
        <StatCard
          label="Total P&L"
          value={totalPnl.toFixed(2)}
          sub={`${closed.length} closed trades`}
          color={totalPnl >= 0 ? '#10b981' : '#ef4444'}
          icon="💰"
          sparkData={pnlHistory.slice(-20)}
        />
        <StatCard
          label="Win Rate"
          value={winRate}
          sub={`${wins.length}W · ${losses.length}L · ${open.length} open`}
          color={winRate >= 60 ? '#10b981' : winRate >= 45 ? '#f59e0b' : '#ef4444'}
          icon="🎯"
        />
        <StatCard
          label="Profit Factor"
          value={profitFactor}
          sub={`Avg W $${avgWin.toFixed(0)} · Avg L $${avgLoss.toFixed(0)}`}
          color="#8b5cf6"
          icon="⚡"
        />
        <StatCard
          label="QQQ"
          value={qqq ? `$${qqq.price?.toFixed(2)}` : '—'}
          sub={qqq ? `${qqq.changePct >= 0 ? '+' : ''}${qqq.changePct?.toFixed(2)}%` : 'Loading...'}
          color={qqq ? (qqq.changePct >= 0 ? '#10b981' : '#ef4444') : '#4a5c7a'}
          icon="💻"
          trend={qqq?.changePct}
        />
      </div>

      {/* ── Market Snapshot ── */}
      <div className="ov-section" style={{ background: 'linear-gradient(135deg, #0d1420, #0a0f1a)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '22px 0', marginBottom: 20, animationDelay: '0.1s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: '"Syne",sans-serif', color: '#f0f4ff' }}>Market Snapshot</div>
            {session === 'regular' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 100, fontSize: 9, color: '#10b981', fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
                LIVE
              </span>
            )}
          </div>
          <button onClick={() => navigate('/app/signals')} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace', letterSpacing: '0.05em' }}>
            Full analysis →
          </button>
        </div>

        {mktLoading || !quoteList.length ? (
          <div style={{ padding: '20px 22px', color: '#4a5c7a', fontSize: 12, fontFamily: '"DM Mono",monospace' }}>
            <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block', marginRight: 8 }}>⚡</span>
            Fetching live market data...
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Symbol', 'Price', 'Change', 'Volume', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#2d3d50', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.12em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quoteList.map(q => <TickerRow key={q.symbol} q={q} onClick={(sym) => navigate('/app/signals')} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Bottom row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Recent trades */}
        <div className="ov-section" style={{ background: 'linear-gradient(135deg, #0d1420, #0a0f1a)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22, animationDelay: '0.15s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: '"Syne",sans-serif', color: '#f0f4ff' }}>Recent Trades</div>
            <button onClick={() => navigate('/app/journal')} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 11, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>View all →</button>
          </div>
          {journal.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#2d3d50', fontSize: 12, fontFamily: '"DM Mono",monospace' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📓</div>
              No trades logged yet
            </div>
          ) : (
            <div>
              {journal.slice(0, 6).map((j, i) => {
                const pnl = parseFloat(j.pnl || 0)
                const isWin = pnl > 0
                const isOpen = j.status === 'open'
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: isOpen ? 'rgba(59,130,246,0.1)' : isWin ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: isOpen ? '#3b82f6' : isWin ? '#10b981' : '#ef4444', fontFamily: '"DM Mono",monospace' }}>
                        {j.ticker?.substring(0, 3)}
                      </div>
                      <div>
                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{j.ticker}</div>
                        <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{j.strategy || 'Manual'}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: isOpen ? '#3b82f6' : isWin ? '#10b981' : '#ef4444', fontSize: 13, fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
                        {isOpen ? 'OPEN' : `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`}
                      </div>
                      <div style={{ color: '#2d3d50', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{j.created_at?.split('T')[0]}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Performance ring + quick stats */}
        <div className="ov-section" style={{ background: 'linear-gradient(135deg, #0d1420, #0a0f1a)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22, animationDelay: '0.2s' }}>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: '"Syne",sans-serif', color: '#f0f4ff', marginBottom: 20 }}>Performance</div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24 }}>
            <Gauge value={winRate} max={100} color={winRate >= 60 ? '#10b981' : winRate >= 45 ? '#f59e0b' : '#ef4444'} size={72} />
            <div>
              <div style={{ color: winRate >= 60 ? '#10b981' : winRate >= 45 ? '#f59e0b' : '#ef4444', fontSize: 28, fontWeight: 800, fontFamily: '"Syne",sans-serif' }}>{winRate}%</div>
              <div style={{ color: '#4a5c7a', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>win rate</div>
              {streak > 0 && <div style={{ color: '#fbbf24', fontSize: 11, fontFamily: '"DM Mono",monospace', marginTop: 4 }}>🔥 {streak} in a row</div>}
            </div>
            {pnlHistory.length > 2 && (
              <div style={{ flex: 1 }}>
                <Sparkline data={pnlHistory} color={totalPnl >= 0 ? '#10b981' : '#ef4444'} width={120} height={50} />
                <div style={{ color: '#4a5c7a', fontSize: 9, fontFamily: '"DM Mono",monospace', marginTop: 4, textAlign: 'center', letterSpacing: '0.08em' }}>EQUITY CURVE</div>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Profit Factor', val: profitFactor, color: '#8b5cf6' },
              { label: 'Avg Win', val: `$${avgWin.toFixed(0)}`, color: '#10b981' },
              { label: 'Avg Loss', val: `$${avgLoss.toFixed(0)}`, color: '#ef4444' },
              { label: 'Total Trades', val: closed.length, color: '#3b82f6' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ color: '#4a5c7a', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ color, fontSize: 17, fontWeight: 700, fontFamily: '"DM Mono",monospace' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="ov-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, animationDelay: '0.25s' }}>
        {[
          { label: 'Signals', sub: 'Live feed', href: '/app/signals', icon: '📡', color: '#2563eb', grad: 'rgba(37,99,235,0.12)' },
          { label: 'Journal', sub: 'Log trades', href: '/app/journal', icon: '📓', color: '#10b981', grad: 'rgba(16,185,129,0.12)' },
          { label: 'Portfolio', sub: 'P&L tracker', href: '/app/portfolio', icon: '💼', color: '#8b5cf6', grad: 'rgba(139,92,246,0.12)' },
          { label: 'AI Coach', sub: 'Get insight', href: '/app/journal', icon: '🤖', color: '#f59e0b', grad: 'rgba(245,158,11,0.12)' },
        ].map(({ label, sub, href, icon, color, grad }) => (
          <button
            key={href}
            className="ov-action"
            onClick={() => navigate(href)}
            style={{ background: grad, border: `1px solid ${color}30`, borderRadius: 12, padding: '16px 18px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', opacity: 0.92 }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
            <div style={{ color: '#f0f4ff', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{label}</div>
            <div style={{ color: '#4a5c7a', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>{sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
