import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const BIAS = {
  bullish:{color:'#10b981',bg:'rgba(16,185,129,0.1)',border:'rgba(16,185,129,0.25)',label:'▲ BULLISH'},
  bearish:{color:'#ef4444',bg:'rgba(239,68,68,0.1)',border:'rgba(239,68,68,0.25)',label:'▼ BEARISH'},
  neutral:{color:'#f59e0b',bg:'rgba(245,158,11,0.1)',border:'rgba(245,158,11,0.25)',label:'◆ NEUTRAL'},
}
const URGENCY={high:{color:'#ef4444',label:'🔥'},medium:{color:'#f59e0b',label:'⚡'},low:{color:'#8b9fc0',label:'◦'}}
const FWCOLS={breakout:'#3b82f6',momentum:'#8b5cf6',earnings:'#f59e0b',fibonacci:'#10b981',macro:'#06b6d4',sector:'#ec4899',sympathy:'#f97316',technical:'#6366f1',value:'#84cc16',options:'#a78bfa',the_strat:'#fb923c',supply_demand:'#ef4444'}

// 6 permanent baseline setups — always visible regardless of tier
const BASELINE_SETUPS = [
  {symbol:'SPY',setupType:'Index regime — EMA stack + VIX positioning',bias:'neutral',confidence:7,optionsTrade:'SPY weekly straddle at key S/R levels',entry:'At key S/R',target:'+2-3%',stop:'-1.5%',keyFactor:'SPY structure dictates the entire market regime. VIX below 20 favors call buying on dips; above 25 favors put spreads on rips. EMA200 is the bull/bear line.',frameworks:['macro','technical','options'],urgency:'high'},
  {symbol:'QQQ',setupType:'Tech leadership momentum + EMA confluence',bias:'bullish',confidence:7,optionsTrade:'Buy QQQ ATM calls 3-4 weeks out on EMA21 reclaim',entry:'EMA21 reclaim',target:'Prior highs',stop:'Below EMA50',keyFactor:'QQQ is the risk-on thermometer. When tech leads with EMA stack intact and RSI > 50, buy dips to EMA21. When below EMA50, shift to spreads only.',frameworks:['momentum','technical','the_strat'],urgency:'medium'},
  {symbol:'NVDA',setupType:'AI earnings cycle + IV expansion setup',bias:'bullish',confidence:8,optionsTrade:'Buy NVDA calls 4-6 weeks before earnings when IV rank < 50%',entry:'EMA21 support',target:'61.8% extension',stop:'Below EMA50',keyFactor:'NVDA has consistently moved 8-15% on earnings. AI infrastructure demand keeps the multiple elevated. Pre-earnings IV expansion when rank is compressed is a repeatable edge.',frameworks:['earnings','options','momentum'],urgency:'high'},
  {symbol:'AMD',setupType:'NVDA earnings sympathy + semiconductor rotation',bias:'bullish',confidence:7,optionsTrade:'Buy AMD calls day before NVDA earnings',entry:'Morning of NVDA earnings',target:'+6-10% in 2 days',stop:'If NVDA disappoints',keyFactor:'AMD is the most reliable sympathy play to NVDA earnings. When NVDA beats, AMD re-rates sympathetically 4-8%. The sector-wide multiple expansion is predictable.',frameworks:['sympathy','earnings','sector'],urgency:'high'},
  {symbol:'PLTR',setupType:'Government AI contract cycle + breakout',bias:'bullish',confidence:7,optionsTrade:'Buy PLTR calls on volume breakout above 52W high',entry:'52W high break on 2x volume',target:'127% fib extension',stop:'Back below breakout level',keyFactor:'PLTR wins government AI/defense contracts in cycles. High short interest means breakouts are violent. Wait for volume confirmation — fake breakouts are common.',frameworks:['breakout','technical','macro'],urgency:'medium'},
  {symbol:'AAPL',setupType:'Sympathy + supplier chain reaction play',bias:'neutral',confidence:6,optionsTrade:'Buy AAPL ATM calls week of product events',entry:'Pre-event consolidation break',target:'+5-8%',stop:'Day low break',keyFactor:'AAPL product events create sympathy moves across suppliers (TSMC, Skyworks, Cirrus). AAPL often pulls back post-announcement — trade the setup into the event.',frameworks:['sympathy','earnings','technical'],urgency:'medium'},
]

function ConfBar({score}){
  const c=score>=8?'#10b981':score>=6?'#f59e0b':'#ef4444'
  return(<div style={{display:'flex',alignItems:'center',gap:8}}><div style={{flex:1,height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}><div style={{width:score*10+'%',height:'100%',background:c,borderRadius:2,transition:'width 1.2s ease'}}/></div><span style={{color:c,fontSize:11,fontFamily:'"DM Mono",monospace',fontWeight:700,minWidth:16}}>{score}</span></div>)
}

function SetupCard({setup,index,isLive}){
  const[expanded,setExpanded]=useState(false)
  const bias=BIAS[setup.bias]||BIAS.neutral
  const urg=URGENCY[setup.urgency]||URGENCY.medium
  return(
    <div onClick={()=>setExpanded(e=>!e)} style={{background:'#0d1420',border:'1px solid '+(expanded?bias.border:'rgba(255,255,255,0.07)'),borderRadius:16,padding:'18px 20px',cursor:'pointer',transition:'border-color .2s',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:bias.color,opacity:.5,borderRadius:'16px 16px 0 0'}}/>
      {!isLive&&<div style={{position:'absolute',top:10,right:10,background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:4,padding:'1px 6px',fontSize:9,color:'#f59e0b',fontFamily:'"DM Mono",monospace'}}>BASELINE</div>}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#2d3d50'}}>#{index+1}</div>
          <div>
            <div style={{fontFamily:'"Syne",sans-serif',fontSize:20,fontWeight:800,color:'#f0f4ff',lineHeight:1}}>{setup.symbol}</div>
            <div style={{color:'#8b9fc0',fontSize:11,marginTop:2}}>{setup.setupType}</div>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
          <div style={{background:bias.bg,border:'1px solid '+bias.border,borderRadius:5,padding:'2px 8px',color:bias.color,fontSize:10,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{bias.label}</div>
          <div style={{color:urg.color,fontSize:13}}>{urg.label}</div>
        </div>
      </div>
      <div style={{background:'rgba(37,99,235,0.07)',border:'1px solid rgba(37,99,235,0.18)',borderRadius:8,padding:'8px 12px',marginBottom:10}}>
        <div style={{color:'#4a5c7a',fontSize:9,fontFamily:'"DM Mono",monospace',marginBottom:3,letterSpacing:'.06em'}}>RECOMMENDED TRADE</div>
        <div style={{color:'#60a5fa',fontSize:13,fontWeight:600}}>{setup.optionsTrade}</div>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{color:'#4a5c7a',fontSize:9,fontFamily:'"DM Mono",monospace',marginBottom:4}}>CONFIDENCE</div>
        <ConfBar score={setup.confidence}/>
      </div>
      <div style={{display:'flex',gap:14,marginBottom:10}}>
        {[['ENTRY',setup.entry,'#f59e0b'],['TARGET',setup.target,'#10b981'],['STOP',setup.stop,'#ef4444']].map(([l,v,c])=>(
          <div key={l} style={{flex:1}}>
            <div style={{color:'#2d3d50',fontSize:9,fontFamily:'"DM Mono",monospace',marginBottom:2}}>{l}</div>
            <div style={{color:c,fontSize:12,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
        {(setup.frameworks||[]).map(fw=>(
          <span key={fw} style={{background:(FWCOLS[fw]||'#8b5cf6')+'18',border:'1px solid '+(FWCOLS[fw]||'#8b5cf6')+'35',color:FWCOLS[fw]||'#8b5cf6',borderRadius:4,padding:'1px 7px',fontSize:9,fontFamily:'"DM Mono",monospace'}}>{fw}</span>
        ))}
      </div>
      {expanded&&<div style={{borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:12,marginTop:12}}>
        <span style={{color:'#f59e0b',fontFamily:'"DM Mono",monospace',fontSize:10}}>WHY NOW — </span>
        <span style={{color:'#8b9fc0',fontSize:12,lineHeight:1.7}}>{setup.keyFactor}</span>
      </div>}
      <div style={{textAlign:'center',marginTop:8,color:'#2d3d50',fontSize:10}}>{expanded?'▲':'▼'}</div>
    </div>
  )
}

function TierGate({onUpgrade}){
  return(
    <div style={{background:'rgba(37,99,235,0.06)',border:'1px solid rgba(37,99,235,0.2)',borderRadius:16,padding:'24px 28px',marginBottom:24,display:'flex',alignItems:'center',justifyContent:'space-between',gap:20,flexWrap:'wrap'}}>
      <div>
        <div style={{fontFamily:'"Syne",sans-serif',fontSize:16,fontWeight:800,color:'#f0f4ff',marginBottom:6}}>🔒 Upgrade to Pro for Live AI Scans</div>
        <div style={{color:'#8b9fc0',fontSize:13,maxWidth:460,lineHeight:1.6}}>Pro members get real-time AI scans across 60+ symbols, automatically refreshing every 5 minutes with live market data. The 100-analyst engine runs continuously so you never miss a setup.</div>
        <div style={{display:'flex',gap:16,marginTop:12,flexWrap:'wrap'}}>
          {['60+ symbol universe','Auto-refresh every 5min','All 100 analyst frameworks','Specific strike recommendations','Live options chain data'].map(f=>(
            <div key={f} style={{display:'flex',alignItems:'center',gap:6,color:'#10b981',fontSize:11}}>
              <span>✓</span><span>{f}</span>
            </div>
          ))}
        </div>
      </div>
      <a href="/app/billing" style={{padding:'12px 24px',background:'#2563eb',border:'none',borderRadius:10,color:'white',fontSize:13,fontWeight:700,cursor:'pointer',textDecoration:'none',whiteSpace:'nowrap',fontFamily:'"DM Mono",monospace'}}>
        Upgrade to Pro →
      </a>
    </div>
  )
}

function PulsingDot({color='#10b981'}){
  return <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block',animation:'livepulse 1.5s ease infinite',flexShrink:0}}/>
}

export default function TopSetups(){
  const[setups,setSetups]=useState(BASELINE_SETUPS)
  const[isLive,setIsLive]=useState(false)
  const[scanning,setScanning]=useState(false)
  const[scanStatus,setScanStatus]=useState('Initializing AI scan...')
  const[lastScan,setLastScan]=useState(null)
  const[nextScan,setNextScan]=useState(null)
  const[countdown,setCountdown]=useState(null)
  const[filter,setFilter]=useState('all')
  const[scanCount,setScanCount]=useState(0)
  const[tier,setTier]=useState('free')
  const[scanMeta,setScanMeta]=useState(null)
  const intervalRef=useRef(null)
  const countdownRef=useRef(null)
  const REFRESH_MS=5*60*1000

  const runScan=useCallback(async(silent=false)=>{
    if(scanning)return
    if(!silent)setScanStatus('Scanning '+new Date().toLocaleTimeString()+'...')
    setScanning(true)
    try{
      const{data:{session}}=await supabase.auth.getSession()
      const r=await fetch('/api/analysis?type=scan',{headers:{'Authorization':'Bearer '+session?.access_token}})
      if(!r.ok)throw new Error('HTTP '+r.status)
      const d=await r.json()
      setTier(d.tier||'free')
      if(d.setups&&d.setups.length>0){
        setSetups(d.setups)
        setIsLive(true)
        setScanCount(c=>c+1)
        const now=new Date()
        setLastScan(now)
        setNextScan(new Date(now.getTime()+REFRESH_MS))
        setScanMeta({scanned:d.scanned,qualified:d.qualified,filtered:d.filtered})
        setScanStatus('Live — '+d.setups.length+' setups found across '+d.qualified+' qualified symbols')
      }
    }catch(err){setScanStatus(isLive?'Live (cached) — retrying...':'Using baseline intelligence — live scan queued')}
    finally{setScanning(false)}
  },[scanning,isLive])

  useEffect(()=>{
    countdownRef.current=setInterval(()=>{if(nextScan){const r=Math.max(0,Math.round((nextScan-Date.now())/1000));setCountdown(r)}},1000)
    return()=>clearInterval(countdownRef.current)
  },[nextScan])

  useEffect(()=>{
    runScan()
    intervalRef.current=setInterval(()=>runScan(true),REFRESH_MS)
    return()=>clearInterval(intervalRef.current)
  },[])

  const fws=['all','breakout','momentum','earnings','fibonacci','macro','technical','options','sympathy','sector','the_strat','value']
  const filtered=filter==='all'?setups:setups.filter(s=>(s.frameworks||[]).includes(filter))

  return(
    <div style={{padding:'24px 28px',minHeight:'100vh',background:'#080c14',color:'#f0f4ff',fontFamily:'"DM Sans",sans-serif'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes livepulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(16,185,129,.4)}50%{opacity:.7;box-shadow:0 0 0 5px rgba(16,185,129,0)}}@keyframes slidein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fwbtn{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:5px 12px;color:#8b9fc0;font-family:"DM Mono",monospace;font-size:10px;cursor:pointer;transition:all .15s}.fwbtn:hover,.fwbtn.act{background:rgba(37,99,235,.12);border-color:rgba(37,99,235,.35);color:#60a5fa}`}</style>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:14}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:26,fontWeight:800,margin:'0 0 5px'}}>AnkushAI Top Setups</h1>
          <p style={{color:'#8b9fc0',fontSize:13,margin:0,maxWidth:500}}>100 analyst frameworks. 60+ symbol universe. Penny stock gate enforced. Every setup includes the exact options contract.</p>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8,background:isLive?'rgba(16,185,129,0.08)':'rgba(245,158,11,0.08)',border:'1px solid '+(isLive?'rgba(16,185,129,0.2)':'rgba(245,158,11,0.2)'),borderRadius:8,padding:'6px 12px'}}>
            <PulsingDot color={isLive?'#10b981':'#f59e0b'}/>
            <span style={{color:isLive?'#10b981':'#f59e0b',fontSize:11,fontFamily:'"DM Mono",monospace',fontWeight:600}}>
              {scanning?'SCANNING MARKET...':isLive?'LIVE INTELLIGENCE':'BASELINE MODE'}
            </span>
          </div>
          {scanning&&<div style={{display:'flex',alignItems:'center',gap:6,color:'#4a5c7a',fontSize:10,fontFamily:'"DM Mono",monospace'}}>
            <span style={{width:12,height:12,borderRadius:'50%',border:'2px solid rgba(96,165,250,.2)',borderTopColor:'#60a5fa',animation:'spin .6s linear infinite',display:'inline-block'}}/>
            Running 100 analyst frameworks...
          </div>}
          {!scanning&&nextScan&&countdown!==null&&<div style={{color:'#2d3d50',fontSize:10,fontFamily:'"DM Mono",monospace'}}>
            Next scan in {countdown>60?Math.floor(countdown/60)+'m '+(countdown%60)+'s':countdown+'s'}
          </div>}
          <button onClick={()=>runScan(false)} disabled={scanning} style={{padding:'6px 14px',background:'rgba(37,99,235,0.1)',border:'1px solid rgba(37,99,235,0.25)',borderRadius:8,color:'#60a5fa',fontSize:11,cursor:scanning?'default':'pointer',fontFamily:'"DM Mono",monospace',opacity:scanning?.5:1}}>
            ↻ Force Rescan
          </button>
        </div>
      </div>

      {/* Tier gate — only show to free users */}
      {tier==='free'&&!isLive&&<TierGate/>}

      {/* Stats row */}
      <div style={{display:'flex',gap:20,marginBottom:18,flexWrap:'wrap'}}>
        {[['SETUPS',setups.length,'#f0f4ff'],['HIGH CONF (8+)',setups.filter(s=>s.confidence>=8).length,'#10b981'],['BULLISH',setups.filter(s=>s.bias==='bullish').length,'#10b981'],['BEARISH',setups.filter(s=>s.bias==='bearish').length,'#ef4444'],['SCANS TODAY',scanCount,'#60a5fa']].map(([l,v,c])=>(
          <div key={l}><div style={{color:'#2d3d50',fontSize:9,fontFamily:'"DM Mono",monospace',letterSpacing:'.07em',marginBottom:2}}>{l}</div><div style={{color:c,fontSize:22,fontWeight:700,fontFamily:'"DM Mono",monospace',lineHeight:1}}>{v}</div></div>
        ))}
        {scanMeta&&<div>
          <div style={{color:'#2d3d50',fontSize:9,fontFamily:'"DM Mono",monospace',marginBottom:2}}>UNIVERSE</div>
          <div style={{color:'#4a5c7a',fontSize:13,fontFamily:'"DM Mono",monospace'}}>{scanMeta.scanned} scanned · {scanMeta.qualified} qualified · {scanMeta.filtered} filtered</div>
        </div>}
        {lastScan&&<div>
          <div style={{color:'#2d3d50',fontSize:9,fontFamily:'"DM Mono",monospace',marginBottom:2}}>LAST SCAN</div>
          <div style={{color:'#4a5c7a',fontSize:13,fontFamily:'"DM Mono",monospace'}}>{lastScan.toLocaleTimeString()}</div>
        </div>}
      </div>

      {/* Status */}
      <div style={{background:'rgba(37,99,235,0.05)',border:'1px solid rgba(37,99,235,0.12)',borderRadius:8,padding:'8px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
        <span style={{color:'#60a5fa',fontSize:10,fontFamily:'"DM Mono",monospace'}}>⚡</span>
        <span style={{color:'#4a5c7a',fontSize:11,fontFamily:'"DM Mono",monospace'}}>{scanStatus}</span>
      </div>

      {/* Framework filters */}
      <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
        {fws.map(fw=>(
          <button key={fw} className={'fwbtn'+(filter===fw?' act':'')} onClick={()=>setFilter(fw)}>
            {fw==='all'?'All Frameworks':fw}
          </button>
        ))}
      </div>

      {/* Setups grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:14}}>
        {filtered.map((setup,i)=>(
          <div key={setup.symbol+i} style={{animation:'slidein .3s ease'}}>
            <SetupCard setup={setup} index={i} isLive={isLive}/>
          </div>
        ))}
      </div>

      {filtered.length===0&&<div style={{textAlign:'center',padding:'40px',color:'#4a5c7a'}}>No {filter} setups in current scan. Try a different framework filter.</div>}

      {/* Penny stock gate info */}
      {isLive&&scanMeta&&<div style={{marginTop:20,padding:'10px 14px',background:'rgba(16,185,129,0.04)',borderRadius:8,border:'1px solid rgba(16,185,129,0.1)'}}>
        <div style={{color:'#10b981',fontSize:10,fontFamily:'"DM Mono",monospace',marginBottom:4}}>✓ PENNY STOCK GATE ACTIVE</div>
        <div style={{color:'#2d3d50',fontSize:11}}>All setups filtered: price &gt; $5, avg volume &gt; 500K/day, market cap &gt; $1B. Only symbols with liquid options chains are considered.</div>
      </div>}

      {/* Disclaimer */}
      <div style={{marginTop:20,padding:'12px 16px',background:'rgba(255,255,255,0.02)',borderRadius:8,border:'1px solid rgba(255,255,255,0.04)'}}>
        <div style={{color:'#2d3d50',fontSize:11,lineHeight:1.6}}>⚠️ AnkushAI Top Setups are AI-generated analysis synthesizing technical, macro, and fundamental frameworks. Not financial advice. Options involve significant risk including potential total loss of premium.</div>
      </div>
    </div>
  )
}