import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CATS = [
  {value:'technical',label:'📈 Technical',color:'#3b82f6'},
  {value:'options',label:'⚡ Options',color:'#8b5cf6'},
  {value:'earnings',label:'📊 Earnings',color:'#f59e0b'},
  {value:'macro',label:'🌍 Macro',color:'#06b6d4'},
  {value:'sector',label:'🔄 Sector',color:'#ec4899'},
  {value:'sentiment',label:'📰 Sentiment',color:'#10b981'},
  {value:'universal',label:'🧠 Universal',color:'#f97316'},
]

export default function AdminTraining() {
  const [modules,setModules] = useState([])
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [showForm,setShowForm] = useState(false)
  const [editing,setEditing] = useState(null)
  const [form,setForm] = useState({title:'',category:'technical',content:'',priority:5})
  const [ingesting,setIngesting] = useState(false)
  const [ingestUrl,setIngestUrl] = useState('')

  useEffect(()=>{load()},[])

  async function load() {
    setLoading(true)
    const {data} = await supabase.from('ai_training').select('*').order('priority',{ascending:false})
    setModules(data||[])
    setLoading(false)
  }

  async function save() {
    if(!form.title||!form.content) return
    setSaving(true)
    try {
      if(editing) await supabase.from('ai_training').update({...form,updated_at:new Date().toISOString()}).eq('id',editing.id)
      else await supabase.from('ai_training').insert({...form})
      await load()
      setShowForm(false); setEditing(null); setForm({title:'',category:'technical',content:'',priority:5})
    } catch(e){console.error(e)}
    setSaving(false)
  }

  async function toggleActive(m) {
    await supabase.from('ai_training').update({is_active:!m.is_active}).eq('id',m.id)
    await load()
  }

  async function del(id) {
    if(!confirm('Delete this training module?')) return
    await supabase.from('ai_training').delete().eq('id',id)
    await load()
  }

  async function ingest() {
    if(!ingestUrl) return
    setIngesting(true)
    try {
      const {data:{session}} = await supabase.auth.getSession()
      const r = await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session?.access_token},body:JSON.stringify({messages:[{role:'user',content:'Extract and structure the trading strategy or concept from: '+ingestUrl+'. Output a comprehensive training module with: exact setup criteria, how to identify it in market data, optimal options trade structure, key variations, what invalidates it. Be specific with numbers and conditions.'}],mode:'general'})})
      const reader=r.body.getReader(); const dec=new TextDecoder(); let txt=''
      while(true){const{done,value}=await reader.read();if(done)break;dec.decode(value).split('\n').filter(l=>l.startsWith('data: ')).forEach(l=>{try{const d=JSON.parse(l.slice(6));if(d.text)txt+=d.text}catch(e){}})}
      setForm(f=>({...f,content:f.content?f.content+'\n\n'+txt:txt})); setIngestUrl('')
    } catch(e){console.error(e)}
    setIngesting(false)
  }

  const catMap = Object.fromEntries(CATS.map(c=>[c.value,c]))
  const activeCount = modules.filter(m=>m.is_active).length

  return (
    <div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h2 style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,margin:'0 0 4px'}}>AI Training Modules</h2>
          <p style={{color:'#8b9fc0',fontSize:13,margin:0}}>{activeCount} active · These train the AI on every chart analysis and setup scan</p>
        </div>
        <button onClick={()=>{setShowForm(true);setEditing(null);setForm({title:'',category:'technical',content:'',priority:5})}} style={{padding:'10px 20px',background:'#2563eb',border:'none',borderRadius:10,color:'white',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>+ New Module</button>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:24,flexWrap:'wrap'}}>
        {CATS.map(cat=>{
          const count=modules.filter(m=>m.category===cat.value&&m.is_active).length
          return <div key={cat.value} style={{background:cat.color+'10',border:'1px solid '+cat.color+'30',borderRadius:8,padding:'6px 12px',display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:11}}>{cat.label}</span><span style={{color:cat.color,fontFamily:'"DM Mono",monospace',fontSize:12,fontWeight:700}}>{count}</span></div>
        })}
      </div>

      {showForm&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',backdropFilter:'blur(12px)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'40px 20px',overflowY:'auto'}}>
          <div style={{background:'#0d1420',border:'1px solid rgba(255,255,255,.12)',borderRadius:20,padding:36,width:'100%',maxWidth:720,position:'relative'}}>
            <button onClick={()=>setShowForm(false)} style={{position:'absolute',top:16,right:16,background:'rgba(255,255,255,.06)',border:'none',color:'#8b9fc0',width:32,height:32,borderRadius:8,cursor:'pointer',fontSize:16}}>✕</button>
            <h3 style={{fontFamily:'"Syne",sans-serif',fontSize:20,fontWeight:800,margin:'0 0 6px'}}>{editing?'Edit':'New'} Training Module</h3>
            <p style={{color:'#8b9fc0',fontSize:13,marginBottom:24}}>This will be injected into every AI analysis and Top Setups scan.</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
              <div><label style={{display:'block',color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:6}}>TITLE</label><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g., Gap & Go Pattern Recognition" style={{width:'100%',background:'#111927',border:'1.5px solid rgba(255,255,255,.08)',borderRadius:10,padding:'11px 14px',color:'#f0f4ff',fontSize:14,outline:'none',boxSizing:'border-box'}}/></div>
              <div><label style={{display:'block',color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:6}}>CATEGORY</label><select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{width:'100%',background:'#111927',border:'1.5px solid rgba(255,255,255,.08)',borderRadius:10,padding:'11px 14px',color:'#f0f4ff',fontSize:14,outline:'none'}}>{CATS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{display:'block',color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:6}}>PRIORITY (1-10)</label>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <input type="range" min={1} max={10} value={form.priority} onChange={e=>setForm(f=>({...f,priority:parseInt(e.target.value)}))} style={{flex:1}}/>
                <span style={{color:'#f59e0b',fontFamily:'"DM Mono",monospace',fontWeight:700,minWidth:20}}>{form.priority}</span>
              </div>
            </div>
            <div style={{background:'rgba(37,99,235,.06)',border:'1px solid rgba(37,99,235,.15)',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
              <div style={{color:'#60a5fa',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:10}}>⚡ INGEST FROM ANY SOURCE</div>
              <div style={{display:'flex',gap:8}}>
                <input value={ingestUrl} onChange={e=>setIngestUrl(e.target.value)} placeholder="YouTube video, article URL, trading notes..." style={{flex:1,background:'#111927',border:'1.5px solid rgba(255,255,255,.08)',borderRadius:8,padding:'9px 12px',color:'#f0f4ff',fontSize:13,outline:'none'}}/>
                <button onClick={ingest} disabled={ingesting||!ingestUrl} style={{padding:'9px 16px',background:'#2563eb',border:'none',borderRadius:8,color:'white',fontSize:12,cursor:'pointer',opacity:ingesting?0.6:1}}>
                  {ingesting?<span style={{width:14,height:14,borderRadius:'50%',border:'2px solid rgba(255,255,255,.3)',borderTopColor:'white',animation:'spin .6s linear infinite',display:'inline-block'}}/>:'Extract'}
                </button>
              </div>
            </div>
            <div style={{marginBottom:24}}>
              <label style={{display:'block',color:'#8b9fc0',fontSize:11,fontFamily:'"DM Mono",monospace',marginBottom:6}}>TRAINING CONTENT</label>
              <textarea value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="Teach the AI exactly what to look for. Be specific: entry criteria, exit rules, optimal options structure, what invalidates the setup..." style={{width:'100%',background:'#111927',border:'1.5px solid rgba(255,255,255,.08)',borderRadius:10,padding:14,color:'#f0f4ff',fontSize:13,outline:'none',lineHeight:1.7,resize:'vertical',minHeight:220,boxSizing:'border-box'}}/>
              {ingesting&&<div style={{color:'#60a5fa',fontSize:12,marginTop:6,fontFamily:'"DM Mono",monospace'}}>⚡ AI extracting strategy...</div>}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowForm(false)} style={{padding:'11px 20px',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,color:'#8b9fc0',fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={save} disabled={saving||!form.title||!form.content} style={{padding:'11px 24px',background:'#2563eb',border:'none',borderRadius:10,color:'white',fontSize:13,fontWeight:600,cursor:'pointer',opacity:(saving||!form.title||!form.content)?0.6:1}}>{saving?'Saving...':editing?'Update':'Save Module'}</button>
            </div>
          </div>
        </div>
      )}

      {loading?<div style={{color:'#4a5c7a',fontSize:13,fontFamily:'"DM Mono",monospace'}}>Loading...</div>:(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {modules.map(m=>{
            const cat=catMap[m.category]||CATS[0]
            return (
              <div key={m.id} style={{background:'#0d1420',border:'1px solid '+(m.is_active?'rgba(255,255,255,.08)':'rgba(255,255,255,.03)'),borderRadius:14,padding:'16px 20px',opacity:m.is_active?1:.5}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{background:cat.color+'15',border:'1px solid '+cat.color+'30',borderRadius:6,padding:'3px 10px',color:cat.color,fontSize:11,fontFamily:'"DM Mono",monospace'}}>{cat.label}</div>
                    <div style={{fontFamily:'"Syne",sans-serif',fontSize:15,fontWeight:700}}>{m.title}</div>
                    <div style={{background:'rgba(245,158,11,.1)',borderRadius:4,padding:'2px 6px',color:'#f59e0b',fontSize:10,fontFamily:'"DM Mono",monospace'}}>P{m.priority}</div>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>toggleActive(m)} style={{padding:'5px 12px',background:m.is_active?'rgba(16,185,129,.1)':'rgba(255,255,255,.04)',border:'1px solid '+(m.is_active?'rgba(16,185,129,.3)':'rgba(255,255,255,.08)'),borderRadius:7,color:m.is_active?'#10b981':'#8b9fc0',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>{m.is_active?'● Active':'○ Inactive'}</button>
                    <button onClick={()=>{setEditing(m);setForm({title:m.title,category:m.category,content:m.content,priority:m.priority});setShowForm(true)}} style={{padding:'5px 12px',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,color:'#8b9fc0',fontSize:11,cursor:'pointer'}}>edit</button>
                    <button onClick={()=>del(m.id)} style={{padding:'5px 10px',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.2)',borderRadius:7,color:'#ef4444',fontSize:11,cursor:'pointer'}}>×</button>
                  </div>
                </div>
                <p style={{color:'#4a5c7a',fontSize:12,margin:0,lineHeight:1.6,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{m.content}</p>
              </div>
            )
          })}
          {modules.length===0&&<div style={{textAlign:'center',padding:'40px',color:'#4a5c7a'}}>No training modules yet. Add your first to start training the AI.</div>}
        </div>
      )}
    </div>
  )
}