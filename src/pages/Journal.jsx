import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { renderMarkdown, renderInline } from '../lib/markdown'

export default function Journal() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [tab, setTab] = useState('chat')
  const [entries, setEntries] = useState([])
  const [saving, setSaving] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [mood, setMood] = useState(null)
  const [userId, setUserId] = useState(null)
  const [briefingLoaded, setBriefingLoaded] = useState(false)
  const [tradeForm, setTradeForm] = useState({ symbol: '', direction: 'long', entry: '', exit: '', stop: '', target: '', size: '', notes: '' })
  const chatEndRef = useRef(null)

  const moods = [
    { id: 'calm', label: 'Calm', icon: '\u{1F9D8}' },
    { id: 'confident', label: 'Confident', icon: '\u{1F4AA}' },
    { id: 'neutral', label: 'Neutral', icon: '\u{1F610}' },
    { id: 'anxious', label: 'Anxious', icon: '\u{1F630}' },
    { id: 'tilted', label: 'Tilted', icon: '\u{1F525}' }
  ]

  // Auto-scroll chat
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Init: get user, load entries, load morning briefing
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // Load journal entries
      const { data } = await supabase.from('journal_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
      if (data) setEntries(data)

      // Load morning briefing
      if (!briefingLoaded) {
        try {
          const res = await fetch('/api/journal-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'briefing', userId: user.id })
          })
          const d = await res.json()
          if (d.briefing) {
            setMessages([{ role: 'assistant', content: d.briefing }])
          } else {
            setMessages([{ role: 'assistant', content: 'Welcome back. What would you like to work on today?' }])
          }
        } catch (e) {
          setMessages([{ role: 'assistant', content: 'Welcome back. What would you like to work on today?' }])
        }
        setBriefingLoaded(true)
      }
    }
    init()
  }, [])

  // Send message
  async function sendMessage(text) {
    const msg = (text || input).trim()
    if (!msg || chatLoading) return
    setInput('')
    const userMsg = { role: 'user', content: msg }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setChatLoading(true)

    try {
      const uid = userId || 'anonymous'
      const res = await fetch('/api/journal-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: updated.slice(-10).map(function(m) { return { role: m.role, content: m.content } }),
          userId: uid,
          mood: mood
        })
      })
      const d = await res.json()
      const reply = d.reply || 'I couldn\'t process that. Please try again.'
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: reply, parsedTrade: d.parsedTrade }] })
      if (d.remaining !== undefined) setRemaining(d.remaining)
      if (d.rateLimited) setRemaining(0)

      // If a trade was auto-parsed, refresh entries
      if (d.parsedTrade) {
        const { data } = await supabase.from('journal_entries').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(50)
        if (data) setEntries(data)
      }
    } catch (e) {
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: 'Connection issue. Please try again.' }] })
    } finally {
      setChatLoading(false)
      setMood(null)
    }
  }

  // Save trade from form
  async function saveEntry() {
    setSaving(true)
    try {
      if (userId) {
        const entry = {
          user_id: userId, type: 'trade', symbol: tradeForm.symbol.toUpperCase(),
          content: JSON.stringify(tradeForm), created_at: new Date().toISOString()
        }
        await supabase.from('journal_entries').insert(entry)
        setEntries(function(prev) { return [entry, ...prev] })
        const summary = tradeForm.direction + ' ' + tradeForm.symbol.toUpperCase() +
          (tradeForm.entry ? ' at ' + tradeForm.entry : '') +
          (tradeForm.stop ? ', stop ' + tradeForm.stop : '') +
          (tradeForm.target ? ', target ' + tradeForm.target : '') +
          (tradeForm.notes ? '. ' + tradeForm.notes : '')
        setTradeForm({ symbol: '', direction: 'long', entry: '', exit: '', stop: '', target: '', size: '', notes: '' })
        setTab('chat')
        sendMessage('I just logged a trade: ' + summary + '. Can you review this setup?')
      }
    } catch (e) { /* silent */ }
    finally { setSaving(false) }
  }

  // Dynamic quick prompts based on context
  function getQuickPrompts() {
    const tradeCount = entries.filter(function(e) { return e.type === 'trade' }).length
    if (tradeCount === 0) {
      return [
        'I\'m new here \u2014 how does this work?',
        'Help me build a pre-trade checklist',
        'What should I track in my journal?'
      ]
    }
    const hour = new Date().getHours()
    if (hour < 10) {
      return [
        'What\'s my game plan today?',
        'Review my recent patterns',
        'How can I improve this week?'
      ]
    }
    return [
      'I need help reviewing my last trade',
      'What patterns am I repeating?',
      'How\'s my risk management looking?',
      'Help me plan my next trade'
    ]
  }

  // Render markdown content as JSX
  function renderContent(text) {
    if (!text) return null
    const blocks = renderMarkdown(text)
    return blocks.map(function(block) {
      if (block.type === 'ul') {
        return (
          <ul key={block.key} style={{ margin: '6px 0', paddingLeft: 20 }}>
            {block.items.map(function(item, j) {
              return <li key={j} style={{ marginBottom: 3, fontSize: 14 }}>{renderInlineJSX(item)}</li>
            })}
          </ul>
        )
      }
      if (block.type === 'ol') {
        return (
          <ol key={block.key} style={{ margin: '6px 0', paddingLeft: 20 }}>
            {block.items.map(function(item, j) {
              return <li key={j} style={{ marginBottom: 3, fontSize: 14 }}>{renderInlineJSX(item)}</li>
            })}
          </ol>
        )
      }
      return <p key={block.key} style={{ margin: '6px 0', fontSize: 14, lineHeight: 1.6 }}>{renderInlineJSX(block.text)}</p>
    })
  }

  function renderInlineJSX(text) {
    if (!text) return text
    const parts = renderInline(text)
    if (!Array.isArray(parts)) return text
    return parts.map(function(p) {
      if (p.type === 'bold') return <strong key={p.key} style={{ color: '#e8e8f0' }}>{p.content}</strong>
      if (p.type === 'italic') return <em key={p.key}>{p.content}</em>
      if (p.type === 'code') return <code key={p.key} style={{ background: '#2a2a3e', padding: '1px 5px', borderRadius: 3, fontSize: 13 }}>{p.content}</code>
      return <span key={p.key}>{p.content}</span>
    })
  }

  const quickPrompts = getQuickPrompts()

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
        {[
          { id: 'chat', label: 'Coach' },
          { id: 'log', label: '+ Log Trade' },
          { id: 'history', label: 'History (' + entries.filter(function(e) { return e.type === 'trade' }).length + ')' }
        ].map(function(t) {
          return (
            <button key={t.id} onClick={function() { setTab(t.id) }}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                background: tab === t.id ? '#7c3aed' : '#1e1e2e', color: tab === t.id ? '#fff' : '#999', transition: 'all 0.15s' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ============ COACH TAB ============ */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)' }}>
          {/* Chat messages */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
            {messages.map(function(m, i) {
              return (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  <div style={{
                    maxWidth: '85%', padding: '12px 16px', borderRadius: 14,
                    background: m.role === 'user' ? '#7c3aed' : '#1a1a2e',
                    color: m.role === 'user' ? '#fff' : '#d0d0e0',
                    borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                    borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
                    border: m.role === 'user' ? 'none' : '1px solid #2a2a3e'
                  }}>
                    {m.role === 'user' ? (
                      <span style={{ fontSize: 14, lineHeight: 1.6 }}>{m.content}</span>
                    ) : (
                      renderContent(m.content)
                    )}
                    {m.parsedTrade && (
                      <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: '#0d3320', border: '1px solid #1a5c3a', fontSize: 12, color: '#4ade80' }}>
                        Trade logged: {m.parsedTrade.direction} {m.parsedTrade.symbol}
                        {m.parsedTrade.entry ? ' @ $' + m.parsedTrade.entry : ''}
                        {m.parsedTrade.stop ? ' | Stop: $' + m.parsedTrade.stop : ''}
                        {m.parsedTrade.target ? ' | Target: $' + m.parsedTrade.target : ''}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                <div style={{ padding: '12px 20px', borderRadius: 14, background: '#1a1a2e', border: '1px solid #2a2a3e', borderBottomLeftRadius: 4 }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 1, 2].map(function(j) {
                      return <div key={j} style={{
                        width: 6, height: 6, borderRadius: '50%', background: '#7c3aed',
                        animation: 'pulse 1.2s ease-in-out infinite', animationDelay: j * 0.2 + 's', opacity: 0.4
                      }} />
                    })}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
              {quickPrompts.map(function(p, i) {
                return (
                  <button key={i} onClick={function() { sendMessage(p) }}
                    style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid #333', background: '#151520',
                      color: '#aaa', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                    {p}
                  </button>
                )
              })}
            </div>
          )}

          {/* Mood selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
            <span style={{ fontSize: 11, color: '#555', marginRight: 4 }}>Mood:</span>
            {moods.map(function(m) {
              return (
                <button key={m.id} onClick={function() { setMood(mood === m.id ? null : m.id) }}
                  title={m.label}
                  style={{
                    padding: '4px 8px', borderRadius: 12, border: mood === m.id ? '1px solid #7c3aed' : '1px solid transparent',
                    background: mood === m.id ? '#2a1a4e' : 'transparent', cursor: 'pointer', fontSize: 16,
                    opacity: mood && mood !== m.id ? 0.3 : 1, transition: 'all 0.15s'
                  }}>
                  {m.icon}
                </button>
              )
            })}
            {remaining !== null && (
              <span style={{ fontSize: 11, color: '#444', marginLeft: 'auto' }}>
                {remaining > 0 ? remaining + ' sessions left today' : 'Daily limit reached'}
              </span>
            )}
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <input value={input}
              onChange={function(e) { setInput(e.target.value) }}
              onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) sendMessage() }}
              placeholder="Talk to your AI coach... (Enter to send)"
              disabled={chatLoading}
              style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid #2a2a3e', background: '#0d0d15', color: '#e0e0e0', fontSize: 14, outline: 'none' }}
            />
            <button onClick={function() { sendMessage() }}
              disabled={chatLoading || !input.trim()}
              style={{ padding: '12px 24px', borderRadius: 12, border: 'none', cursor: chatLoading ? 'default' : 'pointer', background: chatLoading || !input.trim() ? '#222' : '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 14, transition: 'all 0.15s' }}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* ============ LOG TRADE TAB ============ */}
      {tab === 'log' && (
        <div style={{ maxWidth: 500 }}>
          <p style={{ color: '#777', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            Log a trade and the AI will automatically review your setup. You can also just describe trades in the chat and they'll be auto-detected.
          </p>
          {[
            { key: 'symbol', label: 'Symbol', placeholder: 'NVDA', type: 'text' },
            { key: 'entry', label: 'Entry Price', placeholder: '165.00', type: 'number' },
            { key: 'stop', label: 'Stop Loss', placeholder: '158.00', type: 'number' },
            { key: 'target', label: 'Target', placeholder: '180.00', type: 'number' },
            { key: 'size', label: 'Position Size', placeholder: '100 shares', type: 'text' },
          ].map(function(f) {
            return (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input value={tradeForm[f.key]}
                  onChange={function(e) { setTradeForm(function(prev) { return Object.assign({}, prev, { [f.key]: e.target.value }) }) }}
                  placeholder={f.placeholder} type={f.type}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #2a2a3e', background: '#0d0d15', color: '#e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )
          })}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Direction</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['long', 'short'].map(function(d) {
                return (
                  <button key={d} onClick={function() { setTradeForm(function(prev) { return Object.assign({}, prev, { direction: d }) }) }}
                    style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #2a2a3e', cursor: 'pointer',
                      background: tradeForm.direction === d ? (d === 'long' ? '#0d3320' : '#330d0d') : '#151520',
                      color: tradeForm.direction === d ? (d === 'long' ? '#22c55e' : '#ef4444') : '#888', fontWeight: 600, fontSize: 13 }}>
                    {d === 'long' ? 'Long' : 'Short'}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea value={tradeForm.notes}
              onChange={function(e) { setTradeForm(function(prev) { return Object.assign({}, prev, { notes: e.target.value }) }) }}
              placeholder="Why did you take this trade? What was your thesis?"
              rows={3}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #2a2a3e', background: '#0d0d15', color: '#e0e0e0', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <button onClick={saveEntry} disabled={saving || !tradeForm.symbol}
            style={{ padding: '12px 28px', borderRadius: 10, border: 'none', cursor: tradeForm.symbol ? 'pointer' : 'default',
              background: tradeForm.symbol ? '#7c3aed' : '#222', color: '#fff', fontWeight: 700, fontSize: 15, transition: 'all 0.15s' }}>
            {saving ? 'Saving...' : 'Log Trade & Get AI Review'}
          </button>
        </div>
      )}

      {/* ============ HISTORY TAB ============ */}
      {tab === 'history' && (
        <div>
          {entries.filter(function(e) { return e.type === 'trade' }).length === 0 ? (
            <p style={{ color: '#555', textAlign: 'center', padding: 40 }}>No trades logged yet. Start by logging your first trade or describe one in the chat.</p>
          ) : (
            entries.filter(function(e) { return e.type === 'trade' }).map(function(entry, i) {
              var data = {}
              try { data = JSON.parse(entry.content) } catch (e) { /* skip */ }
              return (
                <div key={i} style={{ padding: 16, marginBottom: 10, borderRadius: 10, background: '#1a1a2e', border: '1px solid #2a2a3e' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#f0f0f0' }}>
                      <span style={{ color: data.direction === 'short' ? '#ef4444' : '#22c55e', marginRight: 6 }}>
                        {data.direction === 'short' ? '\u25BC' : '\u25B2'}
                      </span>
                      {entry.symbol || data.symbol || '\u2014'}
                    </span>
                    <span style={{ fontSize: 12, color: '#555' }}>
                      {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
                    {(data.direction || 'long').toUpperCase()} | Entry: {data.entry || '\u2014'} | Stop: {data.stop || '\u2014'} | Target: {data.target || '\u2014'}
                  </div>
                  {data.notes && <div style={{ fontSize: 13, color: '#666', marginTop: 6, fontStyle: 'italic' }}>{data.notes}</div>}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* CSS animation for typing indicator */}
      <style>{"\n        @keyframes pulse {\n          0%, 100% { opacity: 0.3; transform: scale(1); }\n          50% { opacity: 1; transform: scale(1.3); }\n        }\n      "}</style>
    </div>
  )
}
