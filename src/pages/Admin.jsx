import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const SYS = `You are AnkushAI's Chief Investment Strategist Ã¢ÂÂ an institutional VP with 20+ years at Goldman Sachs, Citadel, and Two Sigma. Validate trading strategies with rigor: What is the edge? Is it durable? What kills it? Reference historical data. Distinguish true alpha from lagging indicators. Be direct and specific.`

// Document Intelligence state
function DocIntelSection() {
  const [templates, setTemplates] = React.useState([])
  const [uploading, setUploading] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [docType, setDocType] = React.useState('weekly_recap')
  const [content, setContent] = React.useState('')
  const [genResult, setGenResult] = React.useState(null)

  React.useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    try {
      const r = await fetch('/api/doc-intelligence?action=list_templates&userId=ankush')
      if (r.ok) setTemplates(await r.json())
    } catch(e) {}
  }

  async function uploadTemplate() {
    if (!title || !content) { alert('Title and content required'); return }
    setUploading(true)
    try {
      const r = await fetch('/api/doc-intelligence?action=upload_template', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'upload_template', title, content, type: docType, userId:'ankush'})
      })
      const d = await r.json()
      if (d.success) { alert('Template uploaded! AI analyzed ' + (d.analysis?.sections?.length || 0) + ' sections.'); setTitle(''); setContent(''); loadTemplates() }
      else alert('Error: ' + (d.error || 'Unknown'))
    } catch(e) { alert('Error: ' + e.message) }
    setUploading(false)
  }

  async function generateDoc(templateId) {
    setGenerating(true)
    try {
      const r = await fetch('/api/doc-intelligence?action=generate', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'generate', templateId, userId:'ankush'})
      })
      const d = await r.json()
      if (d.success) setGenResult(d)
      else alert('Error: ' + (d.error || 'Unknown'))
    } catch(e) { alert('Error: ' + e.message) }
    setGenerating(false)
  }

  return (
    <div>
      <h3 style={{fontSize:14,fontWeight:700,marginBottom:12}}>Upload Document Template</h3>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
        <div>
          <div style={{fontSize:9,color:'#4a5c7a',marginBottom:3}}>TITLE</div>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder='Weekly Recap Template' style={{width:'100%',padding:'8px 10px',background:'#080c14',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'#f0f6ff',fontSize:12,outline:'none'}} />
        </div>
        <div>
          <div style={{fontSize:9,color:'#4a5c7a',marginBottom:3}}>TYPE</div>
          <select value={docType} onChange={e=>setDocType(e.target.value)} style={{width:'100%',padding:'8px 10px',background:'#080c14',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'#f0f6ff',fontSize:12,outline:'none'}}>
            <option value='weekly_recap'>Weekly Recap</option>
            <option value='watchlist'>Watchlist</option>
            <option value='market_brief'>Market Brief</option>
          </select>
        </div>
      </div>
      <div style={{fontSize:9,color:'#4a5c7a',marginBottom:3}}>PASTE DOCUMENT CONTENT</div>
      <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder='Paste the full text of your weekly recap or watchlist here. The AI will analyze the structure, sections, and style, then learn to replicate it with current market data.' rows={8} style={{width:'100%',padding:'10px',background:'#080c14',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#f0f6ff',fontSize:11,outline:'none',resize:'vertical',lineHeight:1.6,fontFamily:'"DM Mono",monospace'}} />
      <button onClick={uploadTemplate} disabled={uploading} style={{marginTop:8,width:'100%',padding:'10px',background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.3)',borderRadius:8,color:'#60a5fa',fontSize:12,cursor:'pointer',fontWeight:600}}>{uploading ? 'Analyzing...' : 'Upload & Analyze Template'}</button>

      {templates.length > 0 && (
        <div style={{marginTop:16}}>
          <h3 style={{fontSize:14,fontWeight:700,marginBottom:8}}>Stored Templates ({templates.length})</h3>
          {templates.map((t,i) => (
            <div key={i} style={{padding:'10px 14px',background:'#0c1018',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:600,fontSize:12}}>{t.title}</div>
                <div style={{fontSize:9,color:'#4a5c7a'}}>{t.type} | {t.sections} sections | {t.uploadedAt?.split('T')[0]}</div>
              </div>
              <button onClick={()=>generateDoc(t.id)} disabled={generating} style={{padding:'6px 14px',background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:6,color:'#10b981',fontSize:10,cursor:'pointer',fontWeight:600}}>{generating ? 'Generating...' : 'Generate New'}</button>
            </div>
          ))}
        </div>
      )}

      {genResult && (
        <div style={{marginTop:16,padding:'14px',background:'rgba(16,185,129,0.04)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:10}}>
          <div style={{fontSize:12,fontWeight:700,color:'#10b981',marginBottom:8}}>Generated: {genResult.title}</div>
          <pre style={{fontSize:10,color:'#8b9bb4',lineHeight:1.6,whiteSpace:'pre-wrap',maxHeight:400,overflow:'auto'}}>{genResult.content}</pre>
        </div>
      )}
    </div>
  )
}

export default function Admin() {
  const { user, isAdmin } = useAuth()
  const [tab, setTab] = useState('strategy')
  const [msgs, setMsgs] = useState([{role:'assistant',content:'Welcome to the Strategy Intelligence Lab.\n\nI am your institutional CIO. Share a market observation or strategy hypothesis and I will tell you if it has real edge.\n\nSuggested explorations:\nÃ¢ÂÂ¢ NVDA leads QQQ 2-3 days before big moves Ã¢ÂÂ real or noise?\nÃ¢ÂÂ¢ High VIX + SPY at 200 EMA = best spread entry window\nÃ¢ÂÂ¢ What leading indicators predict sector rotation 2-4 weeks early?'}])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState(null)
  const [patterns, setPatterns] = useState([])
  const endRef = useRef(null)
  useEffect(()=>endRef.current?.scrollIntoView({behavior:'smooth'}),[msgs])
  useEffect(()=>{if(tab==='health')loadHealth();if(tab==='patterns')loadPatterns()},[tab])

  async function loadHealth() {
    try {
      const [c,s,p] = await Promise.all([
        supabase.from('scan_cache').select('created_at,setup_count').order('created_at',{ascending:false}).limit(1),
        supabase.from('setup_records').select('id,outcome'),
        supabase.from('ai_learned_patterns').select('*').order('prompt_weight',{ascending:false}),
      ])
      const res=(s.data||[]).filter(x=>x.outcome), wins=res.filter(x=>x.outcome==='win')
      setHealth({lastScan:c.data?.[0]?.created_at,lastSetups:c.data?.[0]?.setup_count,total:s.data?.length||0,winRate:res.length?(wins.length/res.length*100).toFixed(1)+'%':'N/A',patterns:p.data?.length||0})
    } catch(e){}
  }
  async function loadPatterns() {
    const {data}=await supabase.from('ai_learned_patterns').select('*').order('prompt_weight',{ascending:false})
    setPatterns(data||[])
  }
  async function send() {
    if(!input.trim()||loading) return
    const m=input.trim(); setInput('')
    const newMsgs=[...msgs,{role:'user',content:m}]
    setMsgs(newMsgs); setLoading(true)
    try {
      const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:2000,system:SYS,messages:newMsgs.map(x=>({role:x.role,content:x.content}))})})
      const d=await r.json()
      setMsgs(p=>[...p,{role:'assistant',content:d.content?.[0]?.text||'Error'}])
    }catch(e){setMsgs(p=>[...p,{role:'assistant',content:'Error: '+e.message}])}
    setLoading(false)
  }
  async function forceScan() {
    try{const r=await fetch('/api/analysis?type=scan',{signal:AbortSignal.timeout(120000)});const d=await r.json();alert('Scan: '+(d.setups?.length||0)+' setups');loadHealth()}catch(e){alert('Error: '+e.message)}
  }
  async function clearCache() {
    await supabase.from('scan_cache').delete().neq('id','00000000-0000-0000-0000-000000000000');alert('Cache cleared');loadHealth()
  }

  if(!isAdmin) return <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'80vh',color:'var(--text-muted)',fontFamily:'var(--font)'}}>
    <div style={{fontSize:40,marginBottom:8}}>Ã°ÂÂÂ</div><div>Admin only ({user?.email||'not logged in'})</div>
  </div>

  const bg='var(--bg-base)',card='var(--bg-card)',brd='1px solid var(--border)'

  const SUGG=['NVDA leads QQQ by 2-3 days before big moves Ã¢ÂÂ validate this edge','High VIX + SPY at 200 EMA = ideal spread entry Ã¢ÂÂ historical analysis','What IV rank threshold works best for pre-earnings plays?','How to identify institutional accumulation vs distribution in mega-cap tech?','Leading indicators that predict sector rotation 2-4 weeks early']

  return <div style={{background:bg,minHeight:'100vh',display:'flex',flexDirection:'column',fontFamily:'var(--font)',color:'var(--text-primary)'}}>
    <div style={{padding:'14px 16px 0',borderBottom:brd}}>
      <div style={{fontSize:20,fontWeight:700,marginBottom:10}}>Ã°ÂÂÂ§ Strategy Intelligence Lab</div>
      <div style={{display:'flex',gap:0}}>
        {[['strategy','Ã°ÂÂ§Â  Strategy Chat'],['health','Ã¢ÂÂ¤ Health'],['patterns','Ã°ÂÂÂ Patterns']].map(([v,l])=>
          <button key={v} style={{padding:'8px 18px',cursor:'pointer',fontWeight:600,fontSize:13,border:'none',
            borderBottom:tab===v?'2px solid var(--accent)':'2px solid transparent',
            background:'transparent',color:tab===v?'var(--accent)':'var(--text-secondary)'}}
            onClick={()=>setTab(v)}>{l}</button>)}
      </div>
    </div>

    {tab==='strategy'&&<>
      {msgs.length<=1&&<div style={{padding:'10px 16px',display:'flex',flexDirection:'column',gap:5}}>
        <div style={{fontSize:12,color:'var(--text-muted)',paddingBottom:4}}>Ã°ÂÂÂ¡ Strategy hypotheses to explore:</div>
        {SUGG.map((s,i)=><button key={i} onClick={()=>setInput(s)}
          style={{textAlign:'left',background:card,border:brd,borderRadius:8,padding:'8px 12px',cursor:'pointer',fontSize:12,color:'var(--text-secondary)'}}>{s}</button>)}
      </div>}
      <div style={{flex:1,overflowY:'auto',padding:'12px 16px',display:'flex',flexDirection:'column',gap:8,maxHeight:'calc(100vh - 260px)'}}>
        {msgs.map((m,i)=><div key={i} style={{maxWidth:'82%',alignSelf:m.role==='user'?'flex-end':'flex-start',
          background:m.role==='user'?'var(--accent)':card,border:m.role==='assistant'?brd:'none',
          borderRadius:12,padding:'11px 15px',fontSize:13.5,lineHeight:1.7,
          color:m.role==='user'?'#fff':'var(--text-primary)',whiteSpace:'pre-wrap'}}>{m.content}</div>)}
        {loading&&<div style={{maxWidth:'82%',background:card,border:brd,borderRadius:12,padding:'11px 15px',fontSize:13.5,color:'var(--text-muted)'}}>Ã¢ÂÂ³ Analyzing with institutional rigor...</div>}
        <div ref={endRef}/>
      </div>
      <div style={{display:'flex',gap:8,padding:'8px 16px 14px',borderTop:brd}}>
        <textarea style={{flex:1,background:card,border:brd,borderRadius:10,color:'var(--text-primary)',padding:'10px 14px',fontSize:13,resize:'none'}}
          rows={3} value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),send())}
          placeholder="Strategy hypothesis or market observation... (Enter to send)"/>
        <button style={{background:'var(--accent)',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',cursor:'pointer',fontWeight:700,alignSelf:'flex-end'}}
          onClick={send} disabled={loading}>Send</button>
      </div>
    </>}

    {tab==='health'&&<>
      <div style={{display:'flex',gap:8,padding:'10px 16px',flexWrap:'wrap'}}>
        <button onClick={forceScan} style={{padding:'9px 18px',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13,border:'none',background:'var(--accent)',color:'#fff'}}>Ã¢ÂÂ¡ Force Rescan</button>
        <button onClick={clearCache} style={{padding:'9px 18px',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13,border:brd,background:'transparent',color:'var(--text-primary)'}}>Ã°ÂÂÂ Clear Cache</button>
        <button onClick={loadHealth} style={{padding:'9px 18px',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13,border:brd,background:'transparent',color:'var(--text-primary)'}}>Ã¢ÂÂº Refresh</button>
      </div>
      {health?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))',gap:10,padding:'0 16px'}}>
        {[['Last Scan',health.lastScan?new Date(health.lastScan).toLocaleTimeString():'Never'],['Setups in Scan',health.lastSetups??'Ã¢ÂÂ'],['Total Tracked',health.total],['Win Rate',health.winRate],['Patterns',health.patterns]].map(([l,v])=>
          <div key={l} style={{background:card,border:brd,borderRadius:10,padding:14}}>
            <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:4}}>{l}</div>
            <div style={{fontSize:20,fontWeight:700}}>{v}</div>
          </div>)}
      </div>:<div style={{padding:20,color:'var(--text-muted)',fontSize:13}}>Loading stats...</div>}
    </>}

    {tab==='patterns'&&<div style={{padding:'12px 16px',overflowY:'auto'}}>
      {patterns.length===0?<div style={{color:'var(--text-muted)',textAlign:'center',padding:40,fontSize:13}}>No patterns yet. Run scans and log outcomes to train AnkushAI.</div>
      :patterns.map((p,i)=><div key={i} style={{background:card,border:brd,borderRadius:10,padding:'12px 14px',marginBottom:8}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{p.pattern_name}</div>
        <div style={{fontSize:12,color:'var(--text-muted)'}}>Weight: {p.prompt_weight}</div>
        {p.works_best_when&&<div style={{fontSize:12,color:'#10b981',marginTop:4}}>Ã¢ÂÂ {p.works_best_when}</div>}
        {p.fails_when&&<div style={{fontSize:12,color:'#ef4444',marginTop:2}}>Ã¢ÂÂ  {p.fails_when}</div>}
      </div>)}
    </div>}


      {/* Document Intelligence */}
      <div style={{marginTop:20,padding:"16px 20px",background:"#0d1420",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:16}}>{String.fromCodePoint(0x1F4C4)}</span>
          <span style={{fontWeight:700,fontSize:15}}>Document Intelligence</span>
        </div>
        <DocIntelSection />
      </div>

  </div>
}