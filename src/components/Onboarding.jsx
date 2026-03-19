import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STEPS = [
  {
    id: 'welcome',
    icon: '⚡',
    title: "Welcome to AnkushAI",
    sub: "You're now part of an elite group of traders with institutional-grade intelligence at their fingertips.",
    cta: "Let's get started",
  },
  {
    id: 'explore',
    icon: '🗺️',
    title: "Your command center",
    sub: "Four powerful modules built for serious traders.",
    features: [
      { icon: '⚡', label: 'Overview', desc: 'Your real-time P&L dashboard with market pulse' },
      { icon: '📡', label: 'Signals', desc: 'AI-scored live trading signals with entry levels' },
      { icon: '📓', label: 'Journal', desc: 'Trade logging with equity curve analytics' },
      { icon: '💼', label: 'Portfolio', desc: 'Live holdings tracker with allocation analysis' },
    ],
    cta: 'Got it',
  },
  {
    id: 'shortcuts',
    icon: '⌨️',
    title: "Work at the speed of thought",
    sub: "Keyboard shortcuts let you navigate like a pro.",
    shortcuts: [
      { key: '1', desc: 'Go to Overview' },
      { key: '2', desc: 'Go to Signals' },
      { key: '3', desc: 'Go to Portfolio' },
      { key: '4', desc: 'Go to Journal' },
      { key: '[', desc: 'Toggle sidebar' },
      { key: '?', desc: 'Show all shortcuts' },
    ],
    cta: "I'm ready",
  },
  {
    id: 'coach',
    icon: '🤖',
    title: "Meet your AI trading coach",
    sub: "The 🤖 button in the bottom-right gives you instant access to institutional-grade AI analysis — market reads, trade theses, portfolio reviews, risk alerts.",
    cta: "Open the platform →",
  },
]

export default function Onboarding({ userId, onComplete }) {
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)

  async function next() {
    if (step === STEPS.length - 1) {
      // Mark onboarded
      try {
        await supabase.from('profiles').update({ onboarded: true }).eq('id', userId)
      } catch(e) {}
      setLeaving(true)
      setTimeout(onComplete, 400)
    } else {
      setLeaving(true)
      setTimeout(() => { setStep(s => s + 1); setLeaving(false) }, 200)
    }
  }

  const s = STEPS[step]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(4,8,16,0.92)', backdropFilter: 'blur(16px)',
      zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <style>{`
        @keyframes ob-in { from{opacity:0;transform:scale(0.96) translateY(16px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes ob-out { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(0.97)} }
      `}</style>

      <div style={{
        background: 'linear-gradient(135deg, #0d1420 0%, #0a0f1a 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 22,
        padding: '44px 44px 36px',
        width: '100%',
        maxWidth: 520,
        animation: leaving ? 'ob-out 0.2s ease forwards' : 'ob-in 0.25s ease',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Glow accent */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, background: 'radial-gradient(circle, rgba(37,99,235,0.15), transparent 70%)', pointerEvents: 'none' }} />

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 36 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? 24 : 6, height: 6, borderRadius: 3, background: i === step ? '#3b82f6' : i < step ? '#1d4ed8' : 'rgba(255,255,255,0.1)', transition: 'all 0.3s' }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ fontSize: 52, textAlign: 'center', marginBottom: 20, lineHeight: 1 }}>{s.icon}</div>

        {/* Title */}
        <h2 style={{ textAlign: 'center', color: '#f0f4ff', fontSize: 26, fontWeight: 800, fontFamily: '"Syne",sans-serif', marginBottom: 10, lineHeight: 1.2 }}>{s.title}</h2>

        {/* Sub */}
        <p style={{ textAlign: 'center', color: '#8b9fc0', fontSize: 15, lineHeight: 1.7, marginBottom: 28, fontFamily: '"DM Sans",sans-serif' }}>{s.sub}</p>

        {/* Features */}
        {s.features && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
            {s.features.map(f => (
              <div key={f.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{f.icon}</div>
                <div style={{ color: '#f0f4ff', fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{f.label}</div>
                <div style={{ color: '#4a5c7a', fontSize: 11, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* Shortcuts */}
        {s.shortcuts && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
            {s.shortcuts.map(sc => (
              <div key={sc.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 9 }}>
                <kbd style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: '"DM Mono",monospace', color: '#f0f4ff', fontWeight: 700, flexShrink: 0 }}>{sc.key}</kbd>
                <span style={{ color: '#8b9fc0', fontSize: 12 }}>{sc.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <button onClick={next} style={{
          width: '100%', padding: '15px', background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
          border: 'none', borderRadius: 12, color: 'white', fontSize: 14,
          fontFamily: '"DM Mono",monospace', fontWeight: 700, cursor: 'pointer',
          letterSpacing: '0.04em', transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(37,99,235,0.4)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}>
          {s.cta}
        </button>

        {step > 0 && (
          <button onClick={() => { setLeaving(true); setTimeout(() => { setStep(s => s - 1); setLeaving(false) }, 200) }}
            style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: '#2d3d50', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace', padding: '6px', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#8b9fc0'}
            onMouseLeave={e => e.currentTarget.style.color = '#2d3d50'}>
            ← Back
          </button>
        )}
      </div>
    </div>
  )
}
