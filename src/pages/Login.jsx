import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { signInWithGoogle, signInWithMagicLink } = useAuth()
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleMagicLink = async () => {
    if (!email) return
    setLoading(true)
    setError('')
    const { error } = await signInWithMagicLink(email)
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        opacity: 0.3,
      }} />

      <div style={{
        position: 'relative',
        width: 400,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '40px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontSize: 36,
            filter: 'drop-shadow(0 0 16px rgba(59,130,246,0.6))',
            marginBottom: 12,
          }}>⚡</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '.15em',
            color: 'var(--text-primary)',
          }}>ANKUSH AI</div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            marginTop: 4,
          }}>Trading Intelligence Platform</div>
        </div>

        {sent ? (
          <div style={{
            textAlign: 'center',
            padding: '24px 0',
          }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✉️</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              We sent a magic link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
              Click it to sign in — no password needed.
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}
              onClick={() => setSent(false)}
            >
              ← Back
            </button>
          </div>
        ) : (
          <>
            {/* Google OAuth */}
            <button
              onClick={signInWithGoogle}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '11px 16px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-primary)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontFamily: 'var(--font-sans)',
                marginBottom: 20,
              }}
              onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border-focus)'}
              onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.07 0-3.83-1.4-4.46-3.27H1.85v2.07A8 8 0 0 0 8.98 17z"/>
                <path fill="#FBBC05" d="M4.52 10.54A4.8 4.8 0 0 1 4.27 9c0-.53.09-1.05.25-1.54V5.39H1.85A8 8 0 0 0 .98 9c0 1.29.31 2.51.87 3.61l2.67-2.07z"/>
                <path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.13 4.39l2.67 2.07c.63-1.87 2.4-3.27 4.46-3.27-.01 0-.01 0 0-.61z"/>
              </svg>
              Continue with Google
            </button>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* Magic link */}
            <div>
              <div className="form-group">
                <label>Email address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div style={{
                  background: 'var(--red-dim)', border: '1px solid var(--red)',
                  borderRadius: 'var(--radius)', padding: '8px 12px',
                  fontSize: 12, color: 'var(--red)', marginBottom: 14,
                }}>
                  {error}
                </div>
              )}
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
                disabled={loading}
                onClick={handleMagicLink}
              >
                {loading ? 'Sending…' : 'Send Magic Link'}
              </button>
            </div>

            <p style={{
              fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
              marginTop: 20, lineHeight: 1.6,
            }}>
              By signing in you agree to keep your API keys secure.<br />
              This is a private platform — invite only.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
