import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function Strategies() {
  const [strategies, setStrategies] = useState([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [maxMode, setMaxMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testQ, setTestQ] = useState('')
  const [testResult, setTestResult] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [ingestUrl, setIngestUrl] = useState('')
  const fileRef = useRef(null)
  const [form, setForm] = useState({ name: '', description: '', content: '' })

  useEffect(() => {
    load()
    const saved = localStorage.getItem('ankushai_strategies')
    if (saved) try { setSelectedIds(JSON.parse(saved)) } catch(e) {}
    if (localStorage.getItem('ankushai_max') === 'true') setMaxMode(true)
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const r = await fetch('/api/strategies', { headers: { 'Authorization': 'Bearer ' + s?.access_token } })
      const d = await r.json()
      setStrategies(d.strategies || [])
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  function toggle(id) {
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    setSelectedIds(next)
    localStorage.setItem('ankushai_strategies', JSON.stringify(next))
  }

  function toggleMax() {
    const next = !maxMode; setMaxMode(next)
    if (next) { const all = strategies.map(s => s.id); setSelectedIds(all); localStorage.setItem('ankushai_strategies', JSON.stringify(all)) }
    localStorage.setItem('ankushai_max', String(next))
  }

  async function save() {
    if (!form.name.trim() || !form.content.trim()) return
    setSaving(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const method = editing ? 'PUT' : 'POST'
      const body = editing ? { ...form, id: editing.id } : form
      const r = await fetch('/api/strategies', { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s?.access_token }, body: JSON.stringify(body) })
      if (r.ok) { await load(); setShowBuilder(false); setEditing(null); setForm({ name: '', description: '', content: '' }) }
    } catch(e) { console.error(e) }
    finally { setSaving(false) }
  }

  async function del(id) {
    if (!confirm('Remove this strategy?')) return
    const { data: { session: s } } = await supabase.auth.getSession()
    await fetch('/api/strategies?id=' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + s?.access_token } })
    await load()
    setSelectedIds(p => p.filter(x => x !== id))
  }

  async function ingestFromUrl() {
    if (!ingestUrl.trim()) return
    setIngesting(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s?.access_token }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Extract and structure the trading strategy from: ' + ingestUrl + '. Output: setup criteria, entry rules, exit rules, risk management, optimal conditions.' }], mode: 'general' }) })
      const reader = r.body.getReader(); const dec = new TextDecoder(); let txt = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; dec.decode(value).split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { const d = JSON.parse(l.slice(6)); if (d.text) txt += d.text } catch(e) {} }) }
      setForm(p => ({ ...p, content: p.content ? p.content + '\n\n' + txt : txt })); setIngestUrl('')
    } catch(e) { console.error(e) }
    finally { setIngesting(false) }
  }

  async function ingestFile(file) {
    setIngesting(true)
    try {
      const text = await file.text()
      const { data: { session: s } } = await supabase.auth.getSession()
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s?.access_token }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Extract the trading strategy from:\n\n' + text.substring(0, 8000) + '\n\nOutput: setup, entry, exit, risk, conditions.' }], mode: 'general' }) })
      const reader = r.body.getReader(); const dec = new TextDecoder(); let txt = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; dec.decode(value).split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { const d = JSON.parse(l.slice(6)); if (d.text) txt += d.text } catch(e) {} }) }
      setForm(p => ({ ...p, content: p.content ? p.content + '\n\n' + txt : txt }))
    } catch(e) { console.error(e) }
    finally { setIngesting(false) }
  }

  async function runTest() {
    if (!testQ.trim() || testLoading) return
    setTestLoading(true); setTestResult('')
    try {
      const active = strategies.filter(s => selectedIds.includes(s.id))
      const { data: { session: s } } = await supabase.auth.getSession()
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s?.access_token }, body: JSON.stringify({ messages: [{ role: 'user', content: testQ }], strategies: active, mode: maxMode ? 'strategy_analysis' : 'general' }) })
      const reader = r.body.getReader(); const dec = new TextDecoder(); let txt = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; dec.decode(value).split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { const d = JSON.parse(l.slice(6)); if (d.text) { txt += d.text; setTestResult(txt) } } catch(e) {} }) }
    } catch(e) { setTestResult('Error: ' + e.message) }
    finally { setTestLoading(false) }
  }

  const EXAMPLES = [
    { name: 'Gap & Go', description: 'Pre-market gap setups with volume', content: 'Look for stocks gapping 3%+ in pre-market with 2x+ average volume. Wait for first 5-minute candle. Enter on break above ORH. Stop below ORL. Target 2:1 R/R minimum. Best in trending markets.' },
    { name: 'VWAP Reclaim', description: 'VWAP support/resistance pattern', content: 'Stocks crossing below VWAP then reclaiming it on volume. Enter on first close above VWAP. Stop below most recent low. Works best in high-volume institutional names.' },
    { name: 'Earnings Momentum', description: 'Post-earnings continuation', content: 'After strong earnings beat + guidance raise, stock gaps 5%+ and holds above gap by hour 1. Enter on VWAP pullback. Hold 3-5 days. Stop below day 1 low.' },
  ]

  return (
    <div style={{padding:'28px 32px',minHeight:'100vh',background:'#080c14',color:'#f0f4ff',fontFamily:'"DM Sans",sans-serif'}}>
      <style>{`.sc{background:#0d1420;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:20px;transition:all .2s;cursor:pointer}.sc:hover{border-color:rgba(255,255,255,.12);transform:translateY(-1px)}.sc.sel{border-color:#2563eb;background:linear-gradient(135deg,rgba(37,99,235,.1),#0d1420)}.sc.sel::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#2563eb,#7c3aed);border-radius:14px 14px 0 0}.tb{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:6px;padding:3px 10px;font-size:11px;font-family:"DM Mono",monospace;color:#8b9fc0;cursor:pointer;transition:all .15s}.tb:hover{border-color:rgba(255,255,255,.15);color:#f0f4ff}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:16}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:28,fontWeight:800,margin:'0 0 6px'}}>Strategy Engine</h1>
          <p style={{color:'#8b9fc0',fontSize:14,margin:0}}>{selectedIds.length===0?'Select strategies to activate for AI analysis':`${maxMode?'🔥 Maximum Analysis':`${selectedIds.length} strateg${selectedIds.length===1?'y':'ies'}`} active`}</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={toggleMax} style={{padding:'10px 20px',background:maxMode?'linear-gradient(135deg,#dc2626,#9333ea)':'rgba(255,255,255,.05)',border:`1px solid ${maxMode?'rgba(220,38,38,.5)':'rgba(255,255,255,.1)'}`,borderRadius:10,color:maxMode?'white':'#8b9fc0',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>{maxMode?'🔥 MAXIMUM ON':'⚡ Maximum Analysis'}</button>
          <button onClick={()=>{setShowBuilder(true);setEditing(null);setForm({name:'',description:'',content:''})}} style={{padding:'10px 20px',background:'#2563eb',border:'none',borderRadius:10,color:'white',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>+ New Strategy</button>
        </div>
      </div>

      {showBuilder&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',backdropFilter:'blur(12px)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'40px 20px',overflowY:'auto'}}>
        <div style={{background:'#0d1420',border:'1px solid rgba(255,255,255,.12)',borderRadius:20,padding:36,width:'100%',maxWidth:680,position:'relative'}}>
          <button onClick={()=>setShowBuilder(false)} style={{position:'absolute',top:16,right:16,background:'rgba(255,255,255,.06)',border:'none',color:'#8b9fc0',width:32,height:32,borderRadius:8,cursor:'pointer',fontSize:16}}>✕</button>
          <h2 style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,margin:'0 0 6px'}}>{editing?'Edit Strategy':'New Strategy'}</h2>
          <p style={{color:'#8b9fc0',fontSize:13,marginBottom:24}}>Describe your strategy in natural language. The AI uses this as its instruction set.</p>
          <div style={{marginBottom:14}}><label style={{display:'block',color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:6}}>STRATEGY NAME</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g., Gap & Go, VWAP Reclaim..." style={{width:'100%',background:'#111927',border:'1.5px solid rgba(255,255,255,.08)',borderRadius:10,padding:'11px 14px',color:'#f0f4ff',fontSize:14,outline:'none',boxSizing:'border-box'}}/></div>
          <div style={{marginBottom:14}}><label style={{display:'block',color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:6}}>SHORT DESCRIPTION</label><input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="One line summary..." style={{width:'100%',background:'#111927',border:'1.5px solid rgba(255,255,255,.08)',borderRadius:10,padding:'11px 14px',color:'#f0f4ff',fontSize:14,outline:'none',boxSizing:'border-box'}}/></div>
          <div style={{background:'rgba(37,99,235,.06)',border:'1px solid rgba(37,99,235,.15)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
            <div style={{color:'#60a5fa',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:10}}>⚡ INGEST FROM SOURCE</div>
            <div style={{display:'flex',gap:8,marginBottom:8}}><input value={ingestUrl} onChange={e=>setIngestUrl(e.target.value)} placeholder="Paste any URL, article, or YouTube link..." style={{flex:1,background:'#111927',border:'1.5px solid rgba(255,255,255,.08)',borderRadius:8,padding:'9px 12px',color:'#f0f4ff',fontSize:13,outline:'none'}}/><button onClick={ingestFromUrl} disabled={ingesting||!ingestUrl} style={{padding:'9px 16px',background:'#2563eb',border:'none',borderRadius:8,color:'white',fontSize:12,cursor:'pointer',opacity:ingesting?0.6:1}}>{ingesting?'...':'Extract'}</button></div>
            <div style={{display:'flex',alignItems:'center',gap:8}}><button onClick={()=>fileRef.current?.click()} style={{padding:'7px 14px',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#8b9fc0',fontSize:12,cursor:'pointer'}}>📄 Upload PDF/TXT</button><span style={{color:'#2d3d50',fontSize:12}}>Claude extracts the strategy automatically</span><input ref={fileRef} type="file" accept=".pdf,.txt,.md" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&ingestFile(e.target.files[0])}/></div>
          </div>
          <div style={{marginBottom:20}}><label style={{display:'block',color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:6}}>STRATEGY CONTENT</label><textarea value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="Describe setup criteria, entry rules, exit rules, risk management, optimal conditions..." style={{width:'100%',background:'#111927',border:'1.5px solid rgba(255,255,255,.08)',borderRadius:10,padding:14,color:'#f0f4ff',fontSize:14,outline:'none',lineHeight:1.7,resize:'vertical',minHeight:180,boxSizing:'border-box'}}/>{ingesting&&<div style={{color:'#60a5fa',fontSize:12,marginTop:6,fontFamily:'"DM Mono",monospace'}}>⚡ Extracting with AI...</div>}</div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}><button onClick={()=>setShowBuilder(false)} style={{padding:'11px 20px',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,color:'#8b9fc0',fontSize:13,cursor:'pointer'}}>Cancel</button><button onClick={save} disabled={saving||!form.name||!form.content} style={{padding:'11px 24px',background:'#2563eb',border:'none',borderRadius:10,color:'white',fontSize:13,fontWeight:600,cursor:'pointer',opacity:(saving||!form.name||!form.content)?0.6:1}}>{saving?'Saving...':editing?'Update':'Save Strategy'}</button></div>
        </div>
      </div>}

      {!loading&&strategies.length===0&&<div style={{marginBottom:28}}>
        <div style={{color:'#4a5c7a',fontSize:12,fontFamily:'"DM Mono",monospace',marginBottom:14}}>QUICK START — ADD EXAMPLE STRATEGIES</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}}>
          {EXAMPLES.map(ex=><button key={ex.name} onClick={async()=>{setSaving(true);const{data:{session:s}}=await supabase.auth.getSession();await fetch('/api/strategies',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s?.access_token},body:JSON.stringify(ex)});await load();setSaving(false)}} style={{background:'rgba(255,255,255,.03)',border:'1px dashed rgba(255,255,255,.1)',borderRadius:12,padding:16,textAlign:'left',cursor:'pointer'}}><div style={{color:'#f0f4ff',fontSize:14,fontWeight:600,marginBottom:4}}>+ {ex.name}</div><div style={{color:'#4a5c7a',fontSize:12}}>{ex.description}</div></button>)}
        </div>
      </div>}

      {loading?<div style={{color:'#4a5c7a',fontSize:13,fontFamily:'"DM Mono",monospace'}}>Loading strategies...</div>:
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16,marginBottom:32}}>
          {strategies.map(st=>{const sel=selectedIds.includes(st.id);return(
            <div key={st.id} className={'sc'+(sel?' sel':'')} style={{position:'relative'}} onClick={()=>toggle(st.id)}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${sel?'#2563eb':'rgba(255,255,255,.15)'}`,background:sel?'#2563eb':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>{sel&&<span style={{color:'white',fontSize:11}}>✓</span>}</div>
                  <div style={{fontFamily:'"Syne",sans-serif',fontSize:16,fontWeight:700}}>{st.name}</div>
                </div>
                <div style={{display:'flex',gap:6}} onClick={e=>e.stopPropagation()}>
                  <button className="tb" onClick={()=>{setEditing(st);setForm({name:st.name,description:st.description||'',content:st.content});setShowBuilder(true)}}>edit</button>
                  <button className="tb" style={{color:'#ef4444',borderColor:'rgba(239,68,68,.2)'}} onClick={()=>del(st.id)}>×</button>
                </div>
              </div>
              {st.description&&<p style={{color:'#8b9fc0',fontSize:13,margin:'0 0 8px',lineHeight:1.5}}>{st.description}</p>}
              <p style={{color:'#2d3d50',fontSize:12,margin:0,lineHeight:1.6,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{st.content}</p>
              {!st.user_id&&<div style={{display:'inline-block',marginTop:10,padding:'2px 8px',background:'rgba(37,99,235,.1)',border:'1px solid rgba(37,99,235,.2)',borderRadius:4,color:'#3b82f6',fontSize:10,fontFamily:'"DM Mono",monospace'}}>GLOBAL</div>}
            </div>
          )})}
        </div>}

      {strategies.length>0&&<div style={{background:'#0d1420',border:'1px solid rgba(255,255,255,.07)',borderRadius:16,padding:24}}>
        <div style={{color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:14}}>⚡ STRATEGY TEST CONSOLE — {selectedIds.length>0?`Using ${maxMode?'all':selectedIds.length} strateg${selectedIds.length===1?'y':'ies'}`:'No strategies selected'}</div>
        <div style={{display:'flex',gap:10,marginBottom:testResult?16:0}}>
          <input value={testQ} onChange={e=>setTestQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&runTest()} placeholder='e.g., "How many times has AAPL gapped up before earnings?" or "TSLA retesting support — how likely is a breakout?"' style={{flex:1,background:'#111927',border:'1.5px solid rgba(255,255,255,.08)',borderRadius:10,padding:'12px 16px',color:'#f0f4ff',fontSize:14,outline:'none'}}/>
          <button onClick={runTest} disabled={testLoading||!testQ.trim()||selectedIds.length===0} style={{padding:'12px 20px',background:'#2563eb',border:'none',borderRadius:10,color:'white',fontSize:13,cursor:'pointer',whiteSpace:'nowrap',opacity:(testLoading||!testQ.trim()||selectedIds.length===0)?0.6:1,fontFamily:'"DM Mono",monospace'}}>{testLoading?'...':'Analyze →'}</button>
        </div>
        {testResult&&<div style={{background:'rgba(37,99,235,.06)',border:'1px solid rgba(37,99,235,.15)',borderRadius:12,padding:'16px 20px',marginTop:16}}><div style={{color:'#c4cfe0',fontSize:14,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{testResult}</div></div>}
      </div>}
    </div>
  )
}