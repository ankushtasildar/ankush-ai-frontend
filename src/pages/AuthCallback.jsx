import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Handle the OAuth callback — Supabase puts tokens in the URL hash
    // We need to let Supabase process the hash before checking session
    const handleCallback = async () => {
      // Give Supabase a moment to process the hash tokens
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (session) {
        navigate('/app', { replace: true })
        return
      }

      // If no session yet, listen for the auth state change
      // (happens when Supabase processes the hash on load)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          subscription.unsubscribe()
          navigate('/app', { replace: true })
        }
      })

      // Fallback timeout
      const timeout = setTimeout(() => {
        subscription.unsubscribe()
        navigate('/', { replace: true })
      }, 10000)

      return () => {
        subscription.unsubscribe()
        clearTimeout(timeout)
      }
    }

    handleCallback()
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh',
      background: '#080c14', color: '#8b9fc0',
      fontFamily: 'DM Mono, monospace', fontSize: '13px', gap: '16px'
    }}>
      <div style={{ fontSize: '32px', animation: 'spin 1.5s linear infinite' }}>⚡</div>
      <div>Signing you in...</div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
