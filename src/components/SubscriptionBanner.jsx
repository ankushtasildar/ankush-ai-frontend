import { useState } from 'react'
import { useSubscription } from '../hooks/useSubscription'
import { useAuth } from '../lib/auth'

export function SubscriptionBanner() {
  const { profile, isPro, startCheckout, redeemAccessCode } = useSubscription()
  const { user } = useAuth()
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(true)

  if (!show || !user || isPro) return null

  async function handleRedeem(e) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    const result = await redeemAccessCode(code)
    setLoading(false)
    if (result.error) setMsg(result.error)
    else { setMsg('Access granted! Full Pro access enabled.'); setTimeout(() => setShow(false), 2000) }
  }

  const s = {
    banner: { background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(16,185,129,0.08))', border: '1px solid rgba(37,99,235,0.3)', borderRadius: '12px', padding: '24px', marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' },
    left: { flex: 1 },
    title: { fontFamily: 'Syne,sans-serif', fontSize: '18px', fontWeight: '700', color: '#f0f4ff', marginBottom: '4px' },
    sub: { fontSize: '13px', color: '#8b9fc0' },
    right: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
    input: { fontFamily: 'DM Mono,monospace', fontSize: '12px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#f0f4ff', outline: 'none', letterSpacing: '.08em', textTransform: 'uppercase', width: '160px' },
    btn: { fontFamily: 'DM Mono,monospace', fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: '#f0f4ff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' },
    btnBlue: { fontFamily: 'DM Mono,monospace', fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' },
    msg: { fontSize: '12px', color: msg.includes('granted') ? '#10b981' : '#ef4444', marginTop: '8px' },
    dismiss: { background: 'none', border: 'none', color: '#4a5c7a', cursor: 'pointer', fontSize: '18px', padding: '0 4px', alignSelf: 'flex-start' },
  }

  return (
    <div style={s.banner}>
      <div style={s.left}>
        <div style={s.title}>Unlock Full Access</div>
        <div style={s.sub}>You're on the free plan. Upgrade to access all signals, AI tools, and advanced analytics.</div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <div style={s.right}>
        <form onSubmit={handleRedeem} style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <input style={s.input} placeholder="ACCESS CODE" value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
          <button type="submit" style={s.btn} disabled={loading}>{loading ? '...' : 'Redeem'}</button>
        </form>
        <button style={s.btnBlue} onClick={() => startCheckout('pro')}>Upgrade to Pro →</button>
      </div>
      <button style={s.dismiss} onClick={() => setShow(false)}>×</button>
    </div>
  )
}
