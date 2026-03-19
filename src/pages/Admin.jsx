import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const ADMIN_EMAIL = 'ankushtasildar2@gmail.com'
const LS_KEY = 'aai_admin'

export default function Admin() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  // SYNCHRONOUS check — read localStorage right now, before any render
  const hasLocalAuth = localStorage.getItem(LS_KEY) === 'true'
  const hasGoogleAuth = !loading && user?.email === ADMIN_EMAIL

  // If neither auth passes synchronously, redirect immediately in render
  // Don't wait for useEffect — that's what was causing the race
  if (!hasLocalAuth && !hasGoogleAuth && !loading) {
    navigate('/admin/login', { replace: true })
    return null
  }

  // If Google auth is still loading AND no local auth, show spinner
  if (!hasLocalAuth && loading) {
    return (
      <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#080c14',color:'#4a5c7a',fontFamily:'"DM Mono",monospace',fontSize:12 }}>
        Authenticating...
      </div>
    )
  }

  return <AdminDashboard localAuth={hasLocalAuth} email={user?.email} navigate={navigate} />
}

function AdminDashboard({ localAuth, email, navigate }) {
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({ total: 0, pro: 0, free: 0 })
  const [loading, setLoading] = useState(true)
  const [codeInput, setCodeInput] = useState('')
  const [codeMsg, setCodeMsg] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500)
    if (data) {
      setUsers(data)
      const pro = data.filter(p => p.plan === 'pro').length
      setStats({ total: data.length, pro, free: data.length - pro })
    }
    setLoading(false)
  }

  async function createCode() {
    const code = codeInput.trim().toUpperCase()
    if (!code) return
    const { error } = await supabase.from('access_codes').insert({ code, created_by: 'admin', is_active: true })
    setCodeMsg(error ? 'Error: ' + error.message : '✓ Created: ' + code)
    setCodeInput('')
    setTimeout(() => setCodeMsg(''), 4000)
  }

  async function togglePlan(userId, plan) {
    await supabase.from('profiles').update({
      plan: plan === 'pro' ? 'free' : 'pro',
      updated_at: new Date().toISOString()
    }).eq('id', userId)
    loadData()
  }

  function logout() {
    localStorage.removeItem(LS_KEY)
    navigate('/', { replace: true })
  }

  const th = { color:'#4a5c7a',fontSize:11,padding:'8px 12px',textAlign:'left',borderBottom:'1px solid #1e2d3d',textTransform:'uppercase',letterSpacing:'0.05em' }
  const td = { color:'#8b9fc0',fontSize:12,padding:'10px 12px',borderBottom:'1px solid #0d1520' }
  const badge = (p) => ({ display:'inline-block',padding:'3px 8px',borderRadius:4,fontSize:11,fontWeight:600,background:p==='pro'?'rgba(37,99,235,0.2)':'transparent',color:p==='pro'?'#60a5fa':'#4a5c7a',border:'1px solid '+(p==='pro'?'rgba(37,99,235,0.3)':'#1e2d3d') })

  return (
    <div style={{ minHeight:'100vh',background:'#080c14',padding:'28px 32px',fontFamily:'"DM Mono",monospace' }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:28 }}>
        <div>
          <h1 style={{ color:'#e2e8f0',fontSize:20,margin:0 }}>⚡ AnkushAI Admin</h1>
          <div style={{ color:'#4a5c7a',fontSize:11,marginTop:4 }}>{localAuth ? 'Local auth' : email} · {new Date().toLocaleDateString()}</div>
        </div>
        <div style={{ display:'flex',gap:8 }}>
          <button onClick={loadData} style={{ padding:'7px 12px',borderRadius:6,border:'none',fontSize:11,cursor:'pointer',fontFamily:'inherit',background:'#1e2d3d',color:'#8b9fc0' }}>↻</button>
          <button onClick={logout} style={{ padding:'7px 12px',borderRadius:6,border:'none',fontSize:11,cursor:'pointer',fontFamily:'inherit',background:'rgba(239,68,68,0.15)',color:'#ef4444' }}>Logout</button>
        </div>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24 }}>
        {[['Total Users',stats.total,'#e2e8f0'],['Pro',stats.pro,'#60a5fa'],['Free',stats.free,'#e2e8f0'],['MRR est.','$'+(stats.pro*29).toLocaleString(),'#10b981']].map(([l,v,c])=>(
          <div key={l} style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:20 }}>
            <div style={{ color:'#4a5c7a',fontSize:11,marginBottom:8,textTransform:'uppercase' }}>{l}</div>
            <div style={{ color:c,fontSize:24,fontWeight:700 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:20,marginBottom:20 }}>
        <div style={{ color:'#e2e8f0',fontSize:14,marginBottom:14,fontWeight:600 }}>Create Access Code</div>
        <div style={{ display:'flex',gap:8,alignItems:'center' }}>
          <input style={{ background:'#141b24',border:'1px solid #1e2d3d',borderRadius:6,padding:'9px 12px',color:'#e2e8f0',fontSize:12,fontFamily:'inherit',width:260,outline:'none' }} value={codeInput} onChange={e=>setCodeInput(e.target.value.toUpperCase())} placeholder="BETA-TRADER-001" onKeyDown={e=>e.key==='Enter'&&createCode()} />
          <button onClick={createCode} style={{ padding:'9px 16px',borderRadius:6,border:'none',fontSize:11,cursor:'pointer',fontFamily:'inherit',background:'#2563eb',color:'white' }}>+ Create</button>
          {codeMsg && <span style={{ color:'#10b981',fontSize:12 }}>{codeMsg}</span>}
        </div>
      </div>

      <div style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:20 }}>
        <div style={{ color:'#e2e8f0',fontSize:14,marginBottom:14,fontWeight:600 }}>Users ({loading?'...':users.length})</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead><tr>{['Email','Name','Plan','Status','Joined','Action'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {users.length===0&&!loading
                ?<tr><td colSpan={6} style={{...td,textAlign:'center',padding:32,color:'#4a5c7a'}}>No users yet.</td></tr>
                :users.map(u=>(
                <tr key={u.id}>
                  <td style={{...td,color:'#e2e8f0'}}>{u.email||'—'}</td>
                  <td style={td}>{u.full_name||'—'}</td>
                  <td style={td}><span style={badge(u.plan)}>{(u.plan||'free').toUpperCase()}</span></td>
                  <td style={td}>{u.subscription_status||'—'}</td>
                  <td style={td}>{u.created_at?new Date(u.created_at).toLocaleDateString():'—'}</td>
                  <td style={td}>
                    <button onClick={()=>togglePlan(u.id,u.plan)} style={{ padding:'5px 10px',borderRadius:5,border:'none',fontSize:11,cursor:'pointer',fontFamily:'inherit',background:u.plan==='pro'?'rgba(239,68,68,0.15)':'rgba(37,99,235,0.2)',color:u.plan==='pro'?'#ef4444':'#60a5fa' }}>
                      {u.plan==='pro'?'Revoke Pro':'Grant Pro'}
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
