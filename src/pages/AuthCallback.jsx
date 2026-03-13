import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // First check if session already exists (handles returning users)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/app', { replace: true })
        return
      }
      // No session yet — wait for OAuth to complete
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          subscription.unsubscribe()
          navigate('/app', { replace: true })
        }
      })
      // Timeout fallback
      const timer = setTimeout(() => {
        subscription.unsubscribe()
        navigate('/', { replace: true })
      }, 8000)
      return () => { subscription.unsubscribe(); clearTimeout(timer) }
    })
  }, [])

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#080c14',color:'#8b9fc0',fontFamily:'DM Mono,monospace',fontSize:13,gap:16}}>
      <div style={{fontSize:32,animation:'spin 1.5s linear infinite'}}>⚡</div>
      <div>Signing you in...</div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
