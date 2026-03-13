import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const ADMIN_EMAIL = 'ankushtasildar2@gmail.com'

const s = {
  wrap: { minHeight:'100vh', background:'#080c14', color:'#f0f4ff', fontFamily:'DM Mono,monospace', padding:'40px' },
  h1: { fontFamily:'Syne,sans-serif', fontSize:32, fontWeight:800, marginBottom:32 },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:16, marginBottom:40 },
  card: { background:'#0d1420', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:24 },
  cardVal: { fontFamily:'Syne,sans-serif', fontSize:36, fontWeight:800, color:'#f0f4ff', marginBottom:4 },
  cardLbl: { fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:'#4a5c7a' },
  section: { marginBottom:40 },
  sectionTitle: { fontSize:11, letterSpacing:'.12em', textTransform:'uppercase', color:'#4a5c7a', marginBottom:16 },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { textAlign:'left', fontSize:10, letterSpacing:'.1em', textTransform:'uppercase', color:'#4a5c7a', padding:'8px 12px', borderBottom:'1px solid rgba(255,255,255,0.07)' },
  td: { padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:13, color:'#8b9fc0' },
  badge: { display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10, letterSpacing:'.08em', textTransform:'uppercase' },
  btn: { fontFamily:'DM Mono,monospace', fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', padding:'8px 16px', background:'#2563eb', color:'white', border:'none', borderRadius:6, cursor:'pointer' },
  input: { fontFamily:'DM Mono,monospace', fontSize:12, padding:'8px 12px', background:'#0d1420', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, color:'#f0f4ff', outline:'none', marginRight:8 },
}

export default function Admin() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [codes, setCodes] = useState([])
  const [newCode, setNewCode] = useState('')
  const [stats, setStats] = useState({ total:0, today:0, active:0, codes:0 })
  const [tab, setTab] = useState('users')

  useEffect(() => {
    if (!loading && (!user || user.email !== ADMIN_EMAIL)) navigate('/')
  }, [user, loading])

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL) {
      loadData()
    }
  }, [user])

  async function loadData() {
    const [{ data: profiles }, { data: accessCodes }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('access_codes').select('*').order('created_at', { ascending: false }),
    ])
    setUsers(profiles || [])
    setCodes(accessCodes || [])
    const today = new Date().toISOString().split('T')[0]
    setStats({
      total: profiles?.length || 0,
      today: profiles?.filter(p => p.created_at?.startsWith(today)).length || 0,
      active: accessCodes?.filter(c => c.is_active).length || 0,
      codes: accessCodes?.length || 0,
    })
  }

  async function createCode() {
    const code = newCode.trim().toUpperCase() || 'ANKUSH-' + Math.random().toString(36).slice(2,8).toUpperCase()
    await supabase.from('access_codes').insert({ code, created_by: user.email, is_active: true })
    setNewCode('')
    loadData()
  }

  async function toggleCode(id, current) {
    await supabase.from('access_codes').update({ is_active: !current }).eq('id', id)
    loadData()
  }

  if (loading || !user) return null

  return (
    <div style={s.wrap}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:32 }}>
        <div style={s.h1}>⚡ Admin</div>
        <button style={{...s.btn, background:'transparent', border:'1px solid rgba(255,255,255,0.1)'}} onClick={() => navigate('/app')}>← Dashboard</button>
      </div>

      <div style={s.grid}>
        {[['Total Users', stats.total],['Signed Up Today', stats.today],['Access Codes', stats.codes],['Active Codes', stats.active]].map(([l,v]) => (
          <div style={s.card} key={l}>
            <div style={s.cardVal}>{v}</div>
            <div style={s.cardLbl}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:16, marginBottom:24 }}>
        {['users','codes'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{...s.btn, background: tab===t ? '#2563eb' : 'transparent', border:'1px solid rgba(255,255,255,0.1)'}}>
            {t === 'users' ? 'Users' : 'Access Codes'}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div style={s.section}>
          <div style={s.sectionTitle}>All Users ({users.length})</div>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>Email</th><th style={s.th}>Name</th>
              <th style={s.th}>Plan</th><th style={s.th}>Joined</th><th style={s.th}>Access Code</th>
            </tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.id}>
                <td style={s.td}>{u.email}</td>
                <td style={s.td}>{u.full_name || '—'}</td>
                <td style={s.td}>
                  <span style={{...s.badge, background: u.plan==='pro'?'rgba(37,99,235,0.2)':u.plan==='starter'?'rgba(16,185,129,0.15)':'rgba(255,255,255,0.05)', color: u.plan==='pro'?'#60a5fa':u.plan==='starter'?'#10b981':'#4a5c7a'}}>
                    {u.plan || 'free'}
                  </span>
                </td>
                <td style={s.td}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                <td style={s.td}>{u.access_code || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'codes' && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Access Codes</div>
          <div style={{ display:'flex', gap:8, marginBottom:24 }}>
            <input style={s.input} placeholder="Custom code (optional)" value={newCode} onChange={e => setNewCode(e.target.value)} />
            <button style={s.btn} onClick={createCode}>Generate Code</button>
          </div>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>Code</th><th style={s.th}>Status</th>
              <th style={s.th}>Used By</th><th style={s.th}>Used At</th><th style={s.th}>Action</th>
            </tr></thead>
            <tbody>{codes.map(c => (
              <tr key={c.id}>
                <td style={{...s.td, fontWeight:600, color:'#f0f4ff', letterSpacing:'.05em'}}>{c.code}</td>
                <td style={s.td}>
                  <span style={{...s.badge, background: c.is_active?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)', color: c.is_active?'#10b981':'#ef4444'}}>
                    {c.is_active ? 'active' : 'disabled'}
                  </span>
                </td>
                <td style={s.td}>{c.used_by || '—'}</td>
                <td style={s.td}>{c.used_at ? new Date(c.used_at).toLocaleDateString() : '—'}</td>
                <td style={s.td}>
                  <button onClick={() => toggleCode(c.id, c.is_active)} style={{...s.btn, padding:'4px 10px', fontSize:10, background: c.is_active?'rgba(239,68,68,0.2)':'rgba(16,185,129,0.2)', color: c.is_active?'#ef4444':'#10b981'}}>
                    {c.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
