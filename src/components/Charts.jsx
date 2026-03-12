import { useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, ComposedChart, Cell
} from 'recharts'

// ── Shared tooltip ────────────────────────────────────────────
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