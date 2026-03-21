import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Style constants ──────────────────────────────────────────────────────────
const BIAS = {
  bullish: { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', label: '▲ BULLISH' },
  bearish: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', label: '▼ BEARISH' },
  neutral: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', label: '◆ NEUTRAL' },
}
const FWCOLS = {
  breakout:'#3b82f6', momentum:'#8b5cf6', earnings:'#f59e0b', fibonacci:'#10b981',
  macro:'#06b6d4', sector:'#ec4899', sympathy:'#f97316', technical:'#6366f1',
  value:'#84cc16', options:'#a78bfa', the_strat:'#fb923c', supply_demand:'#ef4444'
}
const SORT_OPTIONS = ['Confidence', 'Urgency', 'R/R Ratio', 'Analyst Agreement']

// ─── Baseline setups — real dollar amounts, full analysis in keyFactor ────────
const BASELINE = []
// Baseline intentionally empty — we never show stale hardcoded prices.
// The page shows a "Scan initializing" state until live data arrives.


// ─── Mini sparkline ───────────────────────────────────────────────────────────
function Spark({ data, color = '#10b981', width = 64, height = 24 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />
  const mn = Math.min(...data), mx = Math.max(...data), range = mx - mn || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2
    const y = height - 2 - ((v - mn) / range) * (height - 4)
    return `${x},${y}`
  }).join(' ')
  const last = data[data.length - 1], prev = data[0]
  const dotX = (width - 4) + 2, dotY = height - 2 - ((last - mn) / range) * (height - 4)
  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts + ` ${dotX},${height} 2,${height}`} fill="url(#sg)" stroke="none" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={dotX} cy={dotY} r="2.5" fill={color} />
    </svg>
  )
}

// ─── Confidence bar ───────────────────────────────────────────────────────────
function ConfBar({ score }) {
  const c = score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: score * 10 + '%', height: '100%', background: c, borderRadius: 2, transition: 'width 1.2s ease' }} />
      </div>
      <span style={{ color: c, fontSize: 11, fontFamily: '"DM Mono",monospace', fontWeight: 700, minWidth: 16 }}>{score}</span>
    </div>
  )
}

// ─── Analyst agreement ────────────────────────────────────────────────────────
function AgreementBar({ score }) {
  const c = score >= 75 ? '#10b981' : score >= 55 ? '#f59e0b' : '#ef4444'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', letterSpacing: '.05em' }}>ANALYST CONSENSUS</span>
        <span style={{ color: c, fontSize: 9, fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>{score}%</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: score + '%', height: '100%', background: c, borderRadius: 2, transition: 'width 1.5s ease' }} />
      </div>
    </div>
  )
}

// ─── Market regime banner ─────────────────────────────────────────────────────
function MarketRegime({ ctx }) {
  if (!ctx) return null
  const { spyRsi, spyTrend, spyPrice } = ctx
  const isOB = spyRsi > 70, isOS = spyRsi < 30
  const isBull = spyTrend === 'bullish_stacked', isBear = spyTrend === 'bearish_stacked'
  const regime = isOB ? 'OVERBOUGHT — size down, avoid chasing' : isOS ? 'OVERSOLD — watch for bounce setups' : isBull ? 'TRENDING UP — favor calls on all dips' : isBear ? 'TRENDING DOWN — favor puts on all rips' : 'CONSOLIDATING — trade setups selectively'
  const regimeColor = isOB ? '#f59e0b' : isOS ? '#10b981' : isBull ? '#10b981' : isBear ? '#ef4444' : '#8b9fc0'
  const regimeBg = isOB ? 'rgba(245,158,11,0.06)' : isOS ? 'rgba(16,185,129,0.06)' : isBull ? 'rgba(16,185,129,0.06)' : isBear ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)'
  const regimeBorder = isOB ? 'rgba(245,158,11,0.15)' : isOS ? 'rgba(16,185,129,0.15)' : isBull ? 'rgba(16,185,129,0.15)' : isBear ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)'
  return (
    <div style={{ background: regimeBg, border: '1px solid ' + regimeBorder, borderRadius: 10, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 9, color: '#3d4e62', letterSpacing: '.08em' }}>MARKET REGIME</span>
        <span style={{ color: regimeColor, fontSize: 12, fontWeight: 700 }}>{regime}</span>
      </div>
      <div style={{ display: 'flex', gap: 18 }}>
        {[
          spyPrice && { l: 'SPY', v: '$' + spyPrice?.toFixed(2), c: '#e2e8f0' },
          spyRsi && { l: 'RSI(14)', v: spyRsi, c: isOB ? '#f59e0b' : isOS ? '#10b981' : '#8b9fc0' },
          spyTrend && { l: 'EMA TREND', v: spyTrend?.replace(/_/g, ' ').toUpperCase(), c: regimeColor },
        ].filter(Boolean).map(({ l, v, c }) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 2 }}>{l}</div>
            <div style={{ color: c, fontSize: 12, fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Setup card ───────────────────────────────────────────────────────────────
function SetupCard({ setup, index, isLive, onChartClick, onWatchlist, isWatchlisted }) {
  const [expanded, setExpanded] = useState(false)
  const b = BIAS[setup.bias] || BIAS.neutral
  const chg = setup.changePct || 0
  const sparkColor = chg >= 0 ? '#10b981' : '#ef4444'

  return (
    <div style={{
      background: '#0b1119',
      border: '1px solid ' + (expanded ? b.border : 'rgba(255,255,255,0.07)'),
      borderRadius: 14, overflow: 'hidden', transition: 'border-color .2s, box-shadow .2s',
      boxShadow: expanded ? '0 0 0 1px ' + b.border + '60' : 'none',
    }}>
      {/* Bias accent line */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, ' + b.color + '80, ' + b.color + '20)' }} />

      <div style={{ padding: '14px 16px 0' }}>
        {/* ── HEADER: ticker + live price + spark ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 9, color: '#2d3d50', minWidth: 14 }}>#{index + 1}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 900, color: '#f0f6ff', lineHeight: 1 }}>{setup.symbol}</span>
                {setup.currentPrice && (
                  <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 15, color: '#dde9ff', fontWeight: 700 }}>
                    ${setup.currentPrice?.toFixed(2)}
                  </span>
                )}
                {setup.changePct !== undefined && (
                  <span style={{ fontSize: 11, color: chg >= 0 ? '#10b981' : '#ef4444', fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
                    {chg >= 0 ? '+' : ''}{chg?.toFixed(2)}%
                  </span>
                )}
              </div>
              <div style={{ color: '#4a5c7a', fontSize: 11, marginTop: 2 }}>{setup.setupType}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            <div style={{ background: b.bg, border: '1px solid ' + b.border, borderRadius: 5, padding: '2px 9px', color: b.color, fontSize: 9, fontFamily: '"DM Mono",monospace', fontWeight: 700, letterSpacing: '.04em' }}>{b.label}</div>
            {setup.spark && <Spark data={setup.spark} color={sparkColor} width={64} height={22} />}
          </div>
        </div>

        {/* ── QUICK BADGES row ── */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
          {setup.rrRatio && <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontFamily: '"DM Mono",monospace', color: '#a5b4fc', fontWeight: 600 }}>R/R {setup.rrRatio}</div>}
          {setup.timeHorizon && <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontFamily: '"DM Mono",monospace', color: '#8b9fc0' }}>⏱ {setup.timeHorizon}</div>}
          {setup.ivRank !== undefined && (
            <div style={{ background: setup.ivRank < 40 ? 'rgba(16,185,129,0.08)' : setup.ivRank > 60 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: '1px solid ' + (setup.ivRank < 40 ? 'rgba(16,185,129,0.2)' : setup.ivRank > 60 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'), borderRadius: 5, padding: '2px 8px', fontSize: 10, fontFamily: '"DM Mono",monospace', color: setup.ivRank < 40 ? '#10b981' : setup.ivRank > 60 ? '#ef4444' : '#f59e0b' }}>
              IV Rank {setup.ivRank}{setup.ivRank < 40 ? ' ✓ cheap' : setup.ivRank > 60 ? ' ⚠ rich' : ''}
            </div>
          )}
          {setup.rsi && <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontFamily: '"DM Mono",monospace', color: setup.rsi > 70 ? '#f59e0b' : setup.rsi < 30 ? '#10b981' : '#6b7a90' }}>RSI {setup.rsi}</div>}
          {setup.sector && <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 5, padding: '2px 8px', fontSize: 9, color: '#3d4e62', fontFamily: '"DM Mono",monospace' }}>{setup.sector}</div>}
          {!isLive && <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 5, padding: '1px 7px', fontSize: 8, color: '#f59e0b', fontFamily: '"DM Mono",monospace' }}>BASELINE</div>}
        </div>

        {/* ── OPTIONS TRADE ── */}
        <div style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.14)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
          <div style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 3, letterSpacing: '.07em' }}>RECOMMENDED TRADE</div>
          <div style={{ color: '#60a5fa', fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{setup.optionsTrade}</div>
        </div>

        {/* ── REAL DOLLAR LEVELS ── the main fix ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          {[
            { label: 'ENTRY ZONE', value: setup.entry, color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.16)' },
            { label: 'TARGET', value: setup.target, color: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.16)' },
            { label: 'STOP LOSS', value: setup.stop, color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.16)' },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} style={{ background: bg, border: '1px solid ' + border, borderRadius: 7, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 4, letterSpacing: '.05em' }}>{label}</div>
              <div style={{ color, fontSize: 12, fontFamily: '"DM Mono",monospace', fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── CONFIDENCE + ANALYST AGREEMENT ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 3, letterSpacing: '.05em' }}>CONFIDENCE</div>
            <ConfBar score={setup.confidence} />
          </div>
          <AgreementBar score={setup.analystAgreement || 70} />
        </div>

        {/* ── FRAMEWORKS ── */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {(setup.frameworks || []).map(fw => (
            <span key={fw} style={{
              background: (FWCOLS[fw] || '#8b5cf6') + '18',
              border: '1px solid ' + (FWCOLS[fw] || '#8b5cf6') + '35',
              color: FWCOLS[fw] || '#8b5cf6',
              borderRadius: 4, padding: '1px 7px',
              fontSize: 9, fontFamily: '"DM Mono",monospace'
            }}>{fw}</span>
          ))}
        </div>
      </div>

      {/* ── EXPANDED ANALYSIS — ALL the reasoning lives here ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px', background: 'rgba(0,0,0,0.18)' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', letterSpacing: '.07em', marginBottom: 6 }}>FULL INSTITUTIONAL ANALYSIS</div>
            <div style={{ color: '#8b9fc0', fontSize: 12, lineHeight: 1.8 }}>{setup.keyFactor}</div>
          </div>
          {/* Trade math breakdown */}
          {setup.rrRatio && (
            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 7, padding: '8px 12px', marginTop: 10 }}>
              <div style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 4 }}>TRADE MATH</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div><span style={{ color: '#4a5c7a', fontSize: 10 }}>Entry: </span><span style={{ color: '#f59e0b', fontFamily: '"DM Mono",monospace', fontSize: 10 }}>{setup.entry}</span></div>
                <div><span style={{ color: '#4a5c7a', fontSize: 10 }}>Target: </span><span style={{ color: '#10b981', fontFamily: '"DM Mono",monospace', fontSize: 10 }}>{setup.target}</span></div>
                <div><span style={{ color: '#4a5c7a', fontSize: 10 }}>Stop: </span><span style={{ color: '#ef4444', fontFamily: '"DM Mono",monospace', fontSize: 10 }}>{setup.stop}</span></div>
                <div><span style={{ color: '#4a5c7a', fontSize: 10 }}>R/R: </span><span style={{ color: '#a5b4fc', fontFamily: '"DM Mono",monospace', fontSize: 10 }}>{setup.rrRatio}</span></div>
                <div><span style={{ color: '#4a5c7a', fontSize: 10 }}>Horizon: </span><span style={{ color: '#8b9fc0', fontFamily: '"DM Mono",monospace', fontSize: 10 }}>{setup.timeHorizon}</span></div>
              </div>
            </div>
          )}
          {(setup.marketCap || setup.volume) && (
            <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
              {setup.marketCap && <div><div style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 1 }}>MARKET CAP</div><div style={{ color: '#6b7a90', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>${(setup.marketCap / 1e9).toFixed(1)}B</div></div>}
              {setup.volume && <div><div style={{ color: '#3d4e62', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 1 }}>VOLUME</div><div style={{ color: '#6b7a90', fontSize: 11, fontFamily: '"DM Mono",monospace' }}>{(setup.volume / 1e6).toFixed(1)}M</div></div>}
            </div>
          )}
        </div>
      )}

      {/* ── ACTION BAR ── */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6 }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ flex: 1, background: expanded ? 'rgba(255,255,255,0.04)' : 'none', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '5px 8px', color: expanded ? '#8b9fc0' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace', transition: 'all .15s' }}
        >
          {expanded ? '▲ Collapse' : '▼ Full Analysis'}
        </button>
        <button
          onClick={() => onChartClick && onChartClick(setup.symbol)}
          title="Open chart"
          style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.18)', borderRadius: 6, padding: '5px 11px', color: '#60a5fa', fontSize: 11, cursor: 'pointer', transition: 'all .15s' }}
        >📈</button>
        <button
          onClick={() => onWatchlist && onWatchlist(setup.symbol)}
          title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
          style={{ background: isWatchlisted ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (isWatchlisted ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.07)'), borderRadius: 6, padding: '5px 11px', color: isWatchlisted ? '#10b981' : '#4a5c7a', fontSize: 12, cursor: 'pointer', transition: 'all .15s' }}
        >
          {isWatchlisted ? '★' : '☆'}
        </button>
      </div>
    </div>
  )
}

// ─── Tier gate (free users only) ──────────────────────────────────────────────
function TierGate() {
  return (
    <div style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.18)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontFamily: '"Syne",sans-serif', fontSize: 15, fontWeight: 800, color: '#f0f6ff', marginBottom: 5 }}>🔒 Live AI scans require Pro</div>
        <div style={{ color: '#8b9fc0', fontSize: 12, maxWidth: 450, lineHeight: 1.6 }}>Pro members get real-time AI scans across 60+ symbols every 5 minutes. The 100-analyst engine runs continuously so you never miss a high-conviction setup.</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
          {['60+ symbol universe', 'Auto-refresh 5min', 'All 100 frameworks', 'Exact strike + expiry', 'Live options data'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#10b981', fontSize: 10 }}><span>✓</span><span>{f}</span></div>
          ))}
        </div>
      </div>
      <a href="/app/billing" style={{ padding: '10px 20px', background: '#2563eb', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap', fontFamily: '"DM Mono",monospace' }}>
        Upgrade to Pro →
      </a>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TopSetups() {
  const navigate = useNavigate()
  const [setups, setSetups] = useState(BASELINE)
  const [isLive, setIsLive] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState('Initializing...')
  const [lastScan, setLastScan] = useState(null)
  const [nextScan, setNextScan] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('Confidence')
  const [scanCount, setScanCount] = useState(0)
  const [tier, setTier] = useState('loading')
  const [scanMeta, setScanMeta] = useState(null)
  const [marketCtx, setMarketCtx] = useState(null)
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ankushai_wl') || '[]') } catch { return [] }
  })
  const [toast, setToast] = useState(null)
  const intervalRef = useRef(null)
  const countdownRef = useRef(null)
  const REFRESH_MS = 5 * 60 * 1000

  function showToast(msg, color = '#10b981') {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 3000)
  }

  function toggleWatchlist(symbol) {
    const next = watchlist.includes(symbol) ? watchlist.filter(s => s !== symbol) : [...watchlist, symbol]
    setWatchlist(next)
    try { localStorage.setItem('ankushai_wl', JSON.stringify(next)) } catch (e) {}
    showToast(watchlist.includes(symbol) ? symbol + ' removed' : symbol + ' added ★', watchlist.includes(symbol) ? '#f59e0b' : '#10b981')
  }

  function goToChart(symbol) { navigate('/app/charts?symbol=' + symbol) }

  const runScan = useCallback(async (silent = false) => {
    if (scanning) return
    if (!silent) setScanStatus('Running 100 analyst frameworks...')
    setScanning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/analysis?type=scan', {
        headers: { 'Authorization': 'Bearer ' + session?.access_token }
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const d = await r.json()
      setTier(d.tier || 'free')
      if (d.marketContext) setMarketCtx(d.marketContext)
      if (d.setups && d.setups.length > 0) {
        setSetups(d.setups)
        setIsLive(true)
        setScanCount(c => c + 1)
        const now = new Date()
        setLastScan(now)
        setNextScan(new Date(now.getTime() + REFRESH_MS))
        setScanMeta({ scanned: d.scanned, qualified: d.qualified, filtered: d.filtered })
        setScanStatus('Live — ' + d.setups.length + ' setups · ' + d.qualified + ' symbols qualified · ' + d.filtered + ' filtered')
      }
    } catch (err) {
      setScanStatus(isLive ? 'Cached — retrying next cycle' : 'Baseline mode — live scan queued')
    } finally { setScanning(false) }
  }, [scanning, isLive])

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      if (nextScan) {
        const r = Math.max(0, Math.round((nextScan - Date.now()) / 1000))
        setCountdown(r)
      }
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [nextScan])

  useEffect(() => {
    runScan()
    intervalRef.current = setInterval(() => runScan(true), REFRESH_MS)
    return () => clearInterval(intervalRef.current)
  }, [])

  // Sort
  const sortFn = (a, b) => {
    if (sortBy === 'Confidence') return b.confidence - a.confidence
    if (sortBy === 'R/R Ratio') {
      return parseFloat((b.rrRatio || '0').replace(':1', '')) - parseFloat((a.rrRatio || '0').replace(':1', ''))
    }
    if (sortBy === 'Analyst Agreement') return (b.analystAgreement || 0) - (a.analystAgreement || 0)
    if (sortBy === 'Urgency') { const u = { high: 3, medium: 2, low: 1 }; return (u[b.urgency] || 0) - (u[a.urgency] || 0) }
    return 0
  }

  const fws = ['all', 'breakout', 'momentum', 'earnings', 'fibonacci', 'macro', 'technical', 'options', 'sympathy', 'sector', 'the_strat', 'value']
  const filtered = (filter === 'all' ? setups : setups.filter(s => (s.frameworks || []).includes(filter))).slice().sort(sortFn)

  const bullCount = setups.filter(s => s.bias === 'bullish').length
  const bearCount = setups.filter(s => s.bias === 'bearish').length
  const avgConf = setups.length ? Math.round(setups.reduce((s, x) => s + (x.confidence || 0), 0) / setups.length * 10) / 10 : 0
  const rrs = setups.filter(s => s.rrRatio).map(s => parseFloat((s.rrRatio || '0').replace(':1', '')))
  const avgRR = rrs.length ? Math.round(rrs.reduce((a, b) => a + b, 0) / rrs.length * 10) / 10 : 0

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes livepulse { 0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(16,185,129,.4) } 50% { opacity:.7; box-shadow: 0 0 0 5px rgba(16,185,129,0) } }
        @keyframes slidein { from { opacity:0; transform: translateY(4px) } to { opacity:1; transform: translateY(0) } }
        @keyframes toastin { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: translateY(0) } }
        .fwbtn { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:5px; padding:3px 10px; color:#3d4e62; font-family:"DM Mono",monospace; font-size:9px; cursor:pointer; transition:all .15s; }
        .fwbtn:hover, .fwbtn.act { background:rgba(37,99,235,.1); border-color:rgba(37,99,235,.28); color:#60a5fa; }
        .sortbtn { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:5px; padding:3px 10px; color:#3d4e62; font-family:"DM Mono",monospace; font-size:9px; cursor:pointer; transition:all .15s; }
        .sortbtn.act { background:rgba(139,92,246,.1); border-color:rgba(139,92,246,.28); color:#a78bfa; }
      `}</style>

      {/* Toast notification */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0f1923', border: '1px solid ' + toast.color + '40', borderRadius: 8, padding: '8px 18px', color: toast.color, fontSize: 11, fontFamily: '"DM Mono",monospace', zIndex: 9999, animation: 'toastin .2s ease', boxShadow: '0 4px 30px rgba(0,0,0,.5)', whiteSpace: 'nowrap' }}>
          {toast.msg}
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 24, fontWeight: 800, margin: '0 0 3px', letterSpacing: '-.3px' }}>AnkushAI Top Setups</h1>
          <div style={{ color: '#3d4e62', fontSize: 11 }}>100 analyst frameworks · 60+ symbol universe · Penny stock gate · Real dollar levels</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: isLive ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)', border: '1px solid ' + (isLive ? 'rgba(16,185,129,0.16)' : 'rgba(245,158,11,0.16)'), borderRadius: 6, padding: '4px 10px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLive ? '#10b981' : '#f59e0b', display: 'inline-block', animation: isLive ? 'livepulse 2s infinite' : 'none', flexShrink: 0 }} />
            <span style={{ color: isLive ? '#10b981' : '#f59e0b', fontSize: 10, fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
              {scanning ? 'SCANNING...' : isLive ? 'LIVE INTELLIGENCE' : 'BASELINE MODE'}
            </span>
          </div>
          {!scanning && nextScan && countdown !== null && (
            <div style={{ color: '#2d3d50', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>
              Next scan {countdown > 60 ? Math.floor(countdown / 60) + 'm ' : ''}{countdown % 60}s
            </div>
          )}
          <button onClick={() => runScan(false)} disabled={scanning} style={{ padding: '4px 12px', background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.16)', borderRadius: 5, color: '#60a5fa', fontSize: 10, cursor: scanning ? 'default' : 'pointer', fontFamily: '"DM Mono",monospace', opacity: scanning ? .5 : 1 }}>
            ↻ Force Rescan
          </button>
        </div>
      </div>

      {/* ── MARKET REGIME BANNER ── */}
      <MarketRegime ctx={marketCtx} />

      {/* ── TIER GATE — only for free users without live setups ── */}
      {tier !== 'loading' && tier === 'free' && !isLive && <TierGate />}

      {/* ── STATS ROW ── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 14, padding: '10px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          ['SETUPS', setups.length, '#e2e8f0'],
          ['BULLISH', bullCount, '#10b981'],
          ['BEARISH', bearCount, '#ef4444'],
          ['AVG CONF', avgConf + '/10', '#f59e0b'],
          ['AVG R/R', avgRR + ':1', '#a78bfa'],
          ['WATCHLIST', watchlist.length, '#60a5fa'],
          ['SCANS TODAY', scanCount, '#6b7a90'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ textAlign: 'center', minWidth: 52 }}>
            <div style={{ color: '#2d3d50', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 2, letterSpacing: '.06em' }}>{l}</div>
            <div style={{ color: c, fontSize: 20, fontWeight: 700, fontFamily: '"DM Mono",monospace', lineHeight: 1 }}>{v}</div>
          </div>
        ))}
        {scanMeta && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ color: '#2d3d50', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 1 }}>UNIVERSE</div>
            <div style={{ color: '#3d4e62', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{scanMeta.scanned} scanned · {scanMeta.qualified} qualified · {scanMeta.filtered} filtered</div>
          </div>
        )}
        {lastScan && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#2d3d50', fontSize: 8, fontFamily: '"DM Mono",monospace', marginBottom: 1 }}>LAST SCAN</div>
            <div style={{ color: '#3d4e62', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{lastScan.toLocaleTimeString()}</div>
          </div>
        )}
      </div>

      {/* ── STATUS BAR ── */}
      <div style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.09)', borderRadius: 7, padding: '6px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        {scanning && <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(96,165,250,.2)', borderTopColor: '#60a5fa', animation: 'spin .6s linear infinite', display: 'inline-block', flexShrink: 0 }} />}
        <span style={{ color: '#3d4e62', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>⚡ {scanStatus}</span>
      </div>

      {/* ── FILTER + SORT ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {fws.map(fw => (
            <button key={fw} className={'fwbtn' + (filter === fw ? ' act' : '')} onClick={() => setFilter(fw)}>
              {fw === 'all' ? 'All Frameworks' : fw}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ color: '#2d3d50', fontSize: 8, fontFamily: '"DM Mono",monospace', marginRight: 2 }}>SORT BY</span>
          {SORT_OPTIONS.map(s => (
            <button key={s} className={'sortbtn' + (sortBy === s ? ' act' : '')} onClick={() => setSortBy(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* ── SETUPS GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 12 }}>
        {filtered.map((setup, i) => (
          <div key={setup.symbol + '-' + i} style={{ animation: 'slidein .25s ease' }}>
            <SetupCard
              setup={setup}
              index={i}
              isLive={isLive}
              onChartClick={goToChart}
              onWatchlist={toggleWatchlist}
              isWatchlisted={watchlist.includes(setup.symbol)}
            />
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px', color: '#3d4e62', fontSize: 12, fontFamily: '"DM Mono",monospace' }}>
          No {filter} setups in current scan. Try a different framework filter.
        </div>
      )}

      {/* ── PENNY GATE INFO ── */}
      {isLive && scanMeta && (
        <div style={{ marginTop: 14, padding: '8px 14px', background: 'rgba(16,185,129,0.03)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#10b981', fontSize: 9, fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>✓ PENNY STOCK GATE ACTIVE</span>
          <span style={{ color: '#2d3d50', fontSize: 10 }}>Price &gt;$5 · Avg daily vol &gt;500K · Market cap &gt;$1B · Liquid options chain required</span>
        </div>
      )}

      {/* ── DISCLAIMER ── */}
      <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ color: '#2d3d50', fontSize: 10, lineHeight: 1.6 }}>
          ⚠️ AI-generated analysis synthesizing technical, macro, and fundamental frameworks. Not financial advice. Options involve significant risk including potential total loss of premium paid. Entry/target/stop levels are AI estimates based on pattern recognition — always verify independently before trading.
        </div>
      </div>
    </div>
  )
}
