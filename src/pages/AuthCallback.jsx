import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const done = useRef(false)

  useEffect(() => {
    // Supabase automatically processes the hash (#access_token=...) on load
    // and fires onAuthStateChange with SIGNED_IN once done.
    // We just need to listen for it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (done.current) return
      if (event === 'SIGNED_IN' && session) {
        done.current = true
        subscription.unsubscribe()
        navigate('/app', { replace: true })
      }
      if (event === 'SIGNED_OUT') {
        done.current = true
        subscription.unsubscribe()
        navigate('/', { replace: true })
      }
    })

    // Also check if session already exists (returning user who already has token)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (done.current) return
      if (session) {
        done.current = true
        subscription.unsubscribe()
        navigate('/app', { replace: true })
      }
    })

    // Timeout fallback — if nothing happens in 8s, go home
    const timeout = setTimeout(() => {
      if (!done.current) {
        done.current = true
        subscription.unsubscribe()
        navigate('/', { replace: true })
      }
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh',
      background: '#080c14', color: '#8b9fc0',
      fontFamily: '"DM Mono", monospace', fontSize: '13px', gap: '16px'
    }}>
      <div style={{ fontSize: '32px', animation: 'spin 1.5s linear infinite' }}>⚡</div>
      <div>Signing you in...</div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
