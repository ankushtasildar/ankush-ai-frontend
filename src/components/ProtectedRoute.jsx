import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#080c14', color:'#4a5c7a', fontFamily:'DM Mono,monospace', fontSize:12 }}>Loading...</div>
  if (!user) return <Navigate to="/" replace />
  return children
}
