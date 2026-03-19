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
import { useState, useEffect } from 'react'

function MarketStatus() {
  const [status, setStatus] = useState({ session: 'closed', label: 'Closed', color: '#4a5c7a' })

  useEffect(() => {
    function update() {
      // US ET market hours (approximate, ignores DST)
      const now = new Date()
      const utcH = now.getUTCHours()
      const utcM = now.getUTCMinutes()
      const utcTotal = utcH * 60 + utcM
      const day = now.getUTCDay() // 0=Sun, 6=Sat

      // Approximate ET = UTC-4 (EDT) or UTC-5 (EST)
      // Use UTC-4 for simplicity (EDT, Mar-Nov)
      const etTotal = ((utcTotal - 240) + 1440) % 1440

      if (day === 0 || day === 6) {
        setStatus({ session:'closed', label:'Weekend', color:'#4a5c7a' })
        return
      }
      if (etTotal >= 570 && etTotal < 960) { // 9:30am - 4:00pm ET
        setStatus({ session:'regular', label:'Market Open', color:'#10b981' })
      } else if (etTotal >= 240 && etTotal < 570) { // 4:00am - 9:30am ET
        setStatus({ session:'premarket', label:'Pre-Market', color:'#f59e0b' })
      } else if (etTotal >= 960 && etTotal < 1200) { // 4:00pm - 8:00pm ET
        setStatus({ session:'afterhours', label:'After Hours', color:'#8b5cf6' })
      } else {
        setStatus({ session:'closed', label:'Closed', color:'#4a5c7a' })
      }
    }
    update()
    const id = setInterval(update, 60000) // update every minute
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px',
      background: status.session === 'regular' ? 'rgba(16,185,129,0.08)' : 'rgba(74,92,122,0.08)',
      borderRadius:8, marginBottom:4 }}>
      <span style={{
        display:'inline-block', width:6, height:6, borderRadius:'50%',
        background: status.color,
        animation: status.session === 'regular' ? 'pulse 2s infinite' : 'none'
      }} />
      <span style={{ color: status.color, fontSize:10, fontWeight:600 }}>{status.label}</span>
    </div>
  )
}

function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    const { supabase } = await import('./lib/supabase')
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const nav = [
    { to: '/app',           label: 'Overview',   icon: '\u26A1', end: true },
    { to: '/app/signals',   label: 'Signals',    icon: '\uD83D\uDCCA' },
    { to: '/app/portfolio', label: 'Portfolio',  icon: '\uD83D\uDCBC' },
    { to: '/app/journal',   label: 'Journal',    icon: '\uD83D\uDCD4' },
  ]

  const s = {
    shell:   { display:'flex', height:'100vh', fontFamily:'"DM Mono",monospace', background:'#080c14' },
    sidebar: { width:220, background:'#0a0f1a', borderRight:'1px solid #1e2d3d', display:'flex', flexDirection:'column', flexShrink:0 },
    logo:    { padding:'18px 16px 14px', color:'#e2e8f0', fontWeight:700, fontSize:15, letterSpacing:'0.05em', borderBottom:'1px solid #1e2d3d', display:'flex', alignItems:'center', gap:8 },
    nav:     { flex:1, padding:'12px 8px', display:'flex', flexDirection:'column', gap:2 },
    content: { flex:1, overflow:'auto' },
    footer:  { padding:'10px 8px', borderTop:'1px solid #1e2d3d' },
    email:   { color:'#4a5c7a', fontSize:11, padding:'4px 8px', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
    signout: { width:'100%', background:'none', border:'none', color:'#ef4444', fontSize:11, cursor:'pointer', textAlign:'left', padding:'6px 8px', borderRadius:6, fontFamily:'inherit' },
  }

  return (
    <div style={s.shell}>
      <div style={s.sidebar}>
        <div style={s.logo}>
          <span>&#x26A1;</span>
          ANKUSHAI
        </div>
        <nav style={s.nav}>
          {nav.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
              borderRadius:8, textDecoration:'none', fontSize:13,
              background: isActive ? '#1e2d3d' : 'transparent',
              color: isActive ? '#e2e8f0' : '#4a5c7a',
              borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
              transition: 'all 0.12s',
            })}>
              <span>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={s.footer}>
          <MarketStatus />
          <NavLink to="/admin" style={{ display:'block', padding:'6px 12px', borderRadius:6, textDecoration:'none', fontSize:11, color:'#1e2d3d', marginBottom:4 }}>
            &#x2699; Admin
          </NavLink>
          <div style={s.email}>{user?.email}</div>
          <button onClick={signOut} style={s.signout}>Sign Out</button>
        </div>
      </div>
      <div style={s.content}>
        <Outlet />
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
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
            <Route path="journal" element={<Journal />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
