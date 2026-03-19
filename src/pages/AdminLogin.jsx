import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ADMIN_SECRET = 'ankushai-admin-2024'

export default function AdminLogin() {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    if (pw === ADMIN_SECRET) {
      sessionStorage.setItem('admin_auth', 'true')
      navigate('/admin/dashboard')
    } else {
      setError('Invalid password')
    }
  }

  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#080c14' }}>
      <form onSubmit={handleSubmit} style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:12,padding:'40px 32px',width:320,textAlign:'center' }}>
        <div style={{ fontSize:28,marginBottom:12 }}>⚡</div>
        <h2 style={{ color:'#e2e8f0',fontFamily:'"DM Mono",monospace',fontSize:16,marginBottom:24 }}>Admin Access</h2>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Admin password"
          autoFocus
          style={{ width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid #1e2d3d',background:'#141b24',color:'#e2e8f0',fontSize:13,fontFamily:'"DM Mono",monospace',marginBottom:12,boxSizing:'border-box' }}
        />
        {error && <div style={{ color:'#ef4444',fontSize:12,marginBottom:12 }}>{error}</div>}
        <button type="submit" style={{ width:'100%',padding:'11px',borderRadius:8,background:'#2563eb',border:'none',color:'white',fontSize:13,fontFamily:'"DM Mono",monospace',cursor:'pointer' }}>
          Enter Dashboard
        </button>
        <div style={{ marginTop:16 }}>
          <a href="/" style={{ color:'#4a5c7a',fontSize:11,textDecoration:'none' }}>← Back to site</a>
        </div>
      </form>
    </div>
  )
}
