/**
 * AuthCallback — handles both OAuth redirects and magic link clicks.
 * 
 * Supabase redirects here with either:
 * - #access_token=... (OAuth / magic link token in hash)
 * - ?code=... (PKCE flow)
 * - ?checkout=success (post-Stripe checkout)
 * 
 * Strategy:
 * 1. exchangeCodeForSession() handles PKCE code param
 * 2. getSession() handles hash tokens (Supabase processes these automatically)
 * 3. onAuthStateChange catches any async SIGNED_IN events
 * 4. Timeout extended to 15s with progress feedback — no more silent failures
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const done = useRef(false)
  const [status, setStatus] = useState('Completing sign in...')

  useEffect(() => {
    async function handleCallback() {
      if (done.current) return

      try {
        // Handle PKCE code exchange (newer Supabase OAuth flow)
        const code = searchParams.get('code')
        if (code) {
          setStatus('Verifying your account...')
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        }

        // Handle post-Stripe checkout redirect
        const checkout = searchParams.get('checkout')
        if (checkout === 'success') {
          setStatus('Activating your subscription...')
          // Small delay to let webhook fire
          await new Promise(r => setTimeout(r, 1500))
        }

        // getSession — covers hash tokens + already-authed sessions
        setStatus('Signing you in...')
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          done.current = true
          setStatus('Welcome! Redirecting...')
          navigate('/app', { replace: true })
          return
        }

        // Listen for async SIGNED_IN (magic link, slow OAuth)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (done.current) return
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
            done.current = true
            subscription.unsubscribe()
            setStatus('Welcome! Redirecting...')
            navigate('/app', { replace: true })
          }
        })

        // Extended timeout — 15s, with honest message
        const t = setTimeout(() => {
          if (!done.current) {
            done.current = true
            subscription.unsubscribe()
            setStatus('Session not found. Returning to home...')
            setTimeout(() => navigate('/', { replace: true }), 1000)
          }
        }, 15000)

        return () => {
          subscription.unsubscribe()
          clearTimeout(t)
        }
      } catch (err) {
        console.error('Auth callback error:', err)
        setStatus('Sign in failed. Returning to home...')
        setTimeout(() => navigate('/', { replace: true }), 2000)
      }
    }

    handleCallback()
  }, [navigate, searchParams])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#080c14',
      color: '#8b9fc0',
      fontFamily: '"DM Mono",monospace',
      fontSize: 13,
      gap: 20,
    }}>
      {/* Animated logo */}
      <div style={{
        fontSize: 36,
        animation: 'spin 1.2s linear infinite',
        display: 'inline-block',
      }}>⚡</div>

      {/* Progress bar */}
      <div style={{
        width: 200,
        height: 2,
        background: 'rgba(255,255,255,0.07)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          background: '#2563eb',
          borderRadius: 2,
          animation: 'progress 2s ease-in-out infinite',
        }} />
      </div>

      <div style={{ color: '#4a5c7a', fontSize: 12 }}>{status}</div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes progress {
          0% { width: 0%; margin-left: 0 }
          50% { width: 70%; margin-left: 15% }
          100% { width: 0%; margin-left: 100% }
        }
      `}</style>
    </div>
  )
}
