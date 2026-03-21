import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function EODDebrief() {
  const [debrief, setDebrief] = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    const { data } = await supabase.from('daily_recaps').select('*').order('created_at', { ascending: false }).limit(30)
    setHistory(data || [])
    if (data?.[0]) setDebrief(data[0])
  }

  async function generateDebrief() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/eod-debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ date: new Date().toISOString().split('T')[0] })
      })
      if (r.ok) {
        const d = await r.json()
        setDebrief(d)
        loadHistory()
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const sections = debrief?.sections || debrief?.content ? parseDebriefSections(debrief) : null

  function parseDebriefSections(d) {
    const content = typeof d === 'string' ? d : d?.content || d?.full_text || JSON.stringify(d)
    return [{ title: 'Market Summary', content }]
  }

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 3px' }}>🌙 EOD Debrief</h1>
          <div style={{ color: '#3d4e62', fontSize: 11 }}>AI-powered end-of-day market analysis · What moved · What it means · What to watch</div>
        </div>
        <button onClick={generateDebrief} disabled={loading} style={{ padding: '8px 18px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, cursor: loading ? 'default' : 'pointer', opacity: loading ? .6 : 1, fontWeight: 600 }}>
          {loading ? '⟳ Generating...' : '⚡ Generate Today\'s Debrief'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
        {/* History sidebar */}
        <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 10 }}>HISTORY</div>
          {history.length === 0 ? (
            <div style={{ color: '#3d4e62', fontSize: 11, textAlign: 'center', padding: 16 }}>No debriefs yet</div>
          ) : (
            history.map((h, i) => (
              <div key={h.id || i} onClick={() => setDebrief(h)} style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: debrief?.id === h.id ? 'rgba(37,99,235,0.1)' : 'none', marginBottom: 4 }}>
                <div style={{ color: '#f0f6ff', fontSize: 11, fontWeight: 600 }}>{h.date || h.created_at?.split('T')[0]}</div>
                <div style={{ color: '#3d4e62', fontSize: 10 }}>{h.market_mood || h.mood || 'Market recap'}</div>
              </div>
            ))
          )}
        </div>

        {/* Main content */}
        <div>
          {!debrief && !loading && (
            <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌙</div>
              <div style={{ color: '#f0f6ff', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No debrief yet for today</div>
              <div style={{ color: '#4a5c7a', fontSize: 12, marginBottom: 20 }}>Generate an AI-powered analysis of today's market action, sector rotation, and what to watch tomorrow</div>
              <button onClick={generateDebrief} style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Generate EOD Debrief</button>
            </div>
          )}

          {loading && (
            <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid rgba(96,165,250,.2)', borderTopColor: '#60a5fa', animation: 'spin .6s linear infinite', margin: '0 auto 16px' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ color: '#8b9fc0', fontSize: 13 }}>Analyzing today's market action...</div>
              <div style={{ color: '#3d4e62', fontSize: 11, marginTop: 8 }}>Fetching SPY, QQQ, sector performance, macro events, options flow...</div>
            </div>
          )}

          {debrief && !loading && (
            <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: '"Syne",sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                    {debrief.date || debrief.created_at?.split('T')[0] || 'Today'}
                  </div>
                  {debrief.market_mood && (
                    <div style={{ display: 'inline-block', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 6, padding: '2px 10px', color: '#60a5fa', fontSize: 10, fontFamily: '"DM Mono",monospace' }}>
                      {debrief.market_mood}
                    </div>
                  )}
                </div>
                {debrief.spy_change && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: parseFloat(debrief.spy_change) >= 0 ? '#10b981' : '#ef4444', fontFamily: '"DM Mono",monospace', fontSize: 18, fontWeight: 700 }}>SPY {debrief.spy_change}</div>
                  </div>
                )}
              </div>

              <div style={{ color: '#8b9fc0', fontSize: 12, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                {debrief.content || debrief.full_text || debrief.summary || 'No content available'}
              </div>

              {debrief.key_levels && (
                <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: 12 }}>
                  <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', marginBottom: 8 }}>KEY LEVELS TO WATCH</div>
                  <div style={{ color: '#8b9fc0', fontSize: 11 }}>{debrief.key_levels}</div>
                </div>
              )}

              {debrief.tomorrow_focus && (
                <div style={{ marginTop: 12, background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.12)', borderRadius: 8, padding: 12 }}>
                  <div style={{ color: '#60a5fa', fontSize: 9, fontFamily: '"DM Mono",monospace', marginBottom: 8 }}>TOMORROW'S FOCUS</div>
                  <div style={{ color: '#8b9fc0', fontSize: 11 }}>{debrief.tomorrow_focus}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
