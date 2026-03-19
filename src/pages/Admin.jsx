import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const ADMIN_EMAIL = 'ankushtasildar2@gmail.com'

export default function Admin() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const sessionAuth = sessionStorage.getItem('admin_auth') === 'true'
  const isAuthorized = sessionAuth || (!loading && user?.email === ADMIN_EMAIL)

  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({ total: 0, pro: 0, free: 0, revenue: 0 })
  const [loadingData, setLoadingData] = useState(true)
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const [codeMsg, setCodeMsg] = useState('')

  useEffect(() => {
    if (!loading && !isAuthorized) {
      navigate('/admin/login')
    }
  }, [loading, isAuthorized])

  useEffect(() => {
    if (isAuthorized) loadData()
  }, [isAuthorized])

  async function loadData() {
    setLoadingData(true)
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100)
    if (profiles) {
      setUsers(profiles)
      const pro = profiles.filter(p => p.plan === 'pro').length
      setStats({ total: profiles.length, pro, free: profiles.length - pro, revenue: pro * 29 })
    }
    setLoadingData(false)
  }

  async function createAccessCode() {
    const code = accessCodeInput.trim().toUpperCase()
    if (!code) return
    const { error } = await supabase.from('access_codes').insert({ code, created_by: 'admin', is_active: true })
    setCodeMsg(error ? 'Error: ' + error.message : 'Code created: ' + code)
    setAccessCodeInput('')
  }

  async function togglePlan(userId, currentPlan) {
    const newPlan = currentPlan === 'pro' ? 'free' : 'pro'
    await supabase.from('profiles').update({ plan: newPlan, updated_at: new Date().toISOString() }).eq('id', userId)
    loadData()
  }

  function logout() {
    sessionStorage.removeItem('admin_auth')
    navigate('/')
  }

  if (loading && !sessionAuth) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#080c14',color:'#4a5c7a',fontFamily:'"DM Mono",monospace',fontSize:12 }}>
      Loading...
    </div>
  )

  if (!isAuthorized) return null

  const s = {
    page: { minHeight:'100vh',background:'#080c14',padding:24,fontFamily:'"DM Mono",monospace' },
    header: { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:28 },
    h1: { color:'#e2e8f0',fontSize:20,margin:0 },
    grid: { display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24 },
    card: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:16 },
    cardLabel: { color:'#4a5c7a',fontSize:11,marginBottom:6 },
    cardVal: { color:'#e2e8f0',fontSize:22,fontWeight:700 },
    section: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:20,marginBottom:20 },
    sectionTitle: { color:'#e2e8f0',fontSize:14,marginBottom:16 },
    table: { width:'100%',borderCollapse:'collapse' },
    th: { color:'#4a5c7a',fontSize:11,padding:'8px 12px',textAlign:'left',borderBottom:'1px solid #1e2d3d' },
    td: { color:'#8b9fc0',fontSize:12,padding:'10px 12px',borderBottom:'1px solid #0d1520' },
    badge: (plan) => ({ display:'inline-block',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:600, background: plan==='pro'?'#1d4ed8':'#1e2d3d', color: plan==='pro'?'#93c5fd':'#4a5c7a' }),
    btn: { padding:'6px 12px',borderRadius:6,border:'none',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace' },
    input: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:6,padding:'8px 10px',color:'#e2e8f0',fontSize:12,fontFamily:'"DM Mono",monospace' },
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>⚡ AnkushAI Admin</h1>
          <div style={{ color:'#4a5c7a',fontSize:11,marginTop:4 }}>{sessionAuth ? 'Session auth' : user?.email}</div>
        </div>
        <button onClick={logout} style={{...s.btn,background:'#1e2d3d',color:'#8b9fc0'}}>Logout</button>
      </div>

      <div style={s.grid}>
        {[
          { label:'Total Users', val: stats.total },
          { label:'Pro Users', val: stats.pro },
          { label:'Free Users', val: stats.free },
          { label:'MRR (est.)', val: '$' + stats.revenue },
        ].map(({label,val}) => (
          <div key={label} style={s.card}>
            <div style={s.cardLabel}>{label}</div>
            <div style={s.cardVal}>{val}</div>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Create Access Code</div>
        <div style={{ display:'flex',gap:8,alignItems:'center' }}>
          <input style={s.input} value={accessCodeInput} onChange={e => setAccessCodeInput(e.target.value)} placeholder="e.g. BETA-001" onKeyDown={e => e.key==='Enter' && createAccessCode()} />
          <button onClick={createAccessCode} style={{...s.btn,background:'#2563eb',color:'white',padding:'8px 16px'}}>Create</button>
          {codeMsg && <span style={{ color:'#10b981',fontSize:12 }}>{codeMsg}</span>}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Users ({users.length})</div>
        {loadingData ? (
          <div style={{ color:'#4a5c7a',fontSize:12 }}>Loading...</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                {['Email','Plan','Status','Joined','Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={s.td}>{u.email || '—'}</td>
                  <td style={s.td}><span style={s.badge(u.plan)}>{u.plan?.toUpperCase() || 'FREE'}</span></td>
                  <td style={s.td}>{u.subscription_status || 'none'}</td>
                  <td style={s.td}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  <td style={s.td}>
                    <button onClick={() => togglePlan(u.id, u.plan)} style={{...s.btn, background: u.plan==='pro'?'#1e2d3d':'#2563eb', color: u.plan==='pro'?'#8b9fc0':'white'}}>
                      {u.plan === 'pro' ? 'Downgrade' : 'Upgrade to Pro'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
