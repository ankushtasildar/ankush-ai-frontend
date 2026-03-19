import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import AuthCallback from './pages/AuthCallback'
import AdminLogin from './pages/AdminLogin'
import Admin from './pages/Admin'
import Overview from './pages/Overview'
import Signals from './pages/Signals'
import Journal from './pages/Journal'
import Portfolio from './pages/Portfolio'

function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    const { supabase } = await import('./lib/supabase')
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const nav = [
    { to: '/app',           label: 'Overview',   icon: '⚡' },
    { to: '/app/portfolio', label: 'Portfolio',  icon: '💼' },
    { to: '/app/signals',   label: 'Signals',    icon: '📈' },
    { to: '/app/journal',   label: 'Journal',    icon: '📝' },
  ]

  const s = {
    shell: { display:'flex', height:'100vh', fontFamily:'"DM Mono",monospace', background:'#080c14' },
    sidebar: { width:220, background:'#0a0f1a', borderRight:'1px solid #1e2d3d', display:'flex', flexDirection:'column', flexShrink:0 },
    logo: { padding:'20px 16px 12px', color:'#e2e8f0', fontWeight:700, fontSize:15, letterSpacing:'0.05em', borderBottom:'1px solid #1e2d3d', display:'flex', alignItems:'center', gap:8 },
    nav: { flex:1, padding:'12px 8px', display:'flex', flexDirection:'column', gap:2 },
    content: { flex:1, overflow:'auto' },
    footer: { padding:'12px 8px', borderTop:'1px solid #1e2d3d' },
    email: { color:'#4a5c7a', fontSize:11, padding:'4px 8px', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
    signout: { width:'100%', background:'none', border:'none', color:'#ef4444', fontSize:11, cursor:'pointer', textAlign:'left', padding:'6px 8px', borderRadius:6, fontFamily:'inherit' },
  }

  return (
    <div style={s.shell}>
      <div style={s.sidebar}>
        <div style={s.logo}>
          <span>⚡</span> ANKUSHAI
        </div>
        <nav style={s.nav}>
          {nav.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/app'} style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10,
              padding:'9px 12px', borderRadius:8, textDecoration:'none', fontSize:13,
              background: isActive ? '#1e2d3d' : 'transparent',
              color: isActive ? '#e2e8f0' : '#4a5c7a',
              borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
            })}>
              <span>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={s.footer}>
          <NavLink to="/admin" style={{ display:'block', padding:'6px 12px', borderRadius:6, textDecoration:'none', fontSize:11, color:'#4a5c7a', marginBottom:8 }}>
            ⚙️ Admin
          </NavLink>
          <div style={s.email}>{user?.email}</div>
          <button onClick={signOut} style={s.signout}>Sign Out</button>
        </div>
      </div>
      <div style={s.content}>
        <Outlet />
      </div>
    </div>
  )
}

function Placeholder({ name }) {
  return (
    <div style={{ padding:32, color:'#4a5c7a', fontFamily:'"DM Mono",monospace', fontSize:13 }}>
      <div style={{ color:'#e2e8f0', fontSize:18, marginBottom:8 }}>{name}</div>
      <div>Coming soon.</div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index element={<Overview />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="signals" element={<Signals />} />
            <Route path="sentiment" element={<Placeholder name="Sentiment" />} />
            <Route path="backtest" element={<Placeholder name="Backtest" />} />
            <Route path="journal" element={<Journal />} />
            <Route path="calendar" element={<Placeholder name="Calendar" />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
