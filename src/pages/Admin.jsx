import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const ADMIN_EMAIL = 'ankushtasildar2@gmail.com'

export default function Admin() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const sessionAuth = sessionStorage.getItem('admin_auth') === 'true'

  // Check auth SYNCHRONOUSLY before any render
  // sessionAuth wins immediately — no waiting for Google OAuth
  const isAuthorized = sessionAuth || (!loading && user?.email === ADMIN_EMAIL)

  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({ total: 0, pro: 0, free: 0 })
  const [loadingData, setLoadingData] = useState(true)
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const [codeMsg, setCodeMsg] = useState('')

  useEffect(() => {
    // Only redirect if: not session auth AND auth has loaded AND user is not admin
    if (!sessionAuth && !loading && user?.email !== ADMIN_EMAIL) {
      navigate('/admin/login')
    }
  }, [loading, user, sessionAuth])

  useEffect(() => {
    if (isAuthorized) loadData()
  }, [isAuthorized])

  async function loadData() {
    setLoadingData(true)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (profiles) {
      setUsers(profiles)
      const pro = profiles.filter(p => p.plan === 'pro').length
      setStats({ total: profiles.length, pro, free: profiles.length - pro })
    }
    setLoadingData(false)
  }

  async function createAccessCode() {
    const code = accessCodeInput.trim().toUpperCase()
    if (!code) return
    const { error } = await supabase.from('access_codes').insert({
      code, created_by: 'admin', is_active: true
    })
    setCodeMsg(error ? 'Error: ' + error.message : 'Created: ' + code)
    setAccessCodeInput('')
    setTimeout(() => setCodeMsg(''), 3000)
  }

  async function togglePlan(userId, currentPlan) {
    const newPlan = currentPlan === 'pro' ? 'free' : 'pro'
    await supabase.from('profiles').update({
      plan: newPlan, updated_at: new Date().toISOString()
    }).eq('id', userId)
    loadData()
  }

  function logout() {
    sessionStorage.removeItem('admin_auth')
    navigate('/')
  }

  // While Google auth is loading and no session auth, show spinner
  if (!sessionAuth && loading) {
    return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#080c14',color:'#4a5c7a',fontFamily:'"DM Mono",monospace',fontSize:12 }}>Loading...</div>
  }

  // Not authorized at all
  if (!isAuthorized) return null

  const s = {
    page: { minHeight:'100vh',background:'#080c14',padding:'24px 32px',fontFamily:'"DM Mono",monospace' },
    header: { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:28 },
    h1: { color:'#e2e8f0',fontSize:20,margin:0 },
    subtitle: { color:'#4a5c7a',fontSize:11,marginTop:4 },
    grid4: { display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24 },
    card: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:20 },
    cardLabel: { color:'#4a5c7a',fontSize:11,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em' },
    cardVal: { color:'#e2e8f0',fontSize:24,fontWeight:700 },
    section: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:20,marginBottom:20 },
    sectionTitle: { color:'#e2e8f0',fontSize:14,marginBottom:16,fontWeight:600 },
    table: { width:'100%',borderCollapse:'collapse' },
    th: { color:'#4a5c7a',fontSize:11,padding:'8px 12px',textAlign:'left',borderBottom:'1px solid #1e2d3d',textTransform:'uppercase',letterSpacing:'0.05em' },
    td: { color:'#8b9fc0',fontSize:12,padding:'10px 12px',borderBottom:'1px solid #0d1520' },
    badge: (plan) => ({ display:'inline-block',padding:'3px 8px',borderRadius:4,fontSize:11,fontWeight:600,background:plan==='pro'?'rgba(37,99,235,0.2)':'rgba(30,45,61,0.5)',color:plan==='pro'?'#60a5fa':'#4a5c7a',border:plan==='pro'?'1px solid rgba(37,99,235,0.4)':'1px solid #1e2d3d' }),
    btn: (variant) => ({ padding:'6px 12px',borderRadius:6,border:'none',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace',background:variant==='danger'?'rgba(239,68,68,0.15)':variant==='primary'?'#2563eb':'#1e2d3d',color:variant==='danger'?'#ef4444':variant==='primary'?'white':'#8b9fc0' }),
    input: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:6,padding:'9px 12px',color:'#e2e8f0',fontSize:12,fontFamily:'"DM Mono",monospace',width:240 },
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>⚡ AnkushAI Admin</h1>
          <div style={s.subtitle}>{sessionAuth ? 'Session login' : user?.email} · {new Date().toLocaleDateString()}</div>
        </div>
        <div style={{ display:'flex',gap:8 }}>
          <button onClick={loadData} style={s.btn('secondary')}>Refresh</button>
          <button onClick={logout} style={s.btn('danger')}>Logout</button>
        </div>
      </div>

      <div style={s.grid4}>
        {[
          { label: 'Total Users', val: stats.total },
          { label: 'Pro Users', val: stats.pro },
          { label: 'Free Users', val: stats.free },
          { label: 'MRR (est)', val: '$' + (stats.pro * 29).toLocaleString() },
        ].map(({ label, val }) => (
          <div key={label} style={s.card}>
            <div style={s.cardLabel}>{label}</div>
            <div style={s.cardVal}>{val}</div>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Create Access Code</div>
        <div style={{ display:'flex',gap:8,alignItems:'center' }}>
          <input
            style={s.input}
            value={accessCodeInput}
            onChange={e => setAccessCodeInput(e.target.value.toUpperCase())}
            placeholder="e.g. BETA-TRADER-001"
            onKeyDown={e => e.key === 'Enter' && createAccessCode()}
          />
          <button onClick={createAccessCode} style={s.btn('primary')}>Create Code</button>
          {codeMsg && <span style={{ color:'#10b981',fontSize:12 }}>{codeMsg}</span>}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Users ({loadingData ? '...' : users.length})</div>
        {loadingData ? (
          <div style={{ color:'#4a5c7a',fontSize:12,padding:20 }}>Loading users...</div>
        ) : users.length === 0 ? (
          <div style={{ color:'#4a5c7a',fontSize:12,padding:20 }}>No users yet.</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>{['Email','Name','Plan','Status','Joined','Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={s.td}>{u.email || '—'}</td>
                    <td style={{ ...s.td, color:'#e2e8f0' }}>{u.full_name || '—'}</td>
                    <td style={s.td}><span style={s.badge(u.plan)}>{(u.plan || 'free').toUpperCase()}</span></td>
                    <td style={s.td}>{u.subscription_status || '—'}</td>
                    <td style={s.td}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td style={s.td}>
                      <button
                        onClick={() => togglePlan(u.id, u.plan)}
                        style={s.btn(u.plan === 'pro' ? 'danger' : 'primary')}
                      >
                        {u.plan === 'pro' ? 'Revoke Pro' : 'Grant Pro'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
