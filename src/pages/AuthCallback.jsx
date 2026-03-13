import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        subscription.unsubscribe()
        navigate('/app', { replace: true })
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe()
        navigate('/app', { replace: true })
      }
    })

    const timer = setTimeout(() => {
      subscription.unsubscribe()
      navigate('/', { replace: true })
    }, 5000)

    return () => { subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#080c14',color:'#8b9fc0',fontFamily:'DM Mono,monospace',fontSize:13,gap:16}}>
      <div style={{fontSize:32}}>⚡</div>
      <div>Signing you in...</div>
    </div>
  )
}