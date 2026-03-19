import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import ProtectedRoute from './components/ProtectedRoute'
import LiveTicker from './components/LiveTicker'
import RealtimeToast from './components/RealtimeToast'
import Overview from './pages/Overview'
import Portfolio from './pages/Portfolio'
import Signals from './pages/Signals'
import Sentiment from './pages/Sentiment'
import Backtest from './pages/Backtest'
import LandingPage from './pages/LandingPage'
import AuthCallback from './pages/AuthCallback'
import Admin from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import { Journal, Calendar } from './pages/index'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

const NAV = [
  { path: '/app',           label: 'Overview',   icon: 'Ã¢ÂÂ' },
  { path: '/app/portfolio', label: 'Portfolio',  icon: 'Ã¢ÂÂ«' },
  { path: '/app/signals',   label: 'Signals',    icon: 'Ã¢ÂÂ' },
  { path: '/app/sentiment', label: 'Sentiment',  icon: 'Ã¢ÂÂ' },
  { path: '/app/backtest',  label: 'Backtest',   icon: 'Ã¢ÂÂ·' },
  { path: '/app/journal',   label: 'Journal',    icon: 'Ã¢ÂÂ§' },
  { path: '/app/calendar',  label: 'Calendar',   icon: 'Ã¢ÂÂ»' },
]

function AppShell() {
  const { user, signOut } = useAuth()
  const isAdmin = user?.email === 'ankushtasildar2@gmail.com'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#080c14', color:'#f0f4ff' }}>
      <LiveTicker />
      <RealtimeToast />
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <nav style={{ width:220, background:'#0d1420', borderRight:'1px solid rgba(255,255,255,0.07)', display:'flex', flexDirection:'column', padding:'20px 0' }}>
          <div style={{ padding:'0 20px 24px', fontFamily:'DM Mono,monospace', fontSize:13, letterSpacing:'.14em', color:'#f0f4ff' }}>
            Ã¢ÂÂ¡ ANKUSHAI
          </div>
          {NAV.map(n => (
            <NavLink key={n.path} to={n.path} end={n.path==='/app'}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:10, padding:'10px 20px',
                fontFamily:'DM Mono,monospace', fontSize:12, letterSpacing:'.08em',
                color: isActive ? '#f0f4ff' : '#4a5c7a',
                background: isActive ? 'rgba(37,99,235,0.12)' : 'transparent',
                borderRight: isActive ? '2px solid #2563eb' : '2px solid transparent',
                textDecoration:'none', transition:'all .15s'
              })}>
              <span>{n.icon}</span>{n.label}
            </NavLink>
          ))}
          <div style={{ flex:1 }} />
          {isAdmin && (
            <NavLink to="/admin" style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 20px', fontFamily:'DM Mono,monospace', fontSize:11, letterSpacing:'.08em', color:'#f59e0b', textDecoration:'none' }}>
              Ã¢ÂÂ Admin
            </NavLink>
          )}
          <div style={{ padding:'12px 20px', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#4a5c7a', marginBottom:8, letterSpacing:'.08em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.email}
            </div>
            <button onClick={signOut} style={{ fontFamily:'DM Mono,monospace', fontSize:11, letterSpacing:'.08em', color:'#4a5c7a', background:'none', border:'none', cursor:'pointer', padding:0 }}>
              Sign Out
            </button>
          </div>
        </nav>
        <main style={{ flex:1, overflow:'auto', padding:'28px 32px' }}>
          <ErrorBoundary>
            <Routes>
              <Route path="/app" element={<Overview />} />
              <Route path="/app/portfolio" element={<Portfolio />} />
              <Route path="/app/signals" element={<Signals />} />
              <Route path="/app/sentiment" element={<Sentiment />} />
              <Route path="/app/backtest" element={<Backtest />} />
              <Route path="/app/journal" element={<Journal />} />
              <Route path="/app/calendar" element={<Calendar />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
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
          <Route path="/app/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
