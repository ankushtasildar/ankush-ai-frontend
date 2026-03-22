import { useState } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN = 'ankushtasildar2@gmail.com'

export default function Login() {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState('email') // email | password | otp | sent
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isNewUser, setIsNewUser] = useState(false)

  const handleGoogleLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' }
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  const handleEmailContinue = async () => {
    if (!email || !email.includes('@')) { setError('Enter a valid email'); return }
    setLoading(true); setError('')
    try {
      // Check if user exists via Supabase signIn attempt with wrong password trick
      // Use OTP flow for both new and existing users - simpler and more secure
      const { data, error: signInErr } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + '/auth/callback'
        }
      })
      if (signInErr && signInErr.message.includes('not found')) {
        // New user - send OTP to verify email and create account
        setIsNewUser(true)
        const { error: newErr } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: window.location.origin + '/auth/callback'
          }
        })
        if (newErr) { setError(newErr.message); setLoading(false); return }
        setStep('otp')
      } else if (signInErr) {
        setError(signInErr.message)
        setLoading(false); return
      } else {
        // Existing user - OTP sent
        setIsNewUser(false)
        setStep('otp')
      }
    } catch(e) { setError('Something went wrong. Please try again.') }
    setLoading(false)
  }

  const handleOtpVerify = async () => {
    if (!otp || otp.length < 6) { setError('Enter the 6-digit code'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
    if (error) { setError(error.message); setLoading(false) }
    else window.location.href = '/app/overview'
  }

  const handleResend = async () => {
    setLoading(true); setError('')
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: isNewUser, emailRedirectTo: window.location.origin + '/auth/callback' }
    })
    setLoading(false)
  }

  const s = {
    page: { minHeight:'100vh', background:'radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.12) 0%, #080c14 60%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"DM Sans",sans-serif' },
    card: { width: '100%', maxWidth: 420, padding: '40px 36px', background: '#0d1117', border: '1px solid #1e2a3a', borderRadius: 20 },
    logo: { textAlign:'center', marginBottom: 32 },
    logoText: { fontSize: 26, fontWeight: 800, color: '#f0f6ff', fontFamily:'"Syne",sans-serif', letterSpacing: '-0.5px' },
    logoSub: { fontSize: 12, color: '#4a5c7a', marginTop: 4 },
    valueProp: { fontSize: 13, color: '#6b7fa3', textAlign:'center', marginTop:8, lineHeight:1.5, marginBottom:4 },
    newUser: { fontSize: 12, color: '#4a5c7a', textAlign:'center', marginTop:12 },
    tos: { fontSize: 11, color: '#333f55', textAlign:'center', marginTop:20, lineHeight:1.6 },
    googleBtn: { width:'100%', padding:'12px 0', display:'flex', alignItems:'center', justifyContent:'center', gap:10, background:'#fff', border:'none', borderRadius:10, color:'#1a1a2e', fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:20, transition:'opacity .15s' },
    divider: { display:'flex', alignItems:'center', gap:12, marginBottom:20 },
    divLine: { flex:1, height:1, background:'#1e2a3a' },
    divText: { color:'#4a5c7a', fontSize:12 },
    label: { display:'block', color:'#8899aa', fontSize:12, marginBottom:6, fontWeight:500 },
    input: { width:'100%', padding:'12px 14px', background:'#111620', border:'1px solid #1e2a3a', borderRadius:10, color:'#f0f6ff', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'"DM Sans",sans-serif', transition:'border-color .15s' },
    btn: { width:'100%', padding:'13px 0', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', border:'none', borderRadius:10, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', marginTop:16, transition:'opacity .15s' },
    err: { background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'10px 14px', color:'#ef4444', fontSize:13, marginTop:12 },
    back: { background:'none', border:'none', color:'#4a5c7a', fontSize:13, cursor:'pointer', marginTop:12, display:'block', width:'100%', textAlign:'center' },
    info: { color:'#8899aa', fontSize:13, textAlign:'center', lineHeight:1.6, marginBottom:20 },
    otpInput: { width:'100%', padding:'16px 14px', background:'#111620', border:'1px solid #1e2a3a', borderRadius:10, color:'#f0f6ff', fontSize:24, fontWeight:700, outline:'none', boxSizing:'border-box', textAlign:'center', letterSpacing:8, fontFamily:'"DM Mono",monospace' },
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>
          <div style={s.logoText}>AnkushAI</div>
          <div style={s.logoSub}>Institutional intelligence for retail traders</div>
          <div style={s.valueProp}>Scan the market like a quant.<br/>Institutional-grade setups, options flow & signals — in seconds.</div>
        </div>

        {step === 'email' && (
          <>
            <button style={s.googleBtn} onClick={handleGoogleLogin} disabled={loading}
              onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
              onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
              Continue with Google
            </button>

            <div style={s.divider}>
              <div style={s.divLine}/><span style={s.divText}>or continue with email</span><div style={s.divLine}/>
            </div>

            <label style={s.label}>Email address</label>
            <input
              style={s.input} type="email" placeholder="you@example.com"
              value={email} onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleEmailContinue()}
              onFocus={e=>e.target.style.borderColor='rgba(37,99,235,0.4)'}
              onBlur={e=>e.target.style.borderColor='#1e2a3a'}
            />
            {error && <div style={s.err}>{error}</div>}
            <button style={s.btn} onClick={handleEmailContinue} disabled={loading}
              onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
              onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              {loading ? 'Checking...' : 'Continue'}
            </button>
            <div style={s.newUser}>New here? Just enter your email — we'll get you set up instantly.</div>
            <div style={s.tos}>By continuing you agree to our{' '}
              <a href="/terms" style={{color:'#3b82f6',textDecoration:'none'}}>Terms</a>
              {' & '}
              <a href="/privacy" style={{color:'#3b82f6',textDecoration:'none'}}>Privacy Policy</a>
            </div>
          </>
        )}

        {step === 'otp' && (
          <>
            <div style={s.info}>
              {isNewUser
                ? 'Welcome! We sent a 6-digit code to verify your email.'
                : 'We sent a 6-digit sign-in code to'}
              {!isNewUser && <><br/><strong style={{color:'#f0f6ff'}}>{email}</strong></>}
            </div>
            <label style={s.label}>Enter code</label>
            <input
              style={s.otpInput} type="text" inputMode="numeric"
              maxLength={6} placeholder="000000"
              value={otp} onChange={e=>setOtp(e.target.value.replace(/[^0-9]/g,''))}
              onKeyDown={e=>e.key==='Enter'&&handleOtpVerify()}
              autoFocus
            />
            {error && <div style={s.err}>{error}</div>}
            <button style={s.btn} onClick={handleOtpVerify} disabled={loading}
              onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
              onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              {loading ? 'Verifying...' : isNewUser ? 'Create Account' : 'Sign In'}
            </button>
            <button style={s.back} onClick={handleResend} disabled={loading}>
              Resend code
            </button>
            <button style={s.back} onClick={()=>{setStep('email');setOtp('');setError('')}}>
              Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  )
}