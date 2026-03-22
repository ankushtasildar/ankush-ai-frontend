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

  
  // Compute session inline
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); const mins = et.getHours()*60+et.getMinutes();
  const sessionInfo = day===0||day===6 ? {label:'Weekend',color:'#64748b'} :
    mins<240 ? {label:'Closed',color:'#64748b'} :
    mins<570 ? {label:'Pre-Market',color:'#f59e0b'} :
    mins<960 ? {label:'Live',color:'#10b981'} :
    mins<1200 ? {label:'Post-Market',color:'#f59e0b'} : {label:'Closed',color:'#64748b'};
  
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
