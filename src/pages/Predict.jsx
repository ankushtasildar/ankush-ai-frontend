import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const SYMS=['SPY','QQQ','NVDA','AAPL','MSFT','META','TSLA','AMD','GOOGL','PLTR','CRWD','COIN','MSTR','JPM','GS','IWM','AVGO','NFLX','LLY','XOM','V','MA','AMZN','ORCL','HOOD']
const COLS=['#10b981','#f59e0b','#ef4444']

function ProbBar({label,prob,color}){
  return(
    <div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
        <span style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)'}}>{label}</span>
        <span style={{fontSize:15,fontWeight:700,color:color}}>{prob}%</span>
      </div>
      <div style={{height:8,background:'rgba(255,255,255,0.06)',borderRadius:4,overflow:'hidden'}}>
        <div style={{height:'100%',width:prob+'%',background:color,borderRadius:4,transition:'width 1s ease'}}/>
      </div>
    </div>
  )
}

function SentDot({label,value}){
  const c=value==='bullish'?'#10b981':value==='bearish'?'#ef4444':'#f59e0b'
  return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <div style={{width:10,height:10,borderRadius:'50%',background:c,boxShadow:'0 0 5px '+c}}/>
      <span style={{fontSize:10,color:'var(--text-muted)'}}>{label}</span>
    </div>
  )
}

function ScenCard({s,idx}){
  const [open,setOpen]=useState(false)
  const c=COLS[idx%3]
  const bg=idx===0?'rgba(16,185,129,0.06)':idx===1?'rgba(245,158,11,0.06)':'rgba(239,68,68,0.06)'
  return(
    <div style={{flex:1,minWidth:230,border:'1px solid '+c+'44',borderRadius:10,overflow:'hidden',background:bg}}>
      <div style={{padding:'12px 14px',cursor:'pointer'}} onClick={()=>setOpen(v=>!v)}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:700,fontSize:14,color:c}}>{s.name}</span>
          <span style={{fontWeight:700,fontSize:22,color:c}}>{s.probability}%</span>
        </div>
        <div style={{fontSize:13,color:'var(--text-primary)',marginTop:3}}>
          {s.priceTarget?'$'+Number(s.priceTarget).toFixed(2):''}
          {' '}<span style={{color:c}}>{s.percentMove}</span>
          <span style={{fontSize:11,color:'var(--text-muted)',marginLeft:8}}>{s.timeToPlay}</span>
        </div>
      </div>
      {open&&(
        <div style={{padding:'0 14px 14px'}}>
          <div style={{fontSize:11,fontWeight:700,color:c,textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Alpha Rationale</div>
          <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,marginBottom:8}}>{s.alphaRationale}</div>
          <div style={{fontSize:11,fontWeight:700,color:'#10b981',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Entry Trigger</div>
          <div style={{fontSize:13,color:'#10b981',lineHeight:1.5,marginBottom:8}}>{s.entryTrigger}</div>
          {(s.whatToWatch||[]).map((w,k)=>(
            <div key={k} style={{fontSize:12,color:'var(--text-secondary)',marginBottom:3}}>{w}</div>
          ))}
          {s.invalidatedBy&&(
            <div style={{fontSize:12,color:'#ef4444',borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:8,marginTop:8}}>
              Invalidated: {s.invalidatedBy}
            </div>
          )}
          {s.positionStrategy&&(
            <div style={{fontSize:12,color:'#7c3aed',background:'rgba(124,58,237,0.1)',borderRadius:6,padding:'6px 10px',marginTop:6}}>
              {s.positionStrategy}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
export default function Predict(){
  const nav=useNavigate()
  const [sym,setSym]=useState('SPY')
  const [loading,setLoading]=useState(false)
  const [data,setData]=useState(null)
  const [error,setError]=useState(null)
  const [copied,setCopied]=useState(false)
  const [history,setHistory]=useState(()=>{try{return JSON.parse(localStorage.getItem('alpha_history')||'[]')}catch{return []}})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTickers = async (q) => {
    if (!q || q.length < 1) { setSearchResults([]); return }
    setSearchLoading(true)
    try {
      const r = await fetch('/api/symbols?q='+q.toUpperCase().trim()+'&limit=8')
      if (r.ok) { const d = await r.json(); setSearchResults(d.results||[]) }
    } catch(e) {} finally { setSearchLoading(false) }
  }

  function run(){
    const s=sym.trim().toUpperCase()
    if(!s)return
    setLoading(true);setError(null);setData(null)
    fetch('/api/predict?symbol='+s+'&_t='+Date.now(),{signal:AbortSignal.timeout(120000)})
      .then(r=>r.json())
      .then(d=>{d.error?setError(d.error):setData(d)
      // Priya: persist to local history (last 5)
      const entry={sym:s,thesis:d.leadingThesis?.substring(0,100),confidence:(d.sentiment?.confidence||d.confidence),edgeScore:d.edgeScore,ts:Date.now()}
      setHistory(prev=>{const next=[entry,...prev.filter(x=>x.sym!==s)].slice(0,5);localStorage.setItem('alpha_history',JSON.stringify(next));return next})})
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false))
  }

  const card={background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:14,marginBottom:12}
  const ct={fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:10}
  const sent=data&&data.sentiment
  const sc=!sent?'#fff':sent.overall==='bullish'?'#10b981':sent.overall==='bearish'?'#ef4444':'#f59e0b'

  return(
    <div style={{background:'var(--bg-base)',minHeight:'100vh',padding:'14px 16px',fontFamily:'var(--font)',color:'var(--text-primary)'}}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:22,fontWeight:700,marginBottom:2}}>Alpha Intelligence</div>
        <div style={{fontSize:13,color:'var(--text-muted)'}}>Institutional-grade AI analysis · Live market data · Options flow · Scenario modeling</div>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
        <input value={sym} onChange={e=>setSym(e.target.value.toUpperCase())}
               onKeyDown={e=>e.key==='Enter'&&run()} placeholder='NVDA'
               style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-primary)',padding:'9px 14px',fontSize:16,fontWeight:700,width:100,textTransform:'uppercase'}}/>
        <button onClick={run} disabled={loading}
                style={{background:'linear-gradient(135deg,#7c3aed,#2563eb)',color:'#fff',border:'none',borderRadius:8,padding:'9px 22px',cursor:'pointer',fontWeight:700,fontSize:14}}>
          {loading?'Computing...':'Get Alpha'}
        </button>
        {history.length > 0 && (
            <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6,paddingTop:6,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
              <span style={{fontSize:10,color:'var(--text-dim)',alignSelf:'center',marginRight:2}}>Recent:</span>
              {history.map(h=>(
                <button key={h.sym+h.ts} onClick={()=>{setSym(h.sym)}}
                  style={{background:'rgba(37,99,235,0.08)',color:'#6b7fa3',border:'1px solid rgba(37,99,235,0.15)',borderRadius:5,padding:'3px 9px',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                  {h.sym} <span style={{opacity:0.5,fontWeight:400}}>{h.confidence}%</span>
                </button>
              ))}
            </div>
          )}
          {/* preset chips */}
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {/* Marcus/Priya: Open ticker search — any NYSE/NASDAQ symbol */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,padding:'6px 10px',background:'var(--bg-card)',borderRadius:10,border:'1px solid rgba(255,255,255,0.06)'}}>
            <span style={{fontSize:14,color:'var(--text-muted)'}}>🔍</span>
            <input
              value={searchQuery}
              onChange={e=>{setSearchQuery(e.target.value);searchTickers(e.target.value)}}
              onKeyDown={e=>{if(e.key==='Enter'&&searchQuery.trim()){setSym(searchQuery.toUpperCase().trim());setSearchQuery('');setSearchResults([])}}}
              placeholder="Search any ticker — NVDA, AAPL, ARM, TSM..."
              style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--text-primary)',fontSize:13,fontFamily:'var(--font-sans)'}}
            />
            {searchLoading && <span style={{fontSize:11,color:'var(--text-muted)'}}>…</span>}
          </div>
          {searchResults.length > 0 && (
            <div style={{position:'absolute',zIndex:100,top:72,left:0,right:0,background:'var(--bg-elevated)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,overflow:'hidden',boxShadow:'0 8px 32px rgba(0,0,0,0.4)'}}>
              {searchResults.map(r=>(
                <button key={r.ticker} onClick={()=>{setSym(r.ticker);setSearchQuery('');setSearchResults([])}}
                  style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 14px',background:'transparent',border:'none',borderBottom:'1px solid rgba(255,255,255,0.04)',cursor:'pointer',textAlign:'left'}}>
                  <span style={{fontWeight:700,color:'var(--accent)',fontSize:13,minWidth:50}}>{r.ticker}</span>
                  <span style={{color:'var(--text-muted)',fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>
                  <span style={{marginLeft:'auto',fontSize:11,color:'#64748b',whiteSpace:'nowrap'}}>{r.market||''}</span>
                </button>
              ))}
            </div>
          )}
          {SYMS.map(s=>(
            <button key={s} onClick={()=>setSym(s)}
                    style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text-secondary)',padding:'4px 8px',cursor:'pointer',fontSize:12}}>
              {s}
            </button>
          ))}
        </div>
      </div>
      {loading&&(
        <div style={{marginTop:16}}>
          <style>{'@keyframes shimmer{0%,100%{opacity:0.4}50%{opacity:0.75}}'}</style>
          {[{w:'45%'},{w:'92%'},{w:'78%'},{w:'85%'}].map((r,i)=>(
            <div key={i} style={{background:'var(--bg-card)',borderRadius:10,padding:'16px 20px',marginBottom:10,animation:'shimmer 1.5s ease-in-out infinite',animationDelay:i*0.15+'s'}}>
              <div style={{height:i===0?16:9,background:'#1a2c42',borderRadius:5,width:r.w,marginBottom:i===0?8:0}}/>
              {i===0&&<><div style={{height:8,background:'#101d2c',borderRadius:4,width:'80%',marginBottom:5}}/><div style={{height:8,background:'#101d2c',borderRadius:4,width:'60%'}}/></>}
            </div>
          ))}
          <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:12,marginTop:10}}>⚡ Computing institutional analysis…</div>
        </div>
      )}
      {error&&(
        <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:10,padding:14,color:'#ef4444',fontSize:13}}>{error}</div>
      )}
      {data&&!loading&&(
        <div>
          <div style={{...card,background:'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(37,99,235,0.06))',border:'1px solid rgba(124,58,237,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,flexWrap:'wrap',gap:12}}>
              <div>
                <span style={{fontSize:28,fontWeight:700,cursor:'pointer',color:'var(--accent)'}} onClick={()=>nav('/app/charts?symbol='+data.symbol)}>{data.symbol}</span>
                <button onClick={()=>{
                  const txt=data.symbol+' $'+Number(data.currentPrice).toFixed(2)+' | '+(data.sentiment?.overall||'').toUpperCase()+' | Confidence: '+(data.sentiment?.confidence||data.confidence)+'% | Edge: '+data.edgeScore+'/100 | '+(data.leadingThesis||'').substring(0,100)+'... via AnkushAI ankushai.org'
                  navigator.clipboard?.writeText(txt).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500)}).catch(()=>{})
                }} style={{marginLeft:10,background:copied?'rgba(16,185,129,0.15)':'rgba(255,255,255,0.06)',border:'1px solid '+(copied?'rgba(16,185,129,0.4)':'rgba(255,255,255,0.1)'),borderRadius:7,padding:'5px 11px',color:copied?'#10b981':'#8899aa',fontSize:11,fontWeight:600,cursor:'pointer',transition:'all .2s'}}>
                  {copied?'✓ Copied':'⎘ Share'}
                </button>
                <span style={{fontSize:20,fontWeight:600,marginLeft:12}}>${Number(data.currentPrice).toFixed(2)}</span>
                <span style={{fontSize:14,color:sc,marginLeft:12,textTransform:'capitalize',fontWeight:600}}>{sent&&sent.overall}</span>
              </div>
              <div style={{display:'flex',gap:20}}>
                {[['Confidence',(data.sentiment?.confidence||data.confidence)+'%',sc],['Edge',(data.edgeScore||0)+'/100',data.edgeScore>=70?'#10b981':data.edgeScore>=50?'#f59e0b':'#ef4444']].map(([l,v,c])=>(
                  <div key={l} style={{textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase'}}>{l}</div>
                    <div style={{fontSize:20,fontWeight:700,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(124,58,237,0.9)',marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>Leading Thesis</div>
            <div style={{fontSize:14,lineHeight:1.7,color:'var(--text-primary)',marginBottom:10}}>{data.leadingThesis}</div>
            {data.alphaEdge&&(
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'rgba(37,99,235,0.9)',marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>Institutional Edge</div>
                <div style={{fontSize:13,lineHeight:1.6,color:'var(--text-secondary)'}}>{data.alphaEdge}</div>
              </div>
            )}
          </div>
          {/* Marcus: Track Record — historical accuracy from outcome resolution loop */}
          {data.historicalEdge && data.historicalEdge.total > 0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center',padding:'10px 14px',background:'rgba(16,185,129,0.05)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:8,marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:'#10b981',textTransform:'uppercase',letterSpacing:'0.05em'}}>Track Record</div>
              <div style={{display:'flex',gap:16,flex:1,flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontSize:14,fontWeight:700,color:parseInt(data.historicalEdge.winRate)>=60?'#10b981':parseInt(data.historicalEdge.winRate)>=50?'#f59e0b':'#ef4444'}}>
                  {data.historicalEdge.winRate}% Win Rate
                </span>
                <span style={{fontSize:12,color:'var(--text-muted)'}}>{data.historicalEdge.total} predictions tracked</span>
                {data.historicalEdge.recent?.length > 0 && (
                  <span style={{display:'flex',gap:3,alignItems:'center'}}>
                    {data.historicalEdge.recent.map((o,i)=>(
                      <span key={i} style={{width:8,height:8,borderRadius:'50%',display:'inline-block',background:o==='win'?'#10b981':o==='loss'?'#ef4444':'#64748b'}} title={o}/>
                    ))}
                  </span>
                )}
              </div>
            </div>
          )}
          {sent&&(
            <div style={card}>
              <div style={ct}>Sentiment - Multi-Timeframe</div>
              <div style={{display:'flex',gap:20,alignItems:'flex-end',marginBottom:10}}>
                <SentDot label='90 Day' value={sent['90day']}/>
                <SentDot label='30 Day' value={sent['30day']}/>
                <SentDot label='7 Day' value={sent['7day']}/>
                <SentDot label='Today' value={sent.today}/>
                <div style={{marginLeft:'auto',textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--text-muted)'}}>Momentum</div>
                  <div style={{fontSize:14,fontWeight:700,textTransform:'capitalize',color:sent.momentum==='accelerating'?'#10b981':sent.momentum==='decelerating'?'#ef4444':'#f59e0b'}}>{sent.momentum}</div>
                </div>
              </div>
              {sent.note&&<div style={{fontSize:13,color:'var(--text-secondary)',fontStyle:'italic',borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:8}}>{sent.note}</div>}
            </div>
          )}
          <div style={card}>
            <div style={ct}>Scenario Probabilities</div>
            {(data.scenarios||[]).map((s,i)=><ProbBar key={i} label={s.name} prob={s.probability} color={COLS[i%3]}/>)}
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>
            {(data.scenarios||[]).map((s,i)=><ScenCard key={i} s={s} idx={i}/>)}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div style={card}>
              <div style={ct}>Institutional Levels</div>
              {data.institutionalLevels&&Object.entries(data.institutionalLevels).map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:13}}>
                  <span style={{color:'var(--text-secondary)',textTransform:'capitalize'}}>{k.replace(/([A-Z])/g,' $1')}</span>
                  <span style={{fontWeight:700}}>${Number(v).toFixed(2)}</span>
                </div>
              ))}
              {data.rawData&&data.rawData.supdem&&(
                <div style={{marginTop:8,fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>{data.rawData.supdem.interpretation}</div>
              )}
            </div>
            <div style={card}>
              <div style={ct}>Sector Rotation</div>
              <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.7}}>{data.sectorRotationView}</div>
              {data.rawData&&data.rawData.rotation&&(
                <div style={{fontSize:12,fontWeight:600,padding:'5px 10px',borderRadius:6,background:'rgba(255,255,255,0.04)',marginTop:8,color:(data.rawData.rotation.signal||'').includes('IN')?'#10b981':(data.rawData.rotation.signal||'').includes('OUT')?'#ef4444':'#f59e0b'}}>
                  {data.rawData.rotation.sector}: {data.rawData.rotation.signal}
                </div>
              )}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div style={card}>
              <div style={ct}>Leading Indicators</div>
              {(data.leadingIndicatorsToTrack||[]).map((l,i)=>(
                <div key={i} style={{fontSize:13,color:'var(--text-secondary)',marginBottom:6,display:'flex',gap:8}}>
                  <span style={{color:'var(--accent)',fontWeight:700,minWidth:16}}>{i+1}.</span>{l}
                </div>
              ))}
            </div>
            <div>
              <div style={{...card,marginBottom:10}}>
                <div style={ct}>Options Alpha</div>
                <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6}}>{typeof data.optionsAlpha === 'object' ? [data.optionsAlpha.recommendedStrategy, data.optionsAlpha.ivEnvironment && ' | IV: ' + data.optionsAlpha.ivEnvironment, data.optionsAlpha.strikeSelection && ' | Strikes: ' + data.optionsAlpha.strikeSelection, data.optionsAlpha.expiryGuidance && ' | Expiry: ' + data.optionsAlpha.expiryGuidance, data.optionsAlpha.exitRules && ' | Exit: ' + data.optionsAlpha.exitRules].filter(Boolean).join('') : data.optionsAlpha}</div>
              </div>
              <div style={card}>
                <div style={ct}>Time Decay Warning</div>
                <div style={{fontSize:13,color:'#f59e0b',lineHeight:1.6}}>{data.timeDecay}</div>
              </div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div style={card}>
              <div style={ct}>Macro Tailwinds</div>
              {(data.macroTailwinds||[]).map((t,i)=><div key={i} style={{fontSize:13,color:'#10b981',marginBottom:5}}>+ {t}</div>)}
            </div>
            <div style={card}>
              <div style={ct}>Macro Headwinds</div>
              {(data.macroHeadwinds||[]).map((h,i)=><div key={i} style={{fontSize:13,color:'#ef4444',marginBottom:5}}>- {h}</div>)}
            </div>
          </div>
          {data.rawData&&data.rawData.macro&&(
            <div style={{...card,background:'rgba(255,255,255,0.01)'}}>
              <div style={ct}>Macro Regime Inputs</div>
              <div style={{display:'flex',gap:20,flexWrap:'wrap',fontSize:12}}>
                {[['VIX',data.rawData.macro.vix+' ('+data.rawData.macro.vixTrend+')'],['Regime',data.rawData.macro.regime],['SPY 5d',data.rawData.macro.spy5d+'%'],['Bonds',data.rawData.macro.tltChg+'%'],['Credit',data.rawData.macro.hygChg+'%']].map(([l,v])=>(
                  <div key={l}><span style={{color:'var(--text-muted)'}}>{l}: </span><span style={{color:'var(--text-secondary)',fontWeight:600}}>{v}</span></div>
                ))}
              </div>
            </div>
          )}
          <div style={{fontSize:11,color:'var(--text-muted)',textAlign:'right',marginTop:8}}>
            {new Date(data.generatedAt).toLocaleTimeString()} - Prices via Polygon - Alpha by AnkushAI
          </div>
        </div>
      )}
    </div>
  )
}