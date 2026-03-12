import { useAuth } from '../lib/auth'
import Login from '../pages/Login'
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '.1em' }}><span>⚡ LOADING</span></div>
  if (!user) return <Login />
  return children
}
