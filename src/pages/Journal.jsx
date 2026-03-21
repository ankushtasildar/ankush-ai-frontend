import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const COACH_SYSTEM = `You are AnkushAI's Trading Journal Coach — a professional trading psychologist and performance analyst. Review the trader's entries, identify emotional patterns, cognitive biases, and behavioral tendencies. Give specific actionable feedback. Track: revenge trading, FOMO, overconfidence, hesitation, discipline. Be honest and direct. Keep responses to 3-4 paragraphs max.`

export default function Journal() {
  const [entries, setEntries] = useState([])
  const [messages, setMessages] = useState([{role:'assistant',content:"Welcome back. I've reviewed your trading journal. What would you like to work on today? You can describe a recent trade, ask about your patterns, or just talk through what's on your mind."}])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [tab, setTab] = useState('chat')
  const [form, setForm] = useState({symbol:'',side:'long',pnl:'',setup:'',emotion:'',notes:''})
  const [saving, setSaving] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(()=>{ loadEntries() },[])
  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:'smooth'}) },[messages])

  async function loadEntries() {
    const {data:{user}} = await supabase.auth.getUser()
    if(!user) return
    const {data} = await supabase.from('journal_entries').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50)
    setEntries(data||[])
  }

  async function sendMessage() {
    if(!input.trim()||chatLoading) return
    const userMsg = input.trim()
    setInput('')
    const msgs = [...messages,{role:'user',content:userMsg}]
    setMessages(msgs)
    setChatLoading(true)
    try {
      const context = entries.slice(0,8).map(e=>`[${new Date(e.created_at).toLocaleDateString()}] ${e.symbol||''} ${e.side||''} P&L:${e.pnl||0} Mindset:${e.emotion_score||'?'} Notes:${e.notes||''}`).join('\n')
      const system = COACH_SYSTEM+(entries.length?`\n\nJOURNAL (recent ${Math.min(8,entries.length)} entries):\n`+context:'\n\nNo entries yet.')
      const r = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,system,messages:msgs.map(m=>({role:m.role,content:m.content}))})
      })
      const d = await r.json()
      setMessages(p=>[...p,{role:'assistant',content:d.content?.[0]?.text||'Error'}])
    } catch(e){setMessages(p=>[...p,{role:'assistant',content:'Error: '+e.message}])}
    setChatLoading(false)
  }

  async function saveEntry() {
    setSaving(true)
    const {data:{user}} = await supabase.auth.getUser()
    if(user){
      await supabase.from('journal_entries').insert({user_id:user.id,symbol:form.symbol.toUpperCase(),side:form.side,pnl:parseFloat(form.pnl)||0,setup_type:form.setup,emotion_score:form.emotion,notes:form.notes})
      const summary=`New trade logged: ${form.symbol} ${form.side}, P&L: ${form.pnl}, mindset: ${form.emotion}. Notes: ${form.notes}`
      setForm({symbol:'',side:'long',pnl:'',setup:'',emotion:'',notes:''})
      await loadEntries()
      setTab('chat'); setInput(summary)
    }
    setSaving(false)
  }

  const bg='var(--bg-base)',card='var(--bg-card)',brd='1px solid var(--border)'
  const S={
    page:{background:bg,minHeight:'100vh',display:'flex',flexDirection:'column',fontFamily:'var(--font)',color:'var(--text-primary)'},
    hdr:{padding:'14px 16px 0',display:'flex',alignItems:'center',gap:10},
    ttl:{fontSize:20,fontWeight:700},
    tabs:{display:'flex',gap:6,padding:'10px 16px'},
    tab:a=>({padding:'6px 16px',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13,border:a?'none':brd,background:a?'var(--accent)':'transparent',color:a?'#fff':'var(--text-secondary)'}),
    chatWrap:{flex:1,overflowY:'auto',padding:'0 16px 8px',display:'flex',flexDirection:'column',gap:8,maxHeight:'calc(100vh - 220px)'},
    bubble:r=>({maxWidth:'78%',alignSelf:r==='user'?'flex-end':'flex-start',background:r==='user'?'var(--accent)':card,border:r==='assistant'?brd:'none',borderRadius:12,padding:'10px 14px',fontSize:13.5,lineHeight:1.65,color:r==='user'?'#fff':'var(--text-primary)',whiteSpace:'pre-wrap'}),
    inputRow:{display:'flex',gap:8,padding:'8px 16px 14px'},
    ta:{flex:1,background:card,border:brd,borderRadius:10,color:'var(--text-primary)',padding:'10px 14px',fontSize:13,resize:'none'},
    send:{background:'var(--accent)',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',cursor:'pointer',fontWeight:700,alignSelf:'flex-end'},
    form:{background:card,border:brd,borderRadius:12,padding:16,margin:'0 16px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10},
    fi:{background:bg,border:brd,borderRadius:8,color:'var(--text-primary)',padding:'8px 10px',fontSize:13,width:'100%'},
    fl:{fontSize:11,color:'var(--text-muted)',marginBottom:2,display:'block'},
    saveBtn:{gridColumn:'1/-1',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,padding:10,cursor:'pointer',fontWeight:700,fontSize:14},
    entries:{padding:'10px 16px',overflowY:'auto'},
    eRow:{background:card,border:brd,borderRadius:10,padding:'10px 14px',marginBottom:8},
  }

  return (
    <div style={S.page}>
      <div style={S.hdr}><span style={S.ttl}>📓 Trading Journal</span><span style={{fontSize:13,color:'var(--text-muted)'}}>AI Coaching</span></div>
      <div style={S.tabs}>
        <button style={S.tab(tab==='chat')} onClick={()=>setTab('chat')}>💬 Coach</button>
        <button style={S.tab(tab==='log')} onClick={()=>setTab('log')}>+ Log Trade</button>
        <button style={S.tab(tab==='entries')} onClick={()=>setTab('entries')}>📋 History ({entries.length})</button>
      </div>

      {tab==='chat'&&<>
        <div style={S.chatWrap}>
          {messages.map((m,i)=><div key={i} style={S.bubble(m.role)}>{m.content}</div>)}
          {chatLoading&&<div style={S.bubble('assistant')}>⏳ Analyzing...</div>}
          <div ref={chatEndRef}/>
        </div>
        <div style={S.inputRow}>
          <textarea style={S.ta} rows={2} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),sendMessage())}
            placeholder="Talk to your AI coach... (Enter to send)"/>
          <button style={S.send} onClick={sendMessage} disabled={chatLoading}>Send</button>
        </div>
      </>}

      {tab==='log'&&<div style={S.form}>
        <div><label style={S.fl}>Symbol</label><input style={S.fi} value={form.symbol} onChange={e=>setForm({...form,symbol:e.target.value.toUpperCase()})} placeholder="NVDA"/></div>
        <div><label style={S.fl}>Side</label><select style={S.fi} value={form.side} onChange={e=>setForm({...form,side:e.target.value})}><option value="long">Long</option><option value="short">Short</option><option value="call">Call</option><option value="put">Put</option></select></div>
        <div><label style={S.fl}>P&L ($)</label><input style={S.fi} type="number" value={form.pnl} onChange={e=>setForm({...form,pnl:e.target.value})} placeholder="250"/></div>
        <div><label style={S.fl}>Setup Type</label><input style={S.fi} value={form.setup} onChange={e=>setForm({...form,setup:e.target.value})} placeholder="EMA breakout"/></div>
        <div><label style={S.fl}>Mindset</label><select style={S.fi} value={form.emotion} onChange={e=>setForm({...form,emotion:e.target.value})}><option value="">Select...</option><option>Calm & Focused</option><option>Anxious</option><option>Overconfident</option><option>FOMO</option><option>Revenge Mode</option><option>Disciplined</option></select></div>
        <div style={{gridColumn:'1/-1'}}><label style={S.fl}>Notes</label><textarea style={{...S.fi,resize:'vertical'}} rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="What happened? What would you change?"/></div>
        <button style={S.saveBtn} onClick={saveEntry} disabled={saving}>{saving?'Saving...':'💾 Save & Send to Coach'}</button>
      </div>}

      {tab==='entries'&&<div style={S.entries}>
        {entries.length===0&&<div style={{color:'var(--text-muted)',textAlign:'center',padding:40}}>No entries yet. Log your first trade!</div>}
        {entries.map((e,i)=><div key={i} style={S.eRow}>
          <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:4}}>
            <strong>{e.symbol||'—'}</strong>
            <span style={{fontSize:12,color:'var(--text-muted)',textTransform:'uppercase'}}>{e.side}</span>
            <span style={{fontWeight:700,color:e.pnl>=0?'#10b981':'#ef4444'}}>{e.pnl>=0?'+':''}${e.pnl}</span>
            <span style={{marginLeft:'auto',fontSize:12,color:'var(--text-muted)'}}>{new Date(e.created_at).toLocaleDateString()}</span>
          </div>
          {e.emotion_score&&<div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:3}}>Mindset: {e.emotion_score}</div>}
          {e.notes&&<div style={{fontSize:13,lineHeight:1.5}}>{e.notes}</div>}
        </div>)}
      </div>}
    </div>
  )
}