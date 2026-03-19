import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { MarketProvider, useMarket } from './lib/useMarket.jsx'
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

function MarketStatusBadge() {
  const { session, lastUpdate } = useMarket()

  const cfg = {
    regular:    { label:'Market Open',   color:'#10b981', bg:'rgba(16,185,129,0.1)',  pulse:true  },
    premarket:  { label:'Pre-Market',    color:'#f59e0b', bg:'rgba(245,158,11,0.1)',   pulse:false },
    afterhours: { label:'After Hours',   color:'#8b5cf6', bg:'rgba(139,92,246,0.1)',   pulse:false },
    closed:     { label:'Market Closed', color:'#4a5c7a', bg:'rgba(74,92,122,0.08)',   pulse:false },
  }[session] || { label:'Closed', color:'#4a5c7a', bg:'rgba(74,92,122,0.08)', pulse:false }

  return (
    <div style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 10px',background:cfg.bg,borderRadius:8,marginBottom:4 }}>
      <span style={{ display:'inline-block',width:6,height:6,borderRadius:'50%',background:cfg.color,animation:cfg.pulse?'pulse 2s infinite':undefined }} />
      <span style={{ color:cfg.color,fontSize:10,fontWeight:600 }}>{cfg.label}</span>
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
    { to:'/app',           label:'Overview',  icon:'\u26A1', end:true },
    { to:'/app/signals',   label:'Signals',   icon:'\uD83D\uDCCA' },
    { to:'/app/portfolio', label:'Portfolio', icon:'\uD83D\uDCBC' },
    { to:'/app/journal',   label:'Journal',   icon:'\uD83D\uDCD4' },
  ]

  const s = {
    shell:   { display:'flex',height:'100vh',fontFamily:'"DM Mono",monospace',background:'#080c14' },
    sidebar: { width:220,background:'#0a0f1a',borderRight:'1px solid #1e2d3d',display:'flex',flexDirection:'column',flexShrink:0 },
    logo:    { padding:'18px 16px 14px',color:'#e2e8f0',fontWeight:700,fontSize:15,letterSpacing:'0.05em',borderBottom:'1px solid #1e2d3d',display:'flex',alignItems:'center',gap:8 },
    nav:     { flex:1,padding:'12px 8px',display:'flex',flexDirection:'column',gap:2 },
    content: { flex:1,overflow:'auto' },
    footer:  { padding:'10px 8px',borderTop:'1px solid #1e2d3d' },
    email:   { color:'#4a5c7a',fontSize:11,padding:'4px 8px',marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' },
    signout: { width:'100%',background:'none',border:'none',color:'#ef4444',fontSize:11,cursor:'pointer',textAlign:'left',padding:'6px 8px',borderRadius:6,fontFamily:'inherit' },
  }

  return (
    <div style={s.shell}>
      <div style={s.sidebar}>
        <div style={s.logo}><span>&#x26A1;</span>ANKUSHAI</div>
        <nav style={s.nav}>
          {nav.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
              display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,
              textDecoration:'none',fontSize:13,
              background:isActive?'#1e2d3d':'transparent',
              color:isActive?'#e2e8f0':'#4a5c7a',
              borderLeft:isActive?'2px solid #3b82f6':'2px solid transparent',
              transition:'all 0.1s',
            })}>
              <span>{icon}</span><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={s.footer}>
          <MarketStatusBadge />
          <NavLink to="/admin" style={{ display:'block',padding:'5px 10px',borderRadius:6,textDecoration:'none',fontSize:10,color:'#1e2d3d',marginBottom:4 }}>
            &#x2699; Admin
          </NavLink>
          <div style={s.email}>{user?.email}</div>
          <button onClick={signOut} style={s.signout}>Sign Out</button>
        </div>
      </div>
      <div style={s.content}><Outlet /></div>
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
          <Route path="/app" element={
            <ProtectedRoute>
              <MarketProvider>
                <AppShell />
              </MarketProvider>
            </ProtectedRoute>
          }>
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
