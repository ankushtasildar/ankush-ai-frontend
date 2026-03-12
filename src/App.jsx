import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { AuthProvider, useAuth } from './lib/auth'
import ProtectedRoute from './components/ProtectedRoute'
import LiveTicker from './components/LiveTicker'
import RealtimeToast from './components/RealtimeToast'
import Overview from './pages/Overview'
import Portfolio from './pages/Portfolio'
import Signals from './pages/Signals'
import Sentiment from './pages/Sentiment'
import Backtest from './pages/Backtest'
import { Journal, Calendar } from './pages/index'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

const NAV = [
  { path: '/',          label: 'Overview',   icon: '◈' },
  { path: '/portfolio', label: 'Portfolio',  icon: '◉' },
  { path: '/signals',   label: 'Signals',    icon: '◆' },
  { path: '/sentiment', label: 'Sentiment',  icon: '◎' },
  { path: '/backtest',  label: 'Backtest',   icon: '◐' },
  { path: '/journal',   label: 'Journal',    icon: '◇' },
  { path: '/calendar',  label: 'Calendar',   icon: '○' },
]

function Sidebar({ dbOk }) {
  const { user, signOut } = useAuth()
  const [time, setTime] = useState('')

  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    })
    setTime(fmt())
    const t = setInterval(() => setTime(fmt()), 1000)
    return () => clearInterval(t)
  }, [])

  const etHour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false
  }))
  const marketOpen = etHour >= 9 && etHour < 16

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-mark">⚡</span>
          <div>
            <div className="logo-name">ANKUSH AI</div>
            <div className="logo-sub">Trading Intelligence</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ path, label, icon }) => (
          <NavLink key={path} to={path} end={path === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <LiveTicker />

      <div className="sidebar-footer">
        <div className="clock">{time}</div>
        <div className="date-str">
          {new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
        </div>
        <div className={`market-status ${marketOpen ? 'open' : 'closed'}`}>
          <span className="status-dot" />
          {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
        </div>
        <div className="connection-row">
          <span className={`conn-dot ${dbOk ? 'ok' : 'err'}`} />
          <span className="conn-label">Supabase {dbOk ? 'live' : 'offline'}</span>
        </div>
        {user && (
          <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)',
              marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user.email}
            </div>
            <button onClick={signOut} className="btn btn-ghost"
              style={{ width:'100%', justifyContent:'center', padding:'5px 8px', fontSize:11 }}>
              Sign Out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

function TopBar() {
  const loc = useLocation()
  const current = NAV.find(n => n.path === loc.pathname) || NAV[0]
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="topbar-icon">{current.icon}</span>
        {current.label}
      </div>
      <div className="topbar-right">
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--green)',
          display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)',
            display:'inline-block', animation:'pulse 2s infinite' }} />
          REAL-TIME
        </span>
        <span className="build-tag">P3 · Enterprise</span>
      </div>
    </header>
  )
}

function Shell() {
  const [dbOk, setDbOk] = useState(false)

  useEffect(() => {
    supabase.from('events').select('id').limit(1)
      .then(({ error }) => setDbOk(!error))
      .catch(() => setDbOk(false))
  }, [])

  return (
    <div className="app-shell">
      <Sidebar dbOk={dbOk} />
      <div className="main-area">
        <TopBar />
        <main className="page-content">
          <Routes>
            <Route path="/"          element={<ErrorBoundary page label="Overview"><Overview /></ErrorBoundary>} />
            <Route path="/portfolio" element={<ErrorBoundary page label="Portfolio"><Portfolio /></ErrorBoundary>} />
            <Route path="/signals"   element={<ErrorBoundary page label="Signals"><Signals /></ErrorBoundary>} />
            <Route path="/sentiment" element={<ErrorBoundary page label="Sentiment"><Sentiment /></ErrorBoundary>} />
            <Route path="/backtest"  element={<ErrorBoundary page label="Backtest"><Backtest /></ErrorBoundary>} />
            <Route path="/journal"   element={<ErrorBoundary page label="Journal"><Journal /></ErrorBoundary>} />
            <Route path="/calendar"  element={<ErrorBoundary page label="Calendar"><Calendar /></ErrorBoundary>} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <RealtimeToast />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary label="Application Error">
      <AuthProvider>
        <BrowserRouter>
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
