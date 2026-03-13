/**
 * LiveTicker.jsx
 * Sidebar price ticker - polls for prices every 15s
 */
import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const SYMBOLS = (import.meta.env.VITE_SYMBOLS || 'AAPL,NVDA,TSLA,SPY,QQQ').split(',')

export default function LiveTicker() {
  const [prices, setPrices] = useState({})
  const [prev, setPrev] = useState({})

  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      try {
        const data = await api.ticker.quotes(SYMBOLS)
        if (cancelled) return
        setPrev(p => ({ ...p, ...prices }))
        setPrices(data || {})
      } catch {}
    }
    fetch()
    const id = setInterval(fetch, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!Object.keys(prices).length) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '8px 0', borderTop: '1px solid var(--border)'
    }}>
      {SYMBOLS.map(sym => {
        const price = prices[sym]
        const old = prev[sym]
        const change = price && old ? price - old : 0
        const color = change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : 'var(--text-secondary)'
        return (
          <div key={sym} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 8px', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{sym}</span>
            <span style={{ color }}>
              {price ? '$' + Number(price).toFixed(2) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
