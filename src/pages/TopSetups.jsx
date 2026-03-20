import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const BIAS = { bullish:{color:'#10b981',bg:'rgba(16,185,129,0.1)',border:'rgba(16,185,129,0.3)',label:'▲ BULLISH'}, bearish:{color:'#ef4444',bg:'rgba(239,68,68,0.1)',border:'rgba(239,68,68,0.3)',label:'▼ BEARISH'}, neutral:{color:'#f59e0b',bg:'rgba(245,158,11,0.1)',border:'rgba(245,158,11,0.3)',label:'◆ NEUTRAL'} }
const URGENCY = { high:{color:'#ef4444',label:'🔥 HIGH'}, medium:{color:'#f59e0b',label:'⚡ MED'}, low:{color:'#8b9fc0',label:'◦ LOW'} }
const FWCOLS = {breakout:'#3b82f6',momentum:'#8b5cf6',earnings:'#f59e0b',fibonacci:'#10b981',macro:'#06b6d4',sector:'#ec4899',sympathy:'#f97316',technical:'#6366f1',value:'#84cc16',options:'#a78bfa',the_strat:'#fb923c'}

function SetupCard({setup,index}) {
  const [expanded,setExpanded] = useState(false)
  const bias = BIAS[setup.bias]||BIAS.neutral
  const urg = URGENCY[setup.urgency]||URGENCY.medium
  return (
    <div onClick={()=>setExpanded(e=>!e)} style={{background:'#0d1420',border:`1px solid ${expanded?bias.border:'rgba(255,255,255,0.07)'}`,borderRadius:16,padding:'20px 22px',cursor:'pointer',transition:'border-color .2s',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:bias.color,opacity:.6,borderRadius:'16px 16px 0 0'}}/>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#2d3d50'}}>#{index+1}</span>
          <div>
            <div style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800}}>{setup.symbol}</div>
            <div style={{color:'#8b9fc0',fontSize:12,marginTop:1}}>{setup.setupType}</div>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5}}>
          <div style={{background:bias.bg,border:`1px solid ${bias.border}`,borderRadius:6,padding:'3px 10px',color:bias.color,fontSize:11,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{bias.label}</div>
          <div style={{color:urg.color,fontSize:11,fontFamily:'"DM Mono",monospace'}}>{urg.label}</div>
        </div>
      </div>
      <div style={{background:'rgba(37,99,235,0.08)',border:'1px solid rgba(37,99,235,0.2)',borderRadius:10,padding:'10px 14px',marginBottom:12}}>
        <div style={{color:'#4a5c7a',fontSize:10,fontFamily:'"DM Mono",monospace',marginBottom:4,letterSpacing:'.06em'}}>RECOMMENDED TRADE</div>
        <div style={{color:'#60a5fa',fontSize:14,fontWeight:600}}>{setup.optionsTrade}</div>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{color:'#4a5c7a',fontSize:10,fontFamily:'"DM Mono",monospace',marginBottom:5}}>CONFIDENCE {setup.confidence}/10</div>
        <div style={{height:4,background:'rgba(255,255,255,.06)',borderRadius:2,overflow:'hidden'}}>
          <div style={{width:`${setup.confidence*10}%`,height:'100%',background:setup.confidence>=8?'#10b981':setup.confidence>=6?'#f59e0b':'#ef4444',borderRadius:2}}/>
        </div>
      </div>
      <div style={{display:'flex',gap:16,marginBottom:12}}>
        {[['ENTRY',setup.entry,'#f59e0b'],['TARGET',setup.target,'#10b981'],['STOP',setup.stop,'#ef4444']].map(([l,v,c])=>(
          <div key={l} style={{flex:1}}>
            <div style={{color:'#2d3d50',fontSize:9,fontFamily:'"DM Mono",monospace',marginBottom:3}}>{l}</div>
            <div style={{color:c,fontSize:13,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
        {(setup.frameworks||[]).map(fw=>(
          <span key={fw} style={{background:`${FWCOLS[fw]||'#8b5cf6'}18`,border:`1px solid ${FWCOLS[fw]||'#8b5cf6'}40`,color:FWCOLS[fw]||'#8b5cf6',borderRadius:4,padding:'2px 8px',fontSize:10,fontFamily:'"DM Mono",monospace'}}>{fw}</span>
        ))}
      </div>
      {expanded&&<div style={{borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:12,marginTop:12}}>
        <span style={{color:'#f59e0b',fontFamily:'"DM Mono",monospace',fontSize:10}}>WHY NOW — </span>
        <span style={{color:'#8b9fc0',fontSize:13,lineHeight:1.7}}>{setup.keyFactor}</span>
      </div>}
      <div style={{textAlign:'center',marginTop:10,color:'#2d3d50',fontSize:11}}>{expanded?'▲ Less':'▼ Details'}</div>
    </div>
  )
}

export default function TopSetups() {
  const [setups,setSetups] = useState([])
  const [loading,setLoading] = useState(false)
  const [lastScanned,setLastScanned] = useState(null)
  const [error,setError] = useState(null)
  const [filter,setFilter] = useState('all')

  const runScan = useCallback(async()=>{
    setLoading(true); setError(null)
    try {
      const {data:{session}} = await supabase.auth.getSession()
      const r = await fetch('/api/analysis?type=scan',{headers:{'Authorization':'Bearer '+session?.access_token}})
      if(!r.ok) throw new Error('Scan failed: '+r.status)
      const d = await r.json()
      setSetups(d.setups||[]); setLastScanned(new Date())
    } catch(err){setError(err.message)}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{runScan()},[runScan])

  const frameworks = ['all','breakout','momentum','earnings','fibonacci','macro','technical','options','sympathy','value','sector']
  const filtered = filter==='all'?setups:setups.filter(s=>(s.frameworks||[]).includes(filter))

  return (
    <div style={{padding:'28px 32px',minHeight:'100vh',background:'#080c14',color:'#f0f4ff',fontFamily:'"DM Sans",sans-serif'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}.fwbtn{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:6px 14px;color:#8b9fc0;font-family:"DM Mono",monospace;font-size:11px;cursor:pointer}.fwbtn:hover,.fwbtn.act{background:rgba(37,99,235,.12);border-color:rgba(37,99,235,.4);color:#60a5fa}`}</style>

      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:16}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:28,fontWeight:800,margin:'0 0 6px'}}>AnkushAI Top Setups</h1>
          <p style={{color:'#8b9fc0',fontSize:14,margin:0,maxWidth:520}}>100 analyst frameworks running simultaneously. Every setup includes the exact options contract to trade.</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {lastScanned&&<span style={{color:'#2d3d50',fontSize:11,fontFamily:'"DM Mono",monospace'}}>Scanned {lastScanned.toLocaleTimeString()}</span>}
          <button onClick={runScan} disabled={loading} style={{padding:'10px 22px',background:loading?'rgba(37,99,235,.1)':'#2563eb',border:'none',borderRadius:10,color:loading?'#60a5fa':'white',fontSize:13,fontWeight:600,cursor:loading?'default':'pointer',fontFamily:'"DM Mono",monospace',display:'flex',alignItems:'center',gap:8}}>
            {loading?<><span style={{width:14,height:14,borderRadius:'50%',border:'2px solid rgba(96,165,250,.3)',borderTopColor:'#60a5fa',animation:'spin .7s linear infinite',display:'inline-block'}}/>Scanning...</>:'🔍 Rescan Market'}
          </button>
        </div>
      </div>

      {setups.length>0&&(
        <div style={{display:'flex',gap:24,marginBottom:20,flexWrap:'wrap'}}>
          {[['SETUPS',setups.length,'#f0f4ff'],['HIGH CONF (8+)',setups.filter(s=>s.confidence>=8).length,'#10b981'],['BULLISH',setups.filter(s=>s.bias==='bullish').length,'#10b981'],['BEARISH',setups.filter(s=>s.bias==='bearish').length,'#ef4444']].map(([l,v,c])=>(
            <div key={l}><div style={{color:'#2d3d50',fontSize:10,fontFamily:'"DM Mono",monospace',letterSpacing:'.06em'}}>{l}</div><div style={{color:c,fontSize:24,fontWeight:700,fontFamily:'"DM Mono",monospace'}}>{v}</div></div>
          ))}
        </div>
      )}

      <div style={{display:'flex',gap:8,marginBottom:24,flexWrap:'wrap'}}>
        {frameworks.map(fw=>(
          <button key={fw} className={`fwbtn${filter===fw?' act':''}`} onClick={()=>setFilter(fw)}>{fw==='all'?'All Setups':fw}</button>
        ))}
      </div>

      {loading&&setups.length===0&&(
        <div>
          <div style={{background:'rgba(37,99,235,.06)',border:'1px solid rgba(37,99,235,.15)',borderRadius:16,padding:32,textAlign:'center',marginBottom:24}}>
            <div style={{color:'#60a5fa',fontSize:14,fontFamily:'"DM Mono",monospace',marginBottom:8}}>⚡ AI ANALYZING MARKET</div>
            <div style={{color:'#4a5c7a',fontSize:13,marginBottom:16}}>Running 100 analyst frameworks across NYSE universe...</div>
            <div style={{display:'flex',justifyContent:'center',gap:12,flexWrap:'wrap'}}>
              {['Technical','Momentum','Options IV','Macro','Earnings','Fibonacci','The Strat','Sympathy'].map((f,i)=>(
                <div key={f} style={{color:'#2d3d50',fontSize:11,fontFamily:'"DM Mono",monospace',animation:'pulse 2s infinite',animationDelay:i*.25+'s'}}>{f}</div>
              ))}
            </div>
          </div>
          {[1,2,3].map(i=>(
            <div key={i} style={{background:'#0d1420',borderRadius:16,padding:20,marginBottom:14,opacity:.3+i*.15}}>
              <div style={{height:16,background:'rgba(255,255,255,.04)',borderRadius:4,width:'35%',marginBottom:12}}/>
              <div style={{height:10,background:'rgba(255,255,255,.03)',borderRadius:4,width:'60%',marginBottom:8}}/>
              <div style={{height:10,background:'rgba(255,255,255,.02)',borderRadius:4,width:'45%'}}/>
            </div>
          ))}
        </div>
      )}

      {error&&<div style={{background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:12,padding:'14px 18px',marginBottom:20,color:'#fca5a5',fontSize:13}}>{error} — Try rescanning.</div>}

      {!loading&&filtered.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(370px,1fr))',gap:16}}>
          {filtered.map((s,i)=><SetupCard key={s.symbol+i} setup={s} index={i}/>)}
        </div>
      )}

      {setups.length>0&&(
        <div style={{marginTop:32,padding:'14px 18px',background:'rgba(255,255,255,.02)',borderRadius:10,border:'1px solid rgba(255,255,255,.04)'}}>
          <div style={{color:'#2d3d50',fontSize:11,lineHeight:1.6}}>⚠️ AnkushAI Top Setups are AI-generated analysis. Not financial advice. Options involve risk including potential total loss of premium. Always manage position sizes appropriately.</div>
        </div>
      )}
    </div>
  )
}