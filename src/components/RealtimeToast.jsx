/** RealtimeToast.jsx - Shows toast on new signal inserted into Supabase. Disappears after 4s. */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
export default function RealtimeToast() {
  const [toasts, setToasts] = useState([])
  useEffect(() => {
    const channel = supabase.channel('global-signals-toast')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, ({ new: sig }) => {
        const id = Date.now()
        const tier = sig.score >= 70 ? 'high' : sig.score >= 45 ? 'mid' : 'low'
        setToasts(prev => [...prev, { id, sig, tier }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
      }).subscribe()
    return () => channel.unsubscribe()
  }, [])
  if (!toasts.length) return null
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(({ id, sig, tier }) => (
        <div key={id} style={{ background: 'var(--bg-elevated)', border: `1px solid ${tier === 'high' ? 'var(--green)' : tier === 'mid' ? 'var(--yellow)' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'slideIn 0.2s ease', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16 }}>{tier === 'high' ? '🡢' : tier === 'mid' ? '🟡' : '🔴'}</span>
          <div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{sig.symbol} · {sig.score}</div></div>
        </div>
      ))}
    </div>
  )
}