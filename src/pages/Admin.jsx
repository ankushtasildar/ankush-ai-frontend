import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const ADMIN_EMAIL = 'ankushtasildar2@gmail.com'
const SESSION_KEY = 'admin_auth'

export default function Admin() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  // Read session storage synchronously on every render
  const sessionAuth = typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === 'true'

  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({ total: 0, pro: 0, free: 0 })
  const [loadingData, setLoadingData] = useState(false)
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const [codeMsg, setCodeMsg] = useState('')
  const [loaded, setLoaded] = useState(false)

  // Gate: only redirect if session NOT set AND Google auth fully resolved AND not admin
  useEffect(() => {
    if (sessionAuth) {
      if (!loaded) { setLoaded(true); loadData() }
      return
    }
    if (!loading) {
      if (user?.email === ADMIN_EMAIL) {
        if (!loaded) { setLoaded(true); loadData() }
      } else {
        navigate('/admin/login', { replace: true })
      }
    }
  }, [sessionAuth, loading, user])

  async function loadData() {
    setLoadingData(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500)
    if (data) {
      setUsers(data)
      const pro = data.filter(p => p.plan === 'pro').length
      setStats({ total: data.length, pro, free: data.length - pro })
    }
    setLoadingData(false)
  }

  async function createAccessCode() {
    const code = accessCodeInput.trim().toUpperCase()
    if (!code) return
    const { error } = await supabase.from('access_codes').insert({ code, created_by: 'admin', is_active: true })
    setCodeMsg(error ? 'Error: ' + error.message : 'Created: ' + code)
    setAccessCodeInput('')
    setTimeout(() => setCodeMsg(''), 4000)
  }

  async function togglePlan(userId, currentPlan) {
    const newPlan = currentPlan === 'pro' ? 'free' : 'pro'
    await supabase.from('profiles').update({ plan: newPlan, updated_at: new Date().toISOString() }).eq('id', userId)
    loadData()
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    navigate('/')
  }

  // Show spinner only if NOT session-authed and Google is loading
  if (!sessionAuth && loading) {
    return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#080c14',color:'#4a5c7a',fontFamily:'"DM Mono",monospace',fontSize:12 }}>Authenticating...</div>
  }

  // Not authorized — will redirect via useEffect, show nothing
  if (!sessionAuth && !loading && user?.email !== ADMIN_EMAIL) {
    return null
  }

  const c = (v, color) => ({ color: color || '#e2e8f0', fontSize: v ? 22 : 22, fontWeight: 700 })
  const s = {
    page: { minHeight:'100vh',background:'#080c14',padding:'28px 32px',fontFamily:'"DM Mono",monospace' },
    h1: { color:'#e2e8f0',fontSize:20,margin:0 },
    sub: { color:'#4a5c7a',fontSize:11,marginTop:4 },
    row: { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:28 },
    grid: { display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24 },
    card: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:20 },
    lbl: { color:'#4a5c7a',fontSize:11,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em' },
    section: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:20,marginBottom:20 },
    stitle: { color:'#e2e8f0',fontSize:14,marginBottom:16,fontWeight:600 },
    th: { color:'#4a5c7a',fontSize:11,padding:'8px 12px',textAlign:'left',borderBottom:'1px solid #1e2d3d',textTransform:'uppercase' },
    td: { color:'#8b9fc0',fontSize:12,padding:'10px 12px',borderBottom:'1px solid #0d1520' },
    input: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:6,padding:'9px 12px',color:'#e2e8f0',fontSize:12,fontFamily:'"DM Mono",monospace',width:260 },
    btnP: { padding:'8px 14px',borderRadius:6,border:'none',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace',background:'#2563eb',color:'white' },
    btnD: { padding:'6px 10px',borderRadius:5,border:'none',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace',background:'rgba(239,68,68,0.15)',color:'#ef4444' },
    btnS: { padding:'6px 10px',borderRadius:5,border:'none',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace',background:'rgba(37,99,235,0.15)',color:'#60a5fa' },
    btnG: { padding:'7px 12px',borderRadius:5,border:'none',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace',background:'#1e2d3d',color:'#8b9fc0' },
    badge: (p) => ({ display:'inline-block',padding:'3px 8px',borderRadius:4,fontSize:11,fontWeight:600,background:p==='pro'?'rgba(37,99,235,0.2)':'transparent',color:p==='pro'?'#60a5fa':'#4a5c7a',border:p==='pro'?'1px solid rgba(37,99,235,0.3)':'1px solid #1e2d3d' })
  }

  return (
    <div style={s.page}>
      <div style={s.row}>
        <div>
          <h1 style={s.h1}>⚡ AnkushAI Admin</h1>
          <div style={s.sub}>{sessionAuth ? 'Session login' : user?.email} · {new Date().toLocaleDateString()}</div>
        </div>
        <div style={{ display:'flex',gap:8 }}>
          <button onClick={loadData} style={s.btnG}>↻ Refresh</button>
          <button onClick={logout} style={s.btnD}>Logout</button>
        </div>
      </div>

      <div style={s.grid}>
        {[
          { label:'Total Users', val: stats.total },
          { label:'Pro', val: stats.pro, color:'#60a5fa' },
          { label:'Free', val: stats.free },
          { label:'MRR est.', val: '$' + (stats.pro * 29).toLocaleString(), color:'#10b981' },
        ].map(({ label, val, color }) => (
          <div key={label} style={s.card}>
            <div style={s.lbl}>{label}</div>
            <div style={{ color: color||'#e2e8f0', fontSize:24, fontWeight:700 }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.stitle}>Create Access Code</div>
        <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
          <input style={s.input} value={accessCodeInput} onChange={e => setAccessCodeInput(e.target.value.toUpperCase())} placeholder="BETA-TRADER-001" onKeyDown={e => e.key==='Enter' && createAccessCode()} />
          <button onClick={createAccessCode} style={s.btnP}>+ Create Code</button>
          {codeMsg && <span style={{ color:'#10b981',fontSize:12 }}>{codeMsg}</span>}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.stitle}>Users {loadingData ? '(loading...)' : '(' + users.length + ')'}</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead>
              <tr>{['Email','Name','Plan','Status','Joined','Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {users.length === 0 && !loadingData ? (
                <tr><td colSpan={6} style={{ ...s.td, textAlign:'center', padding:32 }}>No users yet.</td></tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td style={{ ...s.td, color:'#e2e8f0' }}>{u.email || '—'}</td>
                  <td style={s.td}>{u.full_name || '—'}</td>
                  <td style={s.td}><span style={s.badge(u.plan)}>{(u.plan||'free').toUpperCase()}</span></td>
                  <td style={s.td}>{u.subscription_status || '—'}</td>
                  <td style={s.td}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  <td style={s.td}>
                    <button onClick={() => togglePlan(u.id, u.plan)} style={u.plan==='pro' ? s.btnD : s.btnS}>
                      {u.plan==='pro' ? 'Revoke Pro' : 'Grant Pro'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
