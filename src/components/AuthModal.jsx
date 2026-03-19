import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function AuthModal({ onClose }) {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleGoogle() {
    setLoading(true)
    await signInWithGoogle()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:16,padding:'40px 32px',width:360,maxWidth:'90vw',textAlign:'center',boxShadow:'0 24px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize:32,marginBottom:8 }}>⚡</div>
        <h2 style={{ color:'#e2e8f0',fontFamily:'"DM Mono",monospace',fontSize:18,margin:'0 0 8px' }}>AnkushAI</h2>
        <p style={{ color:'#4a5c7a',fontSize:13,margin:'0 0 28px' }}>Sign in to access your trading intelligence platform</p>
        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{ width:'100%',padding:'13px 0',borderRadius:8,border:'1px solid #2a3a4a',background:'#141b24',color:'#e2e8f0',fontSize:14,cursor:loading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,fontFamily:'"DM Mono",monospace',opacity:loading?0.7:1,transition:'all 0.2s' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>
          {loading ? 'Redirecting to Google...' : 'Continue with Google'}
        </button>
        <button onClick={onClose} style={{ marginTop:16,background:'none',border:'none',color:'#4a5c7a',fontSize:12,cursor:'pointer',fontFamily:'"DM Mono",monospace' }}>Cancel</button>
      </div>
    </div>
  )
}
