import { useState, useRef, useEffect } from 'react'
import { useMarket } from '../lib/useMarket.jsx'

const SUGGESTIONS = [
  'What does the current market mood mean for my portfolio?',
  'Analyze SPY momentum and give me a trade thesis',
  'What are the key risks I should watch today?',
  'Rate my win rate — am I improving?',
  'What signals should I focus on right now?',
]

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
      animation: 'msgIn 0.2s ease',
    }}>
      {!isUser && (
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, marginRight: 8, marginTop: 2 }}>⚡</div>
      )}
      <div style={{
        maxWidth: '82%',
        padding: '10px 14px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'rgba(255,255,255,0.06)',
        border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
        color: '#f0f4ff',
        fontSize: 13,
        lineHeight: 1.65,
        fontFamily: '"DM Sans",sans-serif',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
        {msg.loading && (
          <span style={{ display: 'inline-flex', gap: 3, marginLeft: 4, verticalAlign: 'middle' }}>
            {[0,1,2].map(i => (
              <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa', display: 'inline-block', animation: `dot 1.2s ease ${i*0.2}s infinite` }} />
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

export default function AIChat({ journalStats, marketContext }) {
  const { quotes, session } = useMarket()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hey! I'm your AI trading coach powered by AnkushAI. Ask me anything — market analysis, trade setups, portfolio review, risk assessment. What's on your mind?" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const quoteList = Object.values(quotes)
  const upCount = quoteList.filter(q => (q.changePct||0) > 0).length
  const downCount = quoteList.filter(q => (q.changePct||0) < 0).length

  async function sendMessage(text) {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')

    const userMsg = { role: 'user', content }
    const loadingMsg = { role: 'assistant', content: '', loading: true }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setLoading(true)

    // Build context for Claude
    const spyQuote = quoteList.find(q => q.symbol === 'SPY')
    const context = [
      `Market session: ${session}`,
      `Market breadth: ${upCount} advancing, ${downCount} declining`,
      spyQuote ? `SPY: $${spyQuote.price?.toFixed(2)} (${spyQuote.changePct?.toFixed(2)}%)` : '',
      journalStats ? `User stats: ${journalStats.winRate}% win rate, ${journalStats.totalTrades} trades, P&L: $${journalStats.totalPnl?.toFixed(2)}` : '',
      `Top holdings: ${quoteList.slice(0,5).map(q => `${q.symbol} ${q.changePct >= 0 ? '+' : ''}${q.changePct?.toFixed(2)}%`).join(', ')}`,
    ].filter(Boolean).join('\n')

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are an elite AI trading coach and market analyst for AnkushAI, a professional trading intelligence platform. You provide sharp, institutional-quality analysis. Be direct, specific, and actionable. Use bullet points for lists. Keep responses under 200 words unless deep analysis is needed. Never give personalized financial advice — frame as analysis and education.

Current market context:
${context}`,
          messages: messages.filter(m => !m.loading).concat(userMsg).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      })

      const data = await res.json()
      const reply = data.content?.[0]?.text || "I'm having trouble connecting right now. Try again in a moment."

      setMessages(prev => {
        const without = prev.filter(m => !m.loading)
        return [...without, { role: 'assistant', content: reply }]
      })

      if (!open) setUnread(n => n + 1)
    } catch(e) {
      setMessages(prev => {
        const without = prev.filter(m => !m.loading)
        return [...without, { role: 'assistant', content: 'Connection error. Please check your network and try again.' }]
      })
    }
    setLoading(false)
  }

  return (
    <>
      <style>{`
        @keyframes msgIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dot { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
        @keyframes chatOpen { from{opacity:0;transform:scale(0.95) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes badgePop { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }
        .ai-input { background:rgba(255,255,255,0.05); border:1.5px solid rgba(255,255,255,0.1); border-radius:10px; padding:10px 14px; color:#f0f4ff; font-family:"DM Sans",sans-serif; font-size:13px; outline:none; width:100%; box-sizing:border-box; resize:none; transition:border-color 0.15s; max-height:100px; overflow-y:auto; }
        .ai-input:focus { border-color:#3b82f6; }
        .ai-input::placeholder { color:#4a5c7a; }
        .suggestion-chip:hover { background:rgba(37,99,235,0.2)!important; border-color:rgba(37,99,235,0.4)!important; color:#93c5fd!important; }
        .ai-send:hover { background:linear-gradient(135deg,#1d4ed8,#6d28d9)!important; transform:scale(1.05); }
        .ai-fab:hover { transform:scale(1.08) translateY(-2px)!important; box-shadow:0 8px 32px rgba(37,99,235,0.5)!important; }
        .chat-scroll::-webkit-scrollbar { width:4px; }
        .chat-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:2px; }
      `}</style>

      {/* FAB button */}
      <button
        className="ai-fab"
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28, width: 56, height: 56,
          borderRadius: '50%',
          background: open ? 'linear-gradient(135deg,#1e293b,#0f172a)' : 'linear-gradient(135deg,#2563eb,#7c3aed)',
          border: open ? '1px solid rgba(255,255,255,0.12)' : 'none',
          color: 'white', fontSize: 22, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(37,99,235,0.4)',
          zIndex: 900, transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="AI Trading Coach"
      >
        {open ? '✕' : '🤖'}
        {!open && unread > 0 && (
          <div style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Mono",monospace', animation: 'badgePop 0.3s ease', border: '2px solid #080c14' }}>{unread}</div>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 96, right: 28,
          width: 380, height: 520,
          background: 'linear-gradient(180deg, #0d1420 0%, #0a0f1a 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 18,
          display: 'flex', flexDirection: 'column',
          zIndex: 800,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          animation: 'chatOpen 0.2s ease',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'rgba(37,99,235,0.06)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🤖</div>
            <div>
              <div style={{ color: '#f0f4ff', fontSize: 14, fontWeight: 700, fontFamily: '"Syne",sans-serif' }}>AI Trading Coach</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'dot 2s ease 0s infinite' }} />
                <span style={{ color: '#10b981', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '0.06em', fontWeight: 600 }}>ONLINE</span>
              </div>
            </div>
            <button onClick={() => setMessages([{ role: 'assistant', content: "Hey! I'm your AI trading coach. What's on your mind?" }])}
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#4a5c7a', padding: '4px 10px', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace', transition: 'all 0.15s' }}
              title="Clear chat">
              Clear
            </button>
          </div>

          {/* Messages */}
          <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px' }}>
            {messages.map((m, i) => <Message key={i} msg={m} />)}
            {messages.length === 1 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: '#4a5c7a', fontSize: 10, fontFamily: '"DM Mono",monospace', letterSpacing: '0.1em', marginBottom: 8, textAlign: 'center' }}>QUICK PROMPTS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SUGGESTIONS.slice(0, 3).map(s => (
                    <button key={s} className="suggestion-chip" onClick={() => sendMessage(s)}
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: '#8b9fc0', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: '"DM Sans",sans-serif', transition: 'all 0.15s' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                className="ai-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Ask about markets, signals, trades..."
                rows={1}
                disabled={loading}
              />
              <button
                className="ai-send"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', border: 'none', color: 'white', fontSize: 16, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', opacity: !input.trim() || loading ? 0.5 : 1 }}>
                ↑
              </button>
            </div>
            <div style={{ color: '#1a2535', fontSize: 9, fontFamily: '"DM Mono",monospace', textAlign: 'center', marginTop: 6 }}>
              Enter to send · Shift+Enter new line
            </div>
          </div>
        </div>
      )}
    </>
  )
}
