import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (handled.current) return
      if (event === 'SIGNED_IN' && session) {
        handled.current = true
        subscription.unsubscribe()
        navigate('/app', { replace: true })
      } else if (event === 'SIGNED_OUT') {
        handled.current = true
        subscription.unsubscribe()
        navigate('/', { replace: true })
      }
    })

    const timeout = setTimeout(() => {
      if (!handled.current) {
        handled.current = true
        subscription.unsubscribe()
        navigate('/', { replace: true })
      }
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh',
      background: '#080c14', color: '#8b9fc0',
      fontFamily: '"DM Mono", monospace', fontSize: 13, gap: 16
    }}>
      <div style={{ fontSize: 32, animation: 'spin 1.5s linear infinite' }}>⚡</div>
      <div>Signing you in...</div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
