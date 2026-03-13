import { useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, ComposedChart, Cell
} from 'recharts'

// ââ Shared tooltip ââââââââââââââââââââââââââââââââââââââââââââ
export const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius)', padding: '10px 14px',
      fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 140
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 6, fontSize: 10 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>
            {typeof p.value === 'number'
              ? p.name?.includes('$') || p.name?.toLowerCase().includes('price')
                ? `$${p.value.toFixed(2)}`
                : p.value.toFixed(2)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── PriceChart ──────────────────────────────────────────────
export const PriceChart = ({ data = [], height = 220, showEMA = false, entryPrice = null }) => {
  const fmt = useMemo(() => data.map(d => ({
    ...d,
    t: d.time ? new Date(d.time).toLocaleDateString([], { month: 'short', day: 'numeric' }) : d.t,
  })), [data])

  if (!fmt.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      No price data
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={fmt} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={48} tickFormatter={v => '$' + v.toFixed(0)} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="close" stroke="var(--blue)" fill="var(--blue)" fillOpacity={0.08} strokeWidth={1.5} dot={false} name="Price" />
        {showEMA && <Line type="monotone" dataKey="ema" stroke="var(--yellow)" strokeWidth={1} dot={false} name="EMA" strokeDasharray="4 2" />}
        {entryPrice != null && <ReferenceLine y={entryPrice} stroke="var(--green)" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: 'Entry', fill: 'var(--green)', fontSize: 10 }} />}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── RSIChart ────────────────────────────────────────────────
export const RSIChart = ({ data = [], height = 80 }) => {
  const fmt = useMemo(() => data.map(d => ({
    ...d,
    t: d.time ? new Date(d.time).toLocaleDateString([], { month: 'short', day: 'numeric' }) : d.t,
  })), [data])

  if (!fmt.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      No RSI data
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={fmt} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} ticks={[30, 50, 70]} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={70} stroke="var(--red)" strokeDasharray="3 3" strokeOpacity={0.5} />
        <ReferenceLine y={30} stroke="var(--green)" strokeDasharray="3 3" strokeOpacity={0.5} />
        <Line type="monotone" dataKey="rsi" stroke="var(--purple, #a78bfa)" strokeWidth={1.5} dot={false} name="RSI" />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── PnLBarChart ─────────────────────────────────────────────
export const PnLBarChart = ({ positions = [], height = 200 }) => {
  const data = useMemo(() => positions.map(p => ({
    name: p.symbol || p.name || '?',
    pnl: Number(p.realized_pnl || p.pnl || 0),
  })), [positions])

  if (!data.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      No P&L data
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={48} tickFormatter={v => '$' + v.toFixed(0)} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="var(--border-light)" />
        <Bar dataKey="pnl" name="P&L" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.pnl >= 0 ? 'var(--green)' : 'var(--red)'} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
