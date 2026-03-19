import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { MarketProvider, useMarket } from './lib/useMarket.jsx'
import ProtectedRoute from './components/ProtectedRoute'
import PaywallGate from './components/PaywallGate'
import LandingPage from './pages/LandingPage'
import AuthCallback from './pages/AuthCallback'
import AdminLogin from './pages/AdminLogin'
import Admin from './pages/Admin'
import Overview from './pages/Overview'
import Signals from './pages/Signals'
import Journal from './pages/Journal'
import Portfolio from './pages/Portfolio'
import { supabase } from './lib/supabase'

const NAV = [
  { to: '/app',           label: 'Overview',  icon: '⚡', end: true,  key: '1' },
  { to: '/app/signals',   label: 'Signals',   icon: '📡', key: '2' },
  { to: '/app/portfolio', label: 'Portfolio', icon: '💼', key: '3' },
  { to: '/app/journal',   label: 'Journal',   icon: '📓', key: '4' },
]

function SessionBadge() {
  const { session, quotes } = useMarket()
  const list = Object.values(quotes)
  const up = list.filter(q => (q.changePct || 0) > 0).length
  const dn = list.filter(q => (q.changePct || 0) < 0).length
  const cfg = {
    regular:    { label: 'Market Open',   color: '#10b981', pulse: true  },
    premarket:  { label: 'Pre-Market',    color: '#f59e0b', pulse: false },
    afterhours: { label: 'After Hours',   color: '#8b5cf6', pulse: false },
    closed:     { label: 'Market Closed', color: '#2d3d50', pulse: false },
  }[session] || { label: 'Closed', color: '#2d3d50', pulse: false }

  return (
    <div style={{ padding: '9px 10px', background: 'rgba(255,255,255,0.025)', borderRadius: 9, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: list.length ? 5 : 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, flexShrink: 0, display: 'inline-block', animation: cfg.pulse ? 'sbpulse 2s infinite' : 'none' }} />
        <span style={{ color: cfg.color, fontSize: 10, fontFamily: '"DM Mono",monospace', fontWeight: 600, letterSpacing: '0.04em' }}>{cfg.label}</span>
      </div>
      {list.length > 0 && (
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ color: '#10b981', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>▲ {up}</span>
          <span style={{ color: '#ef4444', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>▼ {dn}</span>
        </div>
      )}
    </div>
  )
}

function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [toast, setToast] = useState(null)

  const name = user?.email?.split('@')[0] || 'trader'
  const initials = name.substring(0, 2).toUpperCase()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '1') navigate('/app')
      if (e.key === '2') navigate('/app/signals')
      if (e.key === '3') navigate('/app/portfolio')
      if (e.key === '4') navigate('/app/journal')
      if (e.key === '[') setCollapsed(c => !c)
      if (e.key === '?') {
        setToast('Shortcuts: 1-4 navigate • [ toggle sidebar')
        setTimeout(() => setToast(null), 3000)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#080c14', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes sbpulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes toastIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        .nav-link { display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;text-decoration:none;font-size:13px;font-family:"DM Sans",sans-serif;font-weight:500;color:#8b9fc0;transition:all 0.14s;position:relative;white-space:nowrap;overflow:hidden; }
        .nav-link:hover { background:rgba(255,255,255,0.05)!important; color:#c4cfe0!important; }
        .nav-link.active { background:rgba(37,99,235,0.13)!important; color:#60a5fa!important; }
        .nav-link.active::before { content:''; position:absolute; left:0; top:22%; height:56%; width:3px; background:linear-gradient(180deg,#3b82f6,#8b5cf6); border-radius:0 3px 3px 0; }
        .sidebar-inner::-webkit-scrollbar { width:0; }
        .content-area::-webkit-scrollbar { width:5px; }
        .content-area::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.07); border-radius:3px; }
        .content-area::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.12); }
        .sign-out-btn:hover { color:#ef4444!important; background:rgba(239,68,68,0.07)!important; }
        .collapse-btn:hover { color:#8b9fc0!important; background:rgba(255,255,255,0.06)!important; }
      `}</style>

      {/* ── Sidebar ── */}
      <aside style={{ width: collapsed ? 60 : 220, background: 'linear-gradient(180deg,#090e18 0%,#070c14 100%)', borderRight: '1px solid rgba(255,255,255,0.055)', display: 'flex', flexDirection: 'column', flexShrink: 0, transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden', zIndex: 20 }}>

        {/* Logo */}
        <div style={{ padding: '15px 12px 13px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, flexShrink: 0 }}>
          {!collapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>⚡</div>
              <span style={{ color: '#f0f4ff', fontWeight: 700, fontSize: 13, fontFamily: '"DM Mono",monospace', letterSpacing: '0.06em' }}>ANKUSHAI</span>
            </div>
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, margin: '0 auto' }}>⚡</div>
          )}
          <button className="collapse-btn" onClick={() => setCollapsed(c => !c)} title="[ to toggle sidebar"
            style={{ background: 'none', border: 'none', color: '#2d3d50', cursor: 'pointer', fontSize: 17, padding: '2px 3px', borderRadius: 5, lineHeight: 1, flexShrink: 0, transition: 'all 0.14s' }}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-inner" style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
          {NAV.map(({ to, label, icon, end, key: k }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              title={collapsed ? `${label}  ·  ${k}` : undefined}
            >
              <span style={{ fontSize: 17, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{label}</span>
                  <span style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontFamily: '"DM Mono",monospace', color: '#2d3d50', letterSpacing: '0.04em', flexShrink: 0 }}>{k}</span>
                </>
              )}
            </NavLink>
          ))}

          <div style={{ flex: 1 }} />

          <NavLink to="/admin" className="nav-link" style={{ marginTop: 6 }} title={collapsed ? 'Admin' : undefined}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>⚙</span>
            {!collapsed && <span>Admin</span>}
          </NavLink>
        </nav>

        {/* Footer */}
        <div style={{ padding: '8px 8px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          {!collapsed && <SessionBadge />}

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderRadius: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700, fontFamily: '"DM Mono",monospace', letterSpacing: '0.04em' }}>
              {initials}
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  <span style={{ color: '#10b981', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.06em', fontWeight: 600 }}>PRO</span>
                </div>
              </div>
            )}
          </div>

          {!collapsed && (
            <button onClick={signOut} className="sign-out-btn"
              style={{ width: '100%', background: 'none', border: 'none', color: '#2d3d50', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: '6px 6px', borderRadius: 7, fontFamily: '"DM Mono",monospace', transition: 'all 0.14s', marginTop: 2 }}>
              ⏻  Sign out
            </button>
          )}

          {!collapsed && (
            <div style={{ color: '#1a2535', fontSize: 9, fontFamily: '"DM Mono",monospace', textAlign: 'center', marginTop: 8, letterSpacing: '0.04em' }}>
              ? for shortcuts
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="content-area" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <PaywallGate>
          <Outlet />
        </PaywallGate>
      </main>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#111927', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#e2e8f0', fontSize: 12, fontFamily: '"DM Mono",monospace', zIndex: 1000, animation: 'toastIn 0.2s ease', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
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
