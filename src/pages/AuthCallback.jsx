import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const done = useRef(false)

  useEffect(() => {
    async function handleCallback() {
      if (done.current) return

      // Try getSession first — Supabase auto-processes hash tokens on load
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        done.current = true
        navigate('/app', { replace: true })
        return
      }

      // Fallback: listen for SIGNED_IN event
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (done.current) return
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          done.current = true
          subscription.unsubscribe()
          navigate('/app', { replace: true })
        }
      })

      // Safety timeout
      const t = setTimeout(() => {
        if (!done.current) {
          done.current = true
          subscription.unsubscribe()
          navigate('/', { replace: true })
        }
      }, 8000)

      return () => { subscription.unsubscribe(); clearTimeout(t) }
    }

    handleCallback()
  }, [navigate])

  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#080c14',color:'#8b9fc0',fontFamily:'"DM Mono",monospace',fontSize:13,gap:16 }}>
      <div style={{ fontSize:32,animation:'spin 1.5s linear infinite' }}>⚡</div>
      <div>Signing you in...</div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
