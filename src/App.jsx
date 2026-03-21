import { BrowserRouter, Routes, Route, Navigate, useLocation, NavLink } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'

// Pages
import Overview from './pages/Overview'
import Charts from './pages/Charts'
import TopSetups from './pages/TopSetups'
import Strategies from './pages/Strategies'
import Portfolio from './pages/Portfolio'
import Journal from './pages/Journal'
import Watchlist from './pages/Signals'
import Earnings from './pages/Earnings'
import Sectors from './pages/Sectors'
import RiskCalc from './pages/RiskCalc'
import EODDebrief from './pages/EODDebrief'
import Intelligence from './pages/Intelligence'
import Billing from './pages/Billing'
import Admin from './pages/Admin'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'

function ProtectedRoute({ children }) {
  const [user, setUser] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user || null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user || null))
    return () => subscription.unsubscribe()
  }, [])
  if (user === undefined) return <div style={{ background: '#080c14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5c7a', fontFamily: '"DM Mono",monospace', fontSize: 12 }}>Loading AnkushAI...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppShell({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [marketStatus, setMarketStatus] = useState({ open: false, spy: null, spyChange: null })
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user)
      if (session?.user) loadProfile(session.user.id)
    })
    fetchMarketStatus()
    const interval = setInterval(fetchMarketStatus, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadProfile(id) {
    const { data } = await supabase.from('profiles').select('plan,subscription_status,username').eq('id', id).single()
    setProfile(data)
  }

  async function fetchMarketStatus() {
    try {
      const r = await fetch('/api/market?action=quote&symbol=SPY')
      if (r.ok) {
        const d = await r.json()
        const etHour = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
        const etDay = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' })
        const h = parseInt(etHour)
        const isOpen = !['Sat','Sun'].includes(etDay) && h >= 9 && h < 16
        setMarketStatus({ open: isOpen, spy: d.price, spyChange: d.changePercent })
      }
    } catch (e) {}
  }

  const isPro = profile?.plan === 'pro' || profile?.plan === 'enterprise' || profile?.subscription_status === 'active'
  const isAdmin = user?.email === 'ankushtasildar2@gmail.com'

  const nav = [
    { to: 'overview', label: 'Overview', icon: 'Ã¢ÂÂ', badge: null },
    { to: 'charts', label: 'Charts', icon: 'Ã°ÂÂÂ', badge: null },
    { to: 'setups', label: 'Top Setups', icon: 'Ã°ÂÂÂ¯', badge: 'HOT' },
    { to: 'watchlist', label: 'Watchlist', icon: 'Ã¢ÂÂ¡', badge: null },
    { to: 'earnings', label: 'Earnings', icon: 'Ã°ÂÂÂ', badge: null },
    { to: 'sectors', label: 'Sectors', icon: 'Ã°ÂÂÂ¡', badge: null },
    { to: 'strategies', label: 'Strategies', icon: 'Ã¢ÂÂ', badge: null },
    { to: 'portfolio', label: 'Portfolio', icon: 'Ã°ÂÂÂ¼', badge: null },
    { to: 'journal', label: 'Journal', icon: 'Ã°ÂÂÂ', badge: null },
    { to: 'risk', label: 'Risk Calc', icon: 'Ã¢ÂÂ', badge: null },
    { to: 'billing', label: 'Billing', icon: 'Ã°ÂÂÂ³', badge: null, divider: true },
    { to: 'eod', label: 'EOD Debrief', icon: 'Ã°ÂÂÂ', badge: null },
    ...(isAdmin ? [
      { to: 'intelligence', label: 'Intelligence', icon: 'Ã°ÂÂ§Â ', badge: null, divider: true },
      { to: 'admin', label: 'Admin', icon: 'Ã°ÂÂÂ§', badge: null },
    ] : [])
  ]

  const navItemStyle = (isActive, hasHot) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8, marginBottom: 2,
    background: isActive ? 'rgba(37,99,235,0.12)' : 'none',
    color: isActive ? '#60a5fa' : '#6b7a90',
    textDecoration: 'none', fontSize: 12, fontWeight: isActive ? 600 : 400, transition: 'all .15s',
    cursor: 'pointer'
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      {/* Sidebar */}
      <div style={{ width: collapsed ? 56 : 210, minHeight: '100vh', background: '#080c14', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', padding: '16px 10px', flexShrink: 0, transition: 'width .2s', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 16px', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>A</div>
          {!collapsed && <div style={{ fontFamily: '"Syne",sans-serif', fontWeight: 800, fontSize: 14, color: '#f0f6ff' }}>ANKUSHAI</div>}
          <button onClick={() => setCollapsed(!collapsed)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#3d4e62', cursor: 'pointer', fontSize: 16, padding: 0 }}>{collapsed ? 'Ã¢ÂÂ' : 'Ã¢ÂÂ'}</button>
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {nav.map((item, i) => (
            <div key={item.to}>
              {item.divider && <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '8px 0' }} />}
              <NavLink to={`/app/${item.to}`} style={({ isActive }) => navItemStyle(isActive)}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                {!collapsed && item.badge && (
                  <span style={{ background: '#ef4444', borderRadius: 4, padding: '1px 5px', fontSize: 8, color: '#fff', fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>{item.badge}</span>
                )}
              </NavLink>
            </div>
          ))}
        </div>

        {/* Market status + user */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
          {!collapsed && (
            <div style={{ padding: '4px 4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: marketStatus.open ? '#10b981' : '#4a5c7a', flexShrink: 0, boxShadow: marketStatus.open ? '0 0 6px #10b981' : 'none' }} />
              <div style={{ color: '#3d4e62', fontSize: 10 }}>
                {marketStatus.open ? 'Market Open' : 'Market Closed'}
                {marketStatus.spy && <span style={{ marginLeft: 6, color: (marketStatus.spyChange || 0) >= 0 ? '#10b981' : '#ef4444', fontFamily: '"DM Mono",monospace' }}>{(marketStatus.spyChange || 0) >= 0 ? '+' : ''}{(marketStatus.spyChange || 0).toFixed(2)}%</span>}
              </div>
            </div>
          )}
          {user && !collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', marginBottom: 4 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {user.email?.[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ color: '#f0f6ff', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.username || user.email?.split('@')[0]}</div>
                <div style={{ color: isPro ? '#10b981' : '#4a5c7a', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>Ã¢ÂÂ {isPro ? 'PRO' : 'FREE'}</div>
              </div>
              <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#3d4e62', cursor: 'pointer', fontSize: 10 }}>out</button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, marginLeft: collapsed ? 56 : 210, minHeight: '100vh', transition: 'margin-left .2s' }}>
        {children}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/app" element={<ProtectedRoute><AppShell><Navigate to="/app/overview" replace /></AppShell></ProtectedRoute>} />
        <Route path="/app/*" element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="overview" element={<Overview />} />
                <Route path="charts" element={<Charts />} />
                <Route path="setups" element={<TopSetups />} />
                <Route path="watchlist" element={<Watchlist />} />
                <Route path="earnings" element={<Earnings />} />
                <Route path="sectors" element={<Sectors />} />
                <Route path="strategies" element={<Strategies />} />
                <Route path="portfolio" element={<Portfolio />} />
                <Route path="journal" element={<Journal />} />
                <Route path="risk" element={<RiskCalc />} />
                <Route path="eod" element={<EODDebrief />} />
                <Route path="intelligence" element={<Intelligence />} />
                <Route path="billing" element={<Billing />} />
          <Route path="*" element={<Navigate to="/app/overview" replace />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        } />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
