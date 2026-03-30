import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// No system prompt here — it lives server-side only in /api/journal-ai.js (security)

export default function Journal() {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: "Welcome back. What would you like to work on today? You can describe a trade, talk through a setup, or just check in."
  }])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [tab, setTab] = useState('chat')
  const [entries, setEntries] = useState([])
  const [saving, setSaving] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [mood, setMood] = useState(null)
  const [tradeForm, setTradeForm] = useState({ symbol: '', direction: 'long', entry: '', exit: '', stop: '', target: '', size: '', notes: '' })
  const chatEndRef = useRef(null)

  // Mood options
  const moods = [
    { id: 'calm', label: 'Calm', icon: '\u{1F9D8}' },
    { id: 'confident', label: 'Confident', icon: '\u{1F4AA}' },
    { id: 'neutral', label: 'Neutral', icon: '\u{1F610}' },
    { id: 'anxious', label: 'Anxious', icon: '\u{1F630}' },
    { id: 'tilted', label: 'Tilted', icon: '\u{1F525}' }
  ]

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load journal entries
  useEffect(() => {
    async function loadEntries() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('journal_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
        if (data) setEntries(data)
      }
    }
    loadEntries()
  }, [])

  // Send message to /api/journal-ai (server-side, fortified)
  async function sendMessage(text) {
    const msg = text || input.trim()
    if (!msg || chatLoading) return
    setInput('')
    const userMsg = { role: 'user', content: msg }
    const updatedMsgs = [...messages, userMsg]
    setMessages(updatedMsgs)
    setChatLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id || 'anonymous'

      const res = await fetch('/api/journal-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: updatedMsgs.slice(-10).map(m => ({ role: m.role, content: m.content })),
          userId: userId,
          mood: mood
        })
      })

      const d = await res.json()
      const reply = d.reply || d.content?.[0]?.text || 'I couldn\'t process that. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      if (d.remaining !== undefined) setRemaining(d.remaining)
      if (d.rateLimited) setRemaining(0)
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection issue. Please try again.' }])
    } finally {
      setChatLoading(false)
      setMood(null) // Reset mood after sending
    }
  }

  // Save trade entry
  async function saveEntry() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const entry = {
          user_id: user.id,
          type: 'trade',
          symbol: tradeForm.symbol.toUpperCase(),
          content: JSON.stringify(tradeForm),
          created_at: new Date().toISOString()
        }
        await supabase.from('journal_entries').insert(entry)
        setEntries(prev => [entry, ...prev])
        setTradeForm({ symbol: '', direction: 'long', entry: '', exit: '', stop: '', target: '', size: '', notes: '' })
        setTab('chat')
        // Auto-send to AI for review
        const summary = tradeForm.direction + ' ' + tradeForm.symbol.toUpperCase() +
          (tradeForm.entry ? ' at ' + tradeForm.entry : '') +
          (tradeForm.stop ? ', stop ' + tradeForm.stop : '') +
          (tradeForm.target ? ', target ' + tradeForm.target : '') +
          (tradeForm.size ? ', size ' + tradeForm.size : '') +
          (tradeForm.notes ? '. ' + tradeForm.notes : '')
        sendMessage('I just logged a trade: ' + summary + '. Can you review this setup?')
      }
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  // Quick prompts
  const quickPrompts = [
    'I need help reviewing my last trade',
    'What patterns am I repeating?',
    'Help me build a pre-trade checklist',
    'How can I improve my risk management?'
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 12px' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#f0f0f0' }}>
          Trading Journal
          <span style={{ fontSize: 13, fontWeight: 400, color: '#888', marginLeft: 10 }}>AI Coaching</span>
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('chat')}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            background: tab === 'chat' ? '#7c3aed' : '#1e1e2e', color: tab === 'chat' ? '#fff' : '#999' }}>
          Coach
        </button>
        <button onClick={() => setTab('log')}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            background: tab === 'log' ? '#7c3aed' : '#1e1e2e', color: tab === 'log' ? '#fff' : '#999' }}>
          + Log Trade
        </button>
        <button onClick={() => setTab('history')}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            background: tab === 'history' ? '#7c3aed' : '#1e1e2e', color: tab === 'history' ? '#fff' : '#999' }}>
          History ({entries.filter(e => e.type === 'trade').length})
        </button>
      </div>

      {/* ============ COACH TAB ============ */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)' }}>
          {/* Chat messages */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 10
              }}>
                <div style={{
                  maxWidth: '85%', padding: '12px 16px', borderRadius: 14,
                  background: m.role === 'user' ? '#7c3aed' : '#1e1e2e',
                  color: m.role === 'user' ? '#fff' : '#e0e0e0',
                  fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                  borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
                <div style={{ padding: '12px 20px', borderRadius: 14, background: '#1e1e2e', color: '#888', fontSize: 14, borderBottomLeftRadius: 4 }}>
                  Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick prompts (only show at start) */}
          {messages.length <= 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
              {quickPrompts.map((p, i) => (
                <button key={i} onClick={() => sendMessage(p)}
                  style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid #333', background: '#151520',
                    color: '#aaa', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Mood selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
            <span style={{ fontSize: 11, color: '#666', marginRight: 4 }}>Mood:</span>
            {moods.map(m => (
              <button key={m.id} onClick={() => setMood(mood === m.id ? null : m.id)}
                title={m.label}
                style={{
                  padding: '4px 8px', borderRadius: 12, border: mood === m.id ? '1px solid #7c3aed' : '1px solid #333',
                  background: mood === m.id ? '#2a1a4e' : 'transparent', cursor: 'pointer', fontSize: 16,
                  opacity: mood && mood !== m.id ? 0.4 : 1, transition: 'all 0.15s'
                }}>
                {m.icon}
              </button>
            ))}
            {remaining !== null && (
              <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>
                {remaining} sessions left today
              </span>
            )}
          </div>

          {/* Chat input */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Talk to your AI coach... (Enter to send)"
              disabled={chatLoading}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid #333',
                background: '#0d0d15', color: '#e0e0e0', fontSize: 14, outline: 'none',
              }}
            />
            <button onClick={() => sendMessage()}
              disabled={chatLoading || !input.trim()}
              style={{
                padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: chatLoading ? '#333' : '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 14
              }}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* ============ LOG TRADE TAB ============ */}
      {tab === 'log' && (
        <div style={{ maxWidth: 500 }}>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
            Log a trade and the AI will automatically review your setup.
          </p>
          {[
            { key: 'symbol', label: 'Symbol', placeholder: 'NVDA', type: 'text' },
            { key: 'entry', label: 'Entry Price', placeholder: '165.00', type: 'number' },
            { key: 'stop', label: 'Stop Loss', placeholder: '158.00', type: 'number' },
            { key: 'target', label: 'Target', placeholder: '180.00', type: 'number' },
            { key: 'size', label: 'Position Size', placeholder: '100 shares', type: 'text' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input
                value={tradeForm[f.key]}
                onChange={e => setTradeForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                type={f.type}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
                  background: '#0d0d15', color: '#e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>
          ))}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Direction</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['long', 'short'].map(d => (
                <button key={d} onClick={() => setTradeForm(prev => ({ ...prev, direction: d }))}
                  style={{
                    padding: '8px 20px', borderRadius: 8, border: '1px solid #333', cursor: 'pointer',
                    background: tradeForm.direction === d ? (d === 'long' ? '#0d4a2e' : '#4a0d0d') : '#151520',
                    color: tradeForm.direction === d ? (d === 'long' ? '#22c55e' : '#ef4444') : '#888', fontWeight: 600, fontSize: 13
                  }}>
                  {d === 'long' ? 'Long' : 'Short'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea
              value={tradeForm.notes}
              onChange={e => setTradeForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Why did you take this trade? What was your thesis?"
              rows={3}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
                background: '#0d0d15', color: '#e0e0e0', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box'
              }}
            />
          </div>
          <button onClick={saveEntry} disabled={saving || !tradeForm.symbol}
            style={{
              padding: '12px 28px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: tradeForm.symbol ? '#7c3aed' : '#333', color: '#fff', fontWeight: 700, fontSize: 15
            }}>
            {saving ? 'Saving...' : 'Log Trade & Get AI Review'}
          </button>
        </div>
      )}

      {/* ============ HISTORY TAB ============ */}
      {tab === 'history' && (
        <div>
          {entries.filter(e => e.type === 'trade').length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>No trades logged yet. Start by logging your first trade.</p>
          ) : (
            entries.filter(e => e.type === 'trade').map((entry, i) => {
              let data = {}
              try { data = JSON.parse(entry.content) } catch (e) {}
              return (
                <div key={i} style={{
                  padding: 16, marginBottom: 10, borderRadius: 10, background: '#1e1e2e',
                  border: '1px solid #2a2a3e'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#f0f0f0' }}>
                      {data.direction === 'short' ? '\u{1F534}' : '\u{1F7E2}'} {entry.symbol || data.symbol || '—'}
                    </span>
                    <span style={{ fontSize: 12, color: '#666' }}>
                      {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#999', marginTop: 6 }}>
                    {data.direction || 'long'} | Entry: {data.entry || '—'} | Stop: {data.stop || '—'} | Target: {data.target || '—'}
                  </div>
                  {data.notes && <div style={{ fontSize: 13, color: '#777', marginTop: 6, fontStyle: 'italic' }}>{data.notes}</div>}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
