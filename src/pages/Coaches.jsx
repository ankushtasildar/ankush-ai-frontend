import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SPECIALTIES = ['All', 'Options', 'Day Trading', 'Swing Trading', 'The Strat', 'Technical Analysis', 'Psychology', 'Risk Management', 'Futures', 'Crypto']

function StarRating({ rating, count }) {
  const stars = Math.round(rating || 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= stars ? '#f59e0b' : '#2a2f3a', fontSize: 12 }}>{'\u2605'}</span>
      ))}
      {count > 0 && <span style={{ fontSize: 9, color: '#4a5c7a', fontFamily: '"DM Mono",monospace', marginLeft: 4 }}>({count})</span>}
    </div>
  )
}

function CoachCard({ coach, onSelect }) {
  return (
    <div onClick={() => onSelect(coach)} style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(124,58,237,0.3)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', fontWeight: 700, fontSize: 14 }}>
            {coach.name ? coach.name.split(' ').map(w => w[0]).join('').substring(0, 2) : '?'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{coach.name}</div>
            <div style={{ fontSize: 10, color: '#4a5c7a' }}>{coach.experience || 'Trader'}</div>
          </div>
        </div>
        {coach.verified && <span style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4, padding: '1px 6px', color: '#10b981', fontSize: 8, fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>VERIFIED</span>}
      </div>

      <StarRating rating={coach.rating} count={coach.ratingCount || 0} />

      <div style={{ fontSize: 11, color: '#6b7a90', lineHeight: 1.5, marginTop: 8, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{coach.bio}</div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {(coach.specialties || []).slice(0, 3).map((s, i) => (
          <span key={i} style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 4, padding: '2px 8px', color: '#a78bfa', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>{s}</span>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#4a5c7a', fontFamily: '"DM Mono",monospace' }}>{coach.students || 0} students</div>
        {coach.pricing && coach.pricing.monthly && (
          <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 13, fontWeight: 700, color: '#10b981' }}>${coach.pricing.monthly}<span style={{ fontSize: 9, color: '#4a5c7a', fontWeight: 400 }}>/mo</span></div>
        )}
      </div>
    </div>
  )
}

export default function Coaches() {
  const [coaches, setCoaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [specialty, setSpecialty] = useState('All')
  const [sortBy, setSortBy] = useState('rating')
  const [selectedCoach, setSelectedCoach] = useState(null)
  const [showRegister, setShowRegister] = useState(false)
  const [aiMatch, setAiMatch] = useState(null)
  const [matchLoading, setMatchLoading] = useState(false)
  const [regForm, setRegForm] = useState({ name: '', bio: '', specialties: [], experience: '', monthlyPrice: '', contact: '' })

  useEffect(() => { loadCoaches() }, [specialty, sortBy])

  async function loadCoaches() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ action: 'browse', sort: sortBy })
      if (specialty !== 'All') params.append('specialty', specialty)
      const r = await fetch('/api/coaches?' + params.toString())
      if (r.ok) { const d = await r.json(); setCoaches(d.coaches || []) }
    } catch(e) {}
    setLoading(false)
  }

  async function findMatch() {
    setMatchLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const r = await fetch('/api/coaches?action=match&userId=' + (user ? user.id : 'anon') + '&need=' + encodeURIComponent(specialty !== 'All' ? specialty : 'general trading improvement'))
      if (r.ok) setAiMatch(await r.json())
    } catch(e) {}
    setMatchLoading(false)
  }

  async function registerCoach() {
    if (!regForm.name || !regForm.bio || regForm.specialties.length === 0) {
      alert('Please fill in name, bio, and select at least one specialty')
      return
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const r = await fetch('/api/coaches?action=register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register', name: regForm.name, bio: regForm.bio, specialties: regForm.specialties,
          experience: regForm.experience, pricing: { monthly: parseInt(regForm.monthlyPrice) || 0 },
          contact: regForm.contact, userId: user ? user.id : 'anon'
        })
      })
      if (r.ok) { const d = await r.json(); if (d.success) { alert('Profile created! Welcome to the marketplace.'); setShowRegister(false); loadCoaches() } }
    } catch(e) { alert('Error: ' + e.message) }
  }

  const tab = (active) => ({ padding: '5px 12px', background: active ? 'rgba(124,58,237,0.12)' : 'none', border: '1px solid ' + (active ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 5, color: active ? '#a78bfa' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' })

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 2px' }}>Coaching Marketplace</h1>
          <div style={{ color: '#3d4e62', fontSize: 11 }}>Hire expert coaches \u00B7 Learn proven strategies \u00B7 Join private groups</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={findMatch} disabled={matchLoading} style={{ padding: '8px 16px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, color: '#a78bfa', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
            {matchLoading ? 'Matching...' : 'AI Match Me'}
          </button>
          <button onClick={() => setShowRegister(!showRegister)} style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: '#10b981', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
            Become a Coach
          </button>
        </div>
      </div>

      {/* AI Match result */}
      {aiMatch && aiMatch.topMatch && (
        <div style={{ marginBottom: 14, padding: '12px 16px', background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 10 }}>
          <div style={{ fontSize: 9, color: '#a78bfa', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>AI RECOMMENDATION</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{aiMatch.topMatch.name}</div>
          <div style={{ fontSize: 11, color: '#6b7a90', lineHeight: 1.5 }}>{aiMatch.topMatch.reason}</div>
        </div>
      )}

      {/* Registration form */}
      {showRegister && (
        <div style={{ marginBottom: 14, padding: '16px', background: '#0c1018', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Register as a Coach</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: '#4a5c7a', marginBottom: 3, fontFamily: '"DM Mono",monospace' }}>NAME</div>
              <input value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} placeholder="Your full name" style={{ width: '100%', padding: '8px 10px', background: '#080c14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#f0f6ff', fontSize: 12, outline: 'none' }} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: '#4a5c7a', marginBottom: 3, fontFamily: '"DM Mono",monospace' }}>EXPERIENCE</div>
              <input value={regForm.experience} onChange={e => setRegForm({...regForm, experience: e.target.value})} placeholder="e.g. 5 years, institutional" style={{ width: '100%', padding: '8px 10px', background: '#080c14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#f0f6ff', fontSize: 12, outline: 'none' }} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 9, color: '#4a5c7a', marginBottom: 3, fontFamily: '"DM Mono",monospace' }}>BIO</div>
            <textarea value={regForm.bio} onChange={e => setRegForm({...regForm, bio: e.target.value})} placeholder="Describe your trading style, what you teach, and your track record" rows={3} style={{ width: '100%', padding: '8px 10px', background: '#080c14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#f0f6ff', fontSize: 12, outline: 'none', resize: 'vertical' }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 9, color: '#4a5c7a', marginBottom: 6, fontFamily: '"DM Mono",monospace' }}>SPECIALTIES (click to select)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SPECIALTIES.filter(s => s !== 'All').map(s => (
                <button key={s} onClick={() => { const has = regForm.specialties.includes(s); setRegForm({...regForm, specialties: has ? regForm.specialties.filter(x => x !== s) : [...regForm.specialties, s] }) }}
                  style={{ padding: '4px 10px', background: regForm.specialties.includes(s) ? 'rgba(124,58,237,0.15)' : 'transparent', border: '1px solid ' + (regForm.specialties.includes(s) ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.06)'), borderRadius: 5, color: regForm.specialties.includes(s) ? '#a78bfa' : '#4a5c7a', fontSize: 10, cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: '#4a5c7a', marginBottom: 3, fontFamily: '"DM Mono",monospace' }}>MONTHLY PRICE ($)</div>
              <input type="number" value={regForm.monthlyPrice} onChange={e => setRegForm({...regForm, monthlyPrice: e.target.value})} placeholder="99" style={{ width: '100%', padding: '8px 10px', background: '#080c14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#f0f6ff', fontSize: 12, outline: 'none' }} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: '#4a5c7a', marginBottom: 3, fontFamily: '"DM Mono",monospace' }}>CONTACT (Discord, Twitter, etc)</div>
              <input value={regForm.contact} onChange={e => setRegForm({...regForm, contact: e.target.value})} placeholder="@yourhandle" style={{ width: '100%', padding: '8px 10px', background: '#080c14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#f0f6ff', fontSize: 12, outline: 'none' }} />
            </div>
          </div>
          <button onClick={registerCoach} style={{ marginTop: 12, width: '100%', padding: '10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: '#10b981', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Create Coach Profile</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SPECIALTIES.map(s => <button key={s} style={tab(specialty === s)} onClick={() => setSpecialty(s)}>{s}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{k:'rating',l:'Top Rated'},{k:'students',l:'Most Students'},{k:'newest',l:'Newest'}].map(s => (
            <button key={s.k} style={tab(sortBy === s.k)} onClick={() => setSortBy(s.k)}>{s.l}</button>
          ))}
        </div>
      </div>

      {/* Coach grid or empty state */}
      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#3d4e62', fontSize: 12 }}>Loading coaches...</div>}

      {!loading && coaches.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u{1F393}'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Be the first coach on AnkushAI</div>
          <div style={{ fontSize: 12, color: '#4a5c7a', lineHeight: 1.6, maxWidth: 400, margin: '0 auto 16px' }}>
            Share your trading expertise. Earn from your knowledge. Build a community of traders who learn from your strategies.
          </div>
          <button onClick={() => setShowRegister(true)} style={{ padding: '10px 24px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, color: '#a78bfa', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Register as Coach</button>
        </div>
      )}

      {!loading && coaches.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {coaches.map((coach, i) => <CoachCard key={i} coach={coach} onSelect={setSelectedCoach} />)}
        </div>
      )}

      {/* Selected coach detail modal */}
      {selectedCoach && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedCoach(null)}>
          <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', fontWeight: 700, fontSize: 18 }}>
                {selectedCoach.name ? selectedCoach.name.split(' ').map(w => w[0]).join('').substring(0, 2) : '?'}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{selectedCoach.name}</div>
                <div style={{ fontSize: 11, color: '#4a5c7a' }}>{selectedCoach.experience}</div>
                <StarRating rating={selectedCoach.rating} count={selectedCoach.ratingCount || 0} />
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#8b9bb4', lineHeight: 1.7, marginBottom: 16 }}>{selectedCoach.bio}</div>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
              {(selectedCoach.specialties || []).map((s, i) => (
                <span key={i} style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 4, padding: '3px 10px', color: '#a78bfa', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>{s}</span>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Students', value: selectedCoach.students || 0, color: '#60a5fa' },
                { label: 'Rating', value: selectedCoach.rating ? selectedCoach.rating.toFixed(1) : 'New', color: '#f59e0b' },
                { label: 'Price', value: selectedCoach.pricing && selectedCoach.pricing.monthly ? '$' + selectedCoach.pricing.monthly + '/mo' : 'Contact', color: '#10b981' },
              ].map((s, i) => (
                <div key={i} style={{ background: '#080c14', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontFamily: '"DM Mono",monospace', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <button style={{ width: '100%', padding: '12px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)', borderRadius: 10, color: '#a78bfa', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
              Join This Coach \u2192
            </button>
            <button onClick={() => setSelectedCoach(null)} style={{ width: '100%', padding: '8px', background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: '#4a5c7a', fontSize: 10, cursor: 'pointer', marginTop: 8 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
