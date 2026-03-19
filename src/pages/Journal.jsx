import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'

const STRATEGIES = ['Day Trade','Swing Trade','Position Trade','Options Play','Long-Term','Hedging']
const EMOTIONS = ['Confident','Cautious','FOMO','Fearful','Disciplined','Greedy','Patient','Anxious','Neutral']
const SETUPS = ['Breakout','Breakdown','Mean Reversion','Trend Follow','Earnings Play','News Catalyst','Technical Pattern','Options Strategy','Scalp']

const S = {
  page: { padding:24, fontFamily:'"DM Mono",monospace', minHeight:'100vh', color:'#e2e8f0' },
  hdr: { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 },
  h1: { color:'#e2e8f0',fontSize:20,fontWeight:700,margin:0 },
  sub: { color:'#4a5c7a',fontSize:11,marginTop:4 },
  btn: (bg='#2563eb',c='white') => ({ padding:'9px 18px',borderRadius:8,border:'none',fontSize:12,cursor:'pointer',fontFamily:'inherit',background:bg,color:c,fontWeight:600 }),
  card: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:12,padding:20,marginBottom:14 },
  lbl: { color:'#4a5c7a',fontSize:10,marginBottom:5,display:'block',textTransform:'uppercase',letterSpacing:'0.06em' },
  inp: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:8,padding:'10px 12px',color:'#e2e8f0',fontSize:13,fontFamily:'inherit',width:'100%',outline:'none',boxSizing:'border-box' },
  sel: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:8,padding:'10px 12px',color:'#e2e8f0',fontSize:13,fontFamily:'inherit',width:'100%',outline:'none',cursor:'pointer' },
  g2: { display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 },
  g3: { display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14 },
  g4: { display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14 },
}

function ChatBubble({ msg }) {
  const isAI = msg.role === 'assistant'
  return (
    <div style={{ display:'flex',justifyContent:isAI?'flex-start':'flex-end',marginBottom:14 }}>
      <div style={{
        maxWidth:'82%',
        background: isAI ? '#0d1117' : 'rgba(37,99,235,0.2)',
        border: `1px solid ${isAI ? '#1e2d3d' : 'rgba(37,99,235,0.4)'}`,
        borderRadius: isAI ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
        padding:'12px 16px', fontSize:13, color:'#c4d4e8', lineHeight:1.7,
      }}>
        {isAI && <div style={{ color:'#a78bfa',fontSize:10,fontWeight:700,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em' }}>&#x1F916; AnkushAI Journal Coach</div>}
        <div style={{ whiteSpace:'pre-wrap' }}>
          {msg.content.split('\n').map((line,i) => {
            const isBold = /^\*\*(.+)\*\*/.test(line.trim())
            const clean = line.replace(/\*\*/g,'')
            return isBold
              ? <div key={i} style={{ fontWeight:700,color:'#93c5fd',marginTop:i>0?10:0,marginBottom:4 }}>{clean}</div>
              : <div key={i}>{clean}</div>
          })}
        </div>
        <div style={{ color:'#4a5c7a',fontSize:10,marginTop:6 }}>{new Date(msg.ts).toLocaleTimeString()}</div>
      </div>
    </div>
  )
}

function JournalChat({ entry, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!entry) return
    const isOpts = entry.assetType === 'Options'
    const pnl = parseFloat(entry.pnl || 0)
    const wasGain = pnl > 0
    setMessages([{
      role:'assistant', ts:Date.now(),
      content: `Hey ${wasGain ? '— nice close today!' : '— tough one today.'}  I saw you ${entry.status === 'closed' ? 'closed out your' : 'opened a'} ${entry.ticker} ${isOpts ? `$${entry.strike} ${entry.optionType?.toUpperCase()}` : ''} position${entry.status === 'closed' ? ` for a ${wasGain ? '+' : ''}${pnl ? '$'+Math.abs(pnl).toFixed(0) : 'flat'}` : ''}.

${entry.status === 'closed' ? `Walk me through it — what was going through your head when you decided to ${wasGain ? 'take profits' : 'cut the position'}? Was it the chart, news, or did something feel off?` : `Tell me about your thesis here. What's the setup you're playing, and what would invalidate it?`}`
    }])
  }, [entry])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = { role:'user', ts:Date.now(), content:input.trim() }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    setLoading(true)
    const isOpts = entry?.assetType === 'Options'
    const pnl = parseFloat(entry?.pnl || 0)
    const system = `You are an elite trading journal coach and market analyst. Your role: help traders learn from decisions through Socratic questioning and honest market analysis.

TRADE CONTEXT:
Ticker: ${entry?.ticker} (${entry?.assetType})
${isOpts ? `Strike: $${entry?.strike} | Expiry: ${entry?.expiration} | ${entry?.optionType?.toUpperCase()} | ${entry?.contracts} contracts` : `${entry?.direction || 'Long'} ${entry?.quantity} shares @ $${entry?.entryPrice}`}
Strategy: ${entry?.strategy} | Setup: ${entry?.setup}
Entry Date: ${entry?.entryDate} | Status: ${entry?.status === 'closed' ? 'Closed' : 'Open'}
P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} ${pnl >= 0 ? '(WIN)' : '(LOSS)'}
Original Thesis: ${entry?.notes || 'Not recorded'}
Emotion at Entry: ${entry?.emotion || 'Not recorded'}

COACHING STYLE:
- Ask probing questions to surface the decision-making process
- Identify specific cognitive biases by name (FOMO, anchoring, disposition effect, etc.)
- Connect emotions to outcomes — this is where real learning happens
- If it was good, reinforce WHY the process was good, not just the outcome
- If it was poor, be direct but constructive about the specific failure
- Keep responses 3-5 sentences max unless they ask for deep analysis
- Never give future trade recommendations`

    fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:600, system, messages: newMsgs.map(m => ({ role:m.role, content:m.content })) })
    }).then(r=>r.json()).then(d => {
      setMessages(p => [...p, { role:'assistant', ts:Date.now(), content:d.content?.[0]?.text || 'Connection issue — tell me more anyway.' }])
      setLoading(false)
    }).catch(() => {
      setMessages(p => [...p, { role:'assistant', ts:Date.now(), content:'Connection issue. But — what was the one thing you wish you had done differently?' }])
      setLoading(false)
    })
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
      <div style={{ background:'#0a0f1a',border:'1px solid #2d3f55',borderRadius:16,width:'100%',maxWidth:700,height:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.8)' }}>
        <div style={{ padding:'16px 20px',borderBottom:'1px solid #1e2d3d',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div>
            <div style={{ color:'#a78bfa',fontSize:15,fontWeight:700 }}>&#x1F4DA; Journal Coach</div>
            <div style={{ color:'#4a5c7a',fontSize:11,marginTop:2 }}>{entry?.ticker} {entry?.strategy} &bull; {entry?.status === 'closed' ? 'Post-trade debrief' : 'Active position review'}</div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:20 }}>&times;</button>
        </div>
        <div style={{ flex:1,overflowY:'auto',padding:'16px 20px' }}>
          {messages.map((m,i) => <ChatBubble key={i} msg={m} />)}
          {loading && (
            <div style={{ display:'flex',justifyContent:'flex-start',marginBottom:14 }}>
              <div style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:'4px 14px 14px 14px',padding:'12px 16px',color:'#4a5c7a',fontSize:13 }}>&#x26A1; Thinking...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div style={{ padding:'12px 16px',borderTop:'1px solid #1e2d3d',display:'flex',gap:10 }}>
          <input style={{ ...S.inp,flex:1 }} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()} placeholder="Type your thoughts... (Enter to send)" disabled={loading} />
          <button onClick={send} disabled={!input.trim()||loading} style={{ ...S.btn(!input.trim()||loading?'#1e2d3d':'#2563eb'),padding:'9px 16px',opacity:!input.trim()||loading?0.5:1 }}>Send</button>
        </div>
      </div>
    </div>
  )
}

function EODDebrief({ entries, onClose }) {
  const [loading, setLoading] = useState(true)
  const [debrief, setDebrief] = useState('')

  useEffect(() => {
    const closedToday = entries.filter(e => {
      if (e.status !== 'closed') return false
      const today = new Date().toISOString().split('T')[0]
      return (e.exitDate === today || e.closedAt?.startsWith(today) || e.createdAt?.startsWith(today))
    })
    const positions = closedToday.length > 0 ? closedToday : entries.slice(0, 5)

    fetch('/api/eod-debrief', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ positions, userContext: `${entries.length} total trades in journal` })
    }).then(r=>r.json()).then(d => { setDebrief(d.debrief || 'Debrief unavailable.'); setLoading(false) })
      .catch(() => { setDebrief('Debrief service unavailable. Try again later.'); setLoading(false) })
  }, [entries])

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
      <div style={{ background:'#0a0f1a',border:'1px solid #2d3f55',borderRadius:16,padding:28,width:'100%',maxWidth:720,maxHeight:'84vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.8)' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20 }}>
          <div>
            <div style={{ color:'#f59e0b',fontSize:16,fontWeight:700 }}>&#x1F4C5; End-of-Day Debrief</div>
            <div style={{ color:'#4a5c7a',fontSize:11,marginTop:3 }}>AI analysis of today&apos;s trading decisions &bull; {new Date().toLocaleDateString()}</div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:20 }}>&times;</button>
        </div>
        {loading ? (
          <div style={{ color:'#4a5c7a',fontSize:13,padding:'32px 0',textAlign:'center' }}>
            <div style={{ fontSize:28,marginBottom:12,animation:'spin 1.2s linear infinite',display:'inline-block' }}>&#x26A1;</div>
            <div>Analyzing your trading day...</div>
          </div>
        ) : (
          <div style={{ color:'#c4d4e8',fontSize:13,lineHeight:1.78 }}>
            {debrief.split('\n').map((line,i) => {
              const isHeader = /^\*\*[A-Z]/.test(line.trim())
              const clean = line.replace(/\*\*/g,'')
              return isHeader
                ? <div key={i} style={{ color:'#f59e0b',fontWeight:700,marginTop:i>0?20:0,marginBottom:6,fontSize:12,textTransform:'uppercase',letterSpacing:'0.04em',borderBottom:'1px solid #1e2d3d',paddingBottom:6 }}>{clean}</div>
                : <div key={i} style={{ marginBottom:clean.trim()?4:10 }}>{clean}</div>
            })}
          </div>
        )}
        <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

function AddTradeModal({ onSave, onClose }) {
  const [f, setF] = useState({
    ticker:'',assetType:'Stock',strategy:'Swing Trade',direction:'Long',
    quantity:'',entryPrice:'',exitPrice:'',entryDate:new Date().toISOString().split('T')[0],
    exitDate:'',notes:'',lessonLearned:'',emotion:'Confident',setup:'Breakout',
    expiration:'',strike:'',optionType:'call',contracts:'1',
  })
  const set = (k,v) => setF(p=>({...p,[k]:v}))
  const isOpts = f.assetType === 'Options'
  const qty = isOpts ? parseFloat(f.contracts)*100 : parseFloat(f.quantity)
  const pnl = f.exitPrice && f.entryPrice ? ((parseFloat(f.exitPrice)-parseFloat(f.entryPrice))*(f.direction==='Short'?-1:1)*qty).toFixed(2) : null
  function save() {
    if (!f.ticker || !f.entryPrice) return
    onSave({ ...f, id:Date.now().toString(), pnl:pnl?parseFloat(pnl):0, status:f.exitPrice?'closed':'open', createdAt:new Date().toISOString() })
    onClose()
  }
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'24px 16px',overflowY:'auto' }}>
      <div style={{ background:'#0a0f1a',border:'1px solid #2d3f55',borderRadius:16,padding:28,width:'100%',maxWidth:820 }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22 }}>
          <h2 style={{ color:'#e2e8f0',margin:0,fontSize:18 }}>Log Trade</h2>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:22 }}>&times;</button>
        </div>
        <div style={{ ...S.g4,marginBottom:14 }}>
          <div><label style={S.lbl}>Ticker</label><input style={{ ...S.inp,textTransform:'uppercase' }} value={f.ticker} onChange={e=>set('ticker',e.target.value.toUpperCase())} placeholder="AAPL" /></div>
          <div><label style={S.lbl}>Asset Type</label><select style={S.sel} value={f.assetType} onChange={e=>set('assetType',e.target.value)}>{['Stock','Options','ETF','Crypto','Futures'].map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label style={S.lbl}>Strategy</label><select style={S.sel} value={f.strategy} onChange={e=>set('strategy',e.target.value)}>{STRATEGIES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><label style={S.lbl}>Setup</label><select style={S.sel} value={f.setup} onChange={e=>set('setup',e.target.value)}>{SETUPS.map(s=><option key={s}>{s}</option>)}</select></div>
        </div>
        {isOpts ? (
          <div style={{ ...S.g4,marginBottom:14 }}>
            <div><label style={S.lbl}>Expiration</label><input style={S.inp} value={f.expiration} onChange={e=>set('expiration',e.target.value)} placeholder="2025-01-17" /></div>
            <div><label style={S.lbl}>Strike</label><input style={S.inp} value={f.strike} onChange={e=>set('strike',e.target.value)} placeholder="185" /></div>
            <div><label style={S.lbl}>Call/Put</label><select style={S.sel} value={f.optionType} onChange={e=>set('optionType',e.target.value)}><option value="call">Call</option><option value="put">Put</option></select></div>
            <div><label style={S.lbl}>Contracts</label><input style={S.inp} type="number" min="1" value={f.contracts} onChange={e=>set('contracts',e.target.value)} /></div>
          </div>
        ) : (
          <div style={{ ...S.g3,marginBottom:14 }}>
            <div><label style={S.lbl}>Direction</label><select style={S.sel} value={f.direction} onChange={e=>set('direction',e.target.value)}><option>Long</option><option>Short</option></select></div>
            <div><label style={S.lbl}>Shares</label><input style={S.inp} type="number" value={f.quantity} onChange={e=>set('quantity',e.target.value)} placeholder="100" /></div>
            <div><label style={S.lbl}>Emotion at Entry</label><select style={S.sel} value={f.emotion} onChange={e=>set('emotion',e.target.value)}>{EMOTIONS.map(e=><option key={e}>{e}</option>)}</select></div>
          </div>
        )}
        <div style={{ ...S.g4,marginBottom:14 }}>
          <div><label style={S.lbl}>Entry Price ($)</label><input style={S.inp} type="number" step="0.01" value={f.entryPrice} onChange={e=>set('entryPrice',e.target.value)} placeholder="185.50" /></div>
          <div><label style={S.lbl}>Exit Price ($)</label><input style={S.inp} type="number" step="0.01" value={f.exitPrice} onChange={e=>set('exitPrice',e.target.value)} placeholder="190.00" /></div>
          <div><label style={S.lbl}>Entry Date</label><input style={S.inp} type="date" value={f.entryDate} onChange={e=>set('entryDate',e.target.value)} /></div>
          <div><label style={S.lbl}>Exit Date</label><input style={S.inp} type="date" value={f.exitDate} onChange={e=>set('exitDate',e.target.value)} /></div>
        </div>
        {pnl && (
          <div style={{ background:parseFloat(pnl)>=0?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',border:`1px solid ${parseFloat(pnl)>=0?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'}`,borderRadius:8,padding:'10px 14px',marginBottom:14 }}>
            <span style={{ color:'#4a5c7a',fontSize:11 }}>Realized P&amp;L: </span>
            <span style={{ color:parseFloat(pnl)>=0?'#10b981':'#ef4444',fontWeight:700,fontSize:15 }}>{parseFloat(pnl)>=0?'+':''}{pnl}</span>
          </div>
        )}
        <div style={{ marginBottom:14 }}>
          <label style={S.lbl}>Trade Thesis / Notes</label>
          <textarea style={{ ...S.inp,minHeight:64,resize:'vertical' }} value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Why did you enter? What was the catalyst? What were your targets?" />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={S.lbl}>Lesson Learned</label>
          <textarea style={{ ...S.inp,minHeight:52,resize:'vertical' }} value={f.lessonLearned} onChange={e=>set('lessonLearned',e.target.value)} placeholder="What would you do differently?" />
        </div>
        <div style={{ display:'flex',gap:10,justifyContent:'flex-end',borderTop:'1px solid #1e2d3d',paddingTop:16 }}>
          <button onClick={onClose} style={S.btn('#1e2d3d','#8b9fc0')}>Cancel</button>
          <button onClick={save} disabled={!f.ticker||!f.entryPrice} style={{ ...S.btn(),opacity:!f.ticker||!f.entryPrice?0.5:1 }}>Log Trade</button>
        </div>
      </div>
    </div>
  )
}

function EntryCard({ entry, onChat }) {
  const isOpts = entry.assetType === 'Options'
  const pnl = parseFloat(entry.pnl || 0)
  const up = pnl >= 0
  const sc = { 'Day Trade':'#f59e0b','Swing Trade':'#10b981','Position Trade':'#3b82f6','Options Play':'#8b5cf6','Long-Term':'#06b6d4','Hedging':'#64748b' }[entry.strategy]||'#4a5c7a'
  const ec = { 'Confident':'#10b981','Disciplined':'#3b82f6','Patient':'#06b6d4','Cautious':'#f59e0b','FOMO':'#f97316','Fearful':'#ef4444','Greedy':'#f97316','Anxious':'#f43f5e','Neutral':'#4a5c7a' }[entry.emotion]||'#4a5c7a'
  return (
    <div style={{ ...S.card,borderLeft:`3px solid ${entry.status==='closed'?(up?'#10b981':'#ef4444'):'#3b82f6'}` }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10 }}>
        <div>
          <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:4 }}>
            <span style={{ color:'#e2e8f0',fontSize:15,fontWeight:700 }}>{entry.ticker}</span>
            {isOpts && <span style={{ color:'#8b5cf6',fontSize:11,fontWeight:600,background:'rgba(139,92,246,0.15)',padding:'2px 8px',borderRadius:4 }}>{entry.optionType?.toUpperCase()} ${entry.strike} {entry.expiration}</span>}
            <span style={{ display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:10,fontWeight:700,color:sc,background:sc+'22',border:'1px solid '+sc+'44' }}>{entry.strategy}</span>
            {entry.setup && <span style={{ color:'#4a5c7a',fontSize:10,background:'#141b24',padding:'2px 8px',borderRadius:4 }}>{entry.setup}</span>}
            {entry.emotion && <span style={{ color:ec,fontSize:10,fontStyle:'italic' }}>{entry.emotion}</span>}
          </div>
          <div style={{ color:'#4a5c7a',fontSize:11 }}>{entry.entryDate}{entry.exitDate?' → '+entry.exitDate:''} &bull; {entry.status==='closed'?'Closed':'Open'}</div>
        </div>
        {entry.status==='closed' && (
          <div style={{ textAlign:'right' }}>
            <div style={{ color:up?'#10b981':'#ef4444',fontSize:17,fontWeight:700 }}>{up?'+':''}{pnl.toFixed(2)}</div>
            <div style={{ color:'#4a5c7a',fontSize:11 }}>in ${entry.entryPrice}{entry.exitPrice?' → out $'+entry.exitPrice:''}</div>
          </div>
        )}
      </div>
      {entry.notes && <div style={{ color:'#4a5c7a',fontSize:11,marginBottom:8,fontStyle:'italic',lineHeight:1.5 }}>{entry.notes}</div>}
      {entry.lessonLearned && (
        <div style={{ background:'rgba(16,185,129,0.07)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:6,padding:'8px 12px',marginBottom:10,fontSize:11,color:'#6ee7b7' }}>
          &#x1F4A1; {entry.lessonLearned}
        </div>
      )}
      <button onClick={()=>onChat(entry)} style={{ ...S.btn('rgba(167,139,250,0.15)','#a78bfa'),fontSize:11,padding:'6px 14px' }}>
        &#x1F4AC; Journal Chat
      </button>
    </div>
  )
}

export default function Journal() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [chatEntry, setChatEntry] = useState(null)
  const [showDebrief, setShowDebrief] = useState(false)
  const [filter, setFilter] = useState('All')
  const KEY = 'aai_journal_' + (user?.id || 'demo')

  useEffect(() => {
    try { const d = localStorage.getItem(KEY); if (d) setEntries(JSON.parse(d)) } catch(e) {}
  }, [user])

  const persist = e => { setEntries(e); localStorage.setItem(KEY, JSON.stringify(e)) }
  const add = e => persist([e, ...entries])

  const closed = entries.filter(e => e.status==='closed')
  const wins = closed.filter(e => parseFloat(e.pnl||0) > 0)
  const totalPnl = closed.reduce((s,e) => s+parseFloat(e.pnl||0), 0)
  const winRate = closed.length ? Math.round(wins.length/closed.length*100) : 0
  const avgPnl = closed.length ? (totalPnl/closed.length).toFixed(2) : 0
  const shown = filter==='All' ? entries : entries.filter(e => e.strategy===filter)

  return (
    <div style={S.page}>
      {showAdd && <AddTradeModal onSave={add} onClose={()=>setShowAdd(false)} />}
      {chatEntry && <JournalChat entry={chatEntry} onClose={()=>setChatEntry(null)} />}
      {showDebrief && <EODDebrief entries={entries} onClose={()=>setShowDebrief(false)} />}

      <div style={S.hdr}>
        <div>
          <h1 style={S.h1}>&#x1F4D4; Trading Journal</h1>
          <div style={S.sub}>{entries.length} trades &bull; AI coach available on every trade</div>
        </div>
        <div style={{ display:'flex',gap:10 }}>
          {entries.length > 0 && (
            <button style={S.btn('#92400e','#fcd34d')} onClick={()=>setShowDebrief(true)}>
              &#x1F4C5; EOD Debrief
            </button>
          )}
          <button style={S.btn()} onClick={()=>setShowAdd(true)}>+ New Entry</button>
        </div>
      </div>

      {closed.length > 0 && (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24 }}>
          {[
            { label:'Total P&L', val:(totalPnl>=0?'+':'')+totalPnl.toFixed(2), color:totalPnl>=0?'#10b981':'#ef4444' },
            { label:'Win Rate', val:winRate+'%', color:winRate>=50?'#10b981':'#f59e0b' },
            { label:'Avg P&L', val:(parseFloat(avgPnl)>=0?'+':'')+avgPnl, color:parseFloat(avgPnl)>=0?'#10b981':'#ef4444' },
            { label:'Total Trades', val:closed.length, color:'#e2e8f0' },
          ].map(({label,val,color}) => (
            <div key={label} style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:18 }}>
              <div style={{ color:'#4a5c7a',fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8 }}>{label}</div>
              <div style={{ color,fontSize:22,fontWeight:700 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex',gap:8,marginBottom:20,flexWrap:'wrap' }}>
        {['All',...STRATEGIES].map(s => (
          <button key={s} onClick={()=>setFilter(s)}
            style={{ padding:'5px 14px',borderRadius:20,border:'1px solid',fontSize:11,cursor:'pointer',fontFamily:'inherit',
              background:filter===s?'#1e40af':'transparent',color:filter===s?'#93c5fd':'#4a5c7a',borderColor:filter===s?'#1e40af':'#1e2d3d' }}>
            {s}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div style={{ ...S.card,textAlign:'center',padding:'56px 24px' }}>
          <div style={{ fontSize:42,marginBottom:14 }}>&#x1F4D4;</div>
          <div style={{ color:'#e2e8f0',fontSize:16,marginBottom:8 }}>No trades logged yet</div>
          <div style={{ color:'#4a5c7a',fontSize:12,marginBottom:22,maxWidth:400,margin:'0 auto 22px' }}>
            Log your trades and chat with your AI coach. After every close, your coach asks: <em style={{color:'#8b9fc0'}}>"What was going through your head?"</em>
          </div>
          <button style={S.btn()} onClick={()=>setShowAdd(true)}>Log First Trade</button>
        </div>
      ) : (
        <div>{shown.map(e => <EntryCard key={e.id} entry={e} onChat={setChatEntry} />)}</div>
      )}
    </div>
  )
}
