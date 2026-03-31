import { BrowserRouter, Routes, Route, Navigate, useLocation, NavLink } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { AuthProvider, useAuth } from './lib/auth'

import Overview from './pages/Overview'
import Charts from './pages/Charts'
import TopSetups from './pages/TopSetups'
import Predict from './pages/Predict'
import Watchlist from './pages/Signals'
import Earnings from './pages/Earnings'
import Sectors from './pages/Sectors'
import Strategies from './pages/Strategies'
import Learn from './pages/Learn'
import Portfolio from './pages/Portfolio'
import Journal from './pages/Journal'
import RiskCalc from './pages/RiskCalc'
import EODDebrief from './pages/EODDebrief'
import Billing from './pages/Billing'
import Intelligence from './pages/Intelligence'
import Admin from './pages/Admin'
import MLTrainingLog from './pages/MLTrainingLog'
import Login from './pages/Login'
import AdminLogin from './pages/AdminLogin'
import AuthCallback from './pages/AuthCallback'
import LandingPage from './pages/LandingPage'

// Priya Nair: Grouped nav Ã¢ÂÂ Intelligence first, then Research, then My Trading
const NAV_GROUPS = [
  {
    label: 'INTELLIGENCE',
    items: [
      { to: 'overview',   label: 'Overview',   badge: null },
      { to: 'predict',    label: 'Alpha',      badge: 'NEW' },
      { to: 'setups',     label: 'Top Setups', badge: 'HOT' },
    ]
  },
  {
    label: 'RESEARCH',
    items: [
      { to: 'charts',     label: 'Charts',     badge: null },
      { to: 'sectors',    label: 'Sectors',    badge: null },
      { to: 'earnings',   label: 'Earnings',   badge: null },
      { to: 'strategies', label: 'Strategies', badge: null },
    { to: 'learn',      label: 'Learning',   badge: 'NEW' },
    ]
  },
  {
    label: 'MY TRADING',
    items: [
      { to: 'watchlist',  label: 'Watchlist',  badge: null },
      { to: 'journal',    label: 'Journal',    badge: null },
      { to: 'portfolio',  label: 'Portfolio',  badge: null },
      { to: 'risk',       label: 'Risk Calc',  badge: null },
    ]
  },
  {
    label: 'SYSTEM',
    items: [
      { to: 'eod',        label: 'EOD Debrief', badge: null },
    ]
  },
]

function Sidebar({ user, isAdmin, session }) {
  const location = useLocation()
  const { signOut } = useAuth()
  const [mktData, setMktData] = useState({ spy: null, vix: null, mood: null })

  useEffect(() => {
    fetch('/api/market?action=context')
      .then(r => r.json())
      .then(d => setMktData({ spy: d.spy, vix: d.vix, mood: d.mood }))
      .catch(() => {})
  }, [])

  const adminItems = isAdmin ? [
    { to: 'intelligence', label: 'Intelligence', badge: null },
    { to: 'admin',        label: 'Admin',        badge: null },
    { to: 'admin/ml-log', label: 'ML Training',   badge: 'NEW' },
  ] : []

  const groups = adminItems.length > 0
    ? [...NAV_GROUPS, { label: 'ADMIN', items: adminItems }]
    : NAV_GROUPS

  const sidebarStyle = {
    width: 200, minHeight: '100vh', background: '#0d0d11',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font)', flexShrink: 0,
  }

  const logoStyle = {
    padding: '16px 14px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  }

  const mktBarStyle = {
    padding: '8px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column', gap: 2,
  }

  const navStyle = { flex: 1, overflowY: 'auto', padding: '8px 0' }

  const groupLabelStyle = {
    fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1.5, padding: '10px 14px 4px', textTransform: 'uppercase',
  }

  function getItemStyle(to) {
    const active = location.pathname === '/app/' + to
    return {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 14px', cursor: 'pointer', textDecoration: 'none',
      fontSize: 13, fontWeight: active ? 600 : 400,
      color: active ? '#fff' : 'rgba(255,255,255,0.55)',
      background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
      borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
      transition: 'all 0.15s',
    }
  }

  const badgeStyle = (type) => ({
    fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
    background: type === 'HOT' ? '#ef4444' : type === 'NEW' ? '#7c3aed' : '#374151',
    color: '#fff', letterSpacing: 0.5,
  })

  const footerStyle = {
    padding: '10px 14px 14px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  }

  const vixColor = mktData.vix > 30 ? '#ef4444' : mktData.vix > 20 ? '#f59e0b' : '#10b981'

  return (
    <div className="app-sidebar" style={sidebarStyle}>
      <div style={logoStyle}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>AnkushAI</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Trading Intelligence</div>
      </div>
      {mktData.spy && (
        <div style={mktBarStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>SPY</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>${mktData.spy}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>VIX</span>
            <span style={{ color: vixColor, fontWeight: 600 }}>{mktData.vix} {mktData.mood && '- ' + mktData.mood}</span>
          </div>
        </div>
      )}
      <nav style={navStyle}>
        {groups.map(group => (
          <div key={group.label}>
            <div style={groupLabelStyle}>{group.label}</div>
            {group.items.map(item => (
              <NavLink key={item.to} to={'/app/' + item.to} style={getItemStyle(item.to)}>
                <span>{item.label}</span>
                {item.badge && <span style={badgeStyle(item.badge)}>{item.badge}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div style={footerStyle}>
        {user && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </div>
            <div style={{ fontSize: 10, color: isAdmin ? '#7c3aed' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontWeight: 600 }}>
              {isAdmin ? 'Admin' : 'Free'}
            </div>
          </div>
        )}
        <NavLink to='/app/billing' style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', marginBottom: 6 }}>Billing</NavLink>
        {user && (
          <button onClick={() => signOut()} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Sign out
          </button>
        )}
      </div>
    </div>
  )
}

function AppShell() {
  const { user, loading, isAdmin, session } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>
        Loading...
      </div>
    )
  }

  const isAuthRoute = location.pathname === '/' || ['/login', '/auth/callback', '/admin/login'].some(p => location.pathname.startsWith(p))
  if (!user && !isAuthRoute) {
    return <Navigate to='/login' replace />
  }

  if (isAuthRoute) {
    return (
      <Routes>
        <Route path='/' element={<LandingPage />} />
        <Route path='/login' element={<Login />} />
        <Route path='/auth/callback' element={<AuthCallback />} />
        <Route path='/admin/login' element={<AdminLogin />} />
      </Routes>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar user={user} isAdmin={isAdmin} session={session} />
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <Routes>
          <Route path='app/overview'    element={<Overview />} />
          <Route path='app/predict'     element={<Predict />} />
          <Route path='app/setups'      element={<TopSetups />} />
          <Route path='app/charts'      element={<Charts />} />
          <Route path='app/sectors'     element={<Sectors />} />
          <Route path='app/earnings'    element={<Earnings />} />
          <Route path='app/strategies'  element={<Strategies />} />
              <Route path='app/learn'       element={<Learn />} />
          <Route path='app/watchlist'   element={<Watchlist />} />
          <Route path='app/journal'     element={<Journal />} />
          <Route path='app/portfolio'   element={<Portfolio />} />
          <Route path='app/risk'        element={<RiskCalc />} />
          <Route path='app/eod'         element={<EODDebrief />} />
          <Route path='app/billing'     element={<Billing />} />
          {isAdmin && <Route path='app/intelligence' element={<Intelligence />} />}
          {isAdmin && <Route path='app/admin'        element={<Admin />} />}
          {isAdmin && <Route path='app/admin/ml-log'   element={<MLTrainingLog />} />}
          <Route path='app/*'           element={<Navigate to='/app/overview' replace />} />
          <Route path='*'               element={<Navigate to='/app/overview' replace />} />
        </Routes>
      </main>
      {/* Mobile bottom navigation */}
      <div className="mobile-bottom-nav">
        <a href="/app/overview"><span className="nav-icon">\u26A1</span>Overview</a>
        <a href="/app/predict"><span className="nav-icon">\uD83E\uDDE0</span>Alpha</a>
        <a href="/app/journal"><span className="nav-icon">\uD83D\uDCD3</span>Journal</a>
        <a href="/app/sectors"><span className="nav-icon">\uD83D\uDCC8</span>Sectors</a>
        <a href="/app/portfolio"><span className="nav-icon">\uD83D\uDCBC</span>Portfolio</a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}