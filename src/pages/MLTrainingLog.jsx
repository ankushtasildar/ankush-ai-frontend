// src/pages/MLTrainingLog.jsx — AnkushAI Admin ML Training Monitor
// Jordan Hayes (Design) + Marcus Webb (Quant) + Alex Torres (Infra)
// Shows the full history of ML training runs with validation rates,
// pattern confidence, and audit trail for every thesis vs outcome.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

async function fetchRuns(limit=100, offset=0, filter={}) {
  let url = SUPA_URL+'/rest/v1/ml_training_runs?order=started_at.desc&limit='+limit+'&offset='+offset+'&select=*'
  if (filter.symbol) url += '&symbol=eq.'+filter.symbol
  if (filter.status) url += '&status=eq.'+filter.status
  if (filter.validated !== undefined) url += '&thesis_validated=eq.'+filter.validated
  const r = await fetch(url, { headers:{ apikey:SUPA_ANON, Authorization:'Bearer '+SUPA_ANON } })
  return r.json()
}

async function fetchStats() {
  // Aggregate stats from last 500 runs
  const r = await fetch(SUPA_URL+'/rest/v1/ml_training_runs?order=started_at.desc&limit=500&select=thesis_validated,computed_bias,outcome_5d_pct,symbol,status', {
    headers:{ apikey:SUPA_ANON, Authorization:'Bearer '+SUPA_ANON }
  })
  return r.json()
}

function StatCard({ label, value, sub, color='var(--accent)' }) {
  return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 18px',flex:1,minWidth:120}}>
      <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color,fontFamily:'var(--font-mono)'}}>{value}</div>
      {sub && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{sub}</div>}
    </div>
  )
}

function RunRow({ run, onClick }) {
  const validated = run.thesis_validated
  const statusColor = run.status==='completed' ? (validated===true?'#10b981':validated===false?'#ef4444':'#64748b') : run.status==='failed'?'#ef4444':'#f59e0b'
  const biasColor = run.computed_bias==='bullish'?'#10b981':run.computed_bias==='bearish'?'#ef4444':'#f59e0b'
  const outcomeColor = (run.outcome_5d_pct||0)>=0?'#10b981':'#ef4444'
  
  return (
    <tr onClick={onClick} style={{cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)'}}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <td style={{padding:'8px 10px',fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>
        {run.started_at ? new Date(run.started_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}) : '—'}
      </td>
      <td style={{padding:'8px 10px',fontSize:12,fontWeight:700,color:'var(--accent)'}}>{run.symbol}</td>
      <td style={{padding:'8px 10px',fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{run.analysis_date}</td>
      <td style={{padding:'8px 10px',fontSize:11,fontFamily:'var(--font-mono)'}}>
        {run.price_at_analysis ? '$'+run.price_at_analysis.toFixed(2) : '—'}
      </td>
      <td style={{padding:'8px 6px'}}>
        <span style={{background:biasColor+'18',color:biasColor,padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,textTransform:'uppercase'}}>
          {run.computed_bias||'—'}
        </span>
      </td>
      <td style={{padding:'8px 10px',fontSize:11,color:'var(--text-muted)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {run.thesis || '—'}
      </td>
      <td style={{padding:'8px 10px',fontSize:12,fontFamily:'var(--font-mono)',color:outcomeColor,fontWeight:700}}>
        {run.outcome_5d_pct !== null && run.outcome_5d_pct !== undefined ? (run.outcome_5d_pct>=0?'+':'')+run.outcome_5d_pct+'%' : '—'}
      </td>
      <td style={{padding:'8px 6px',textAlign:'center'}}>
        {validated === true  && <span style={{fontSize:16}} title="Validated">✅</span>}
        {validated === false && <span style={{fontSize:16}} title="Invalidated">❌</span>}
        {validated === null  && run.status==='completed' && <span style={{fontSize:16,opacity:0.4}} title="No outcome data">⏳</span>}
        {run.status === 'failed' && <span style={{fontSize:16}} title="Run failed">⚠️</span>}
      </td>
    </tr>
  )
}

function RunDetail({ run, onClose }) {
  if (!run) return null
  const signals = run.signals_snapshot ? JSON.parse(run.signals_snapshot) : {}
  const news = run.news_context ? JSON.parse(run.news_context) : []
  const validated = run.thesis_validated
  
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
         onClick={onClose}>
      <div style={{background:'var(--bg-elevated)',borderRadius:14,padding:24,maxWidth:680,width:'100%',maxHeight:'85vh',overflowY:'auto',border:'1px solid var(--border)'}}
           onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>{run.symbol} — {run.analysis_date}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{run.run_id}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:18,padding:4}}>✕</button>
        </div>
        
        {/* Status banner */}
        <div style={{padding:'10px 14px',borderRadius:8,marginBottom:16,
          background: validated===true?'rgba(16,185,129,0.08)':validated===false?'rgba(239,68,68,0.08)':'rgba(100,116,139,0.08)',
          border:'1px solid '+(validated===true?'rgba(16,185,129,0.2)':validated===false?'rgba(239,68,68,0.2)':'rgba(100,116,139,0.2)')}}>
          <div style={{fontSize:12,fontWeight:700,color:validated===true?'#10b981':validated===false?'#ef4444':'#64748b'}}>
            {validated===true?'✅ THESIS VALIDATED':validated===false?'❌ THESIS INVALIDATED':'⏳ OUTCOME PENDING'}
          </div>
          {run.scoring_note && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{run.scoring_note}</div>}
        </div>
        
        {/* Thesis */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Generated Thesis</div>
          <div style={{fontSize:13,lineHeight:1.6,color:'var(--text-primary)',background:'var(--bg-card)',padding:'10px 14px',borderRadius:8,border:'1px solid var(--border)'}}>
            {run.thesis || 'No thesis generated'}
          </div>
        </div>
        
        {/* Prediction vs Outcome */}
        <div style={{display:'flex',gap:12,marginBottom:14}}>
          <div style={{flex:1,background:'var(--bg-card)',padding:'10px 14px',borderRadius:8,border:'1px solid var(--border)'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Prediction</div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--accent)'}}>{run.predicted_direction?.toUpperCase()||'—'}</div>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>Magnitude: {run.predicted_magnitude_pct||'?'}% | Confidence: {run.model_confidence||'?'}%</div>
          </div>
          <div style={{flex:1,background:'var(--bg-card)',padding:'10px 14px',borderRadius:8,border:'1px solid var(--border)'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Actual Outcome (5d)</div>
            <div style={{fontSize:16,fontWeight:700,color:(run.outcome_5d_pct||0)>=0?'#10b981':'#ef4444'}}>
              {run.outcome_direction?.toUpperCase()||'—'}
            </div>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>5d return: {run.outcome_5d_pct!==null?(run.outcome_5d_pct>=0?'+':'')+run.outcome_5d_pct+'%':'pending'}</div>
          </div>
        </div>
        
        {/* Signals at time of analysis */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Signal Snapshot (at analysis date)</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {[
              ['EMA21','$'+(signals.ema21||'—')],['EMA50','$'+(signals.ema50||'—')],['EMA200','$'+(signals.ema200||'—')],
              ['RSI(14)',signals.rsi14||'—'],['ROC 5d',(signals.roc5>=0?'+':'')+signals.roc5+'%'],['ROC 20d',(signals.roc20>=0?'+':'')+signals.roc20+'%'],
              ['ATR(14)','$'+(signals.atr14||'—')],['Bias Score',(signals.biasScore||'—')+'%'],['Computed',signals.computedBias?.toUpperCase()||'—'],
            ].map(([l,v])=>(
              <div key={l} style={{background:'var(--bg-card)',padding:'6px 10px',borderRadius:6}}>
                <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase'}}>{l}</div>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--font-mono)'}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Primary signal + key risk */}
        {(run.primary_signal || run.key_risk) && (
          <div style={{display:'flex',gap:12,marginBottom:14}}>
            {run.primary_signal && (
              <div style={{flex:1,background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.15)',borderRadius:8,padding:'8px 12px'}}>
                <div style={{fontSize:9,fontWeight:700,color:'#3b82f6',textTransform:'uppercase',marginBottom:3}}>Primary Signal</div>
                <div style={{fontSize:11,color:'var(--text-secondary)'}}>{run.primary_signal}</div>
              </div>
            )}
            {run.key_risk && (
              <div style={{flex:1,background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:8,padding:'8px 12px'}}>
                <div style={{fontSize:9,fontWeight:700,color:'#ef4444',textTransform:'uppercase',marginBottom:3}}>Key Risk</div>
                <div style={{fontSize:11,color:'var(--text-secondary)'}}>{run.key_risk}</div>
              </div>
            )}
          </div>
        )}
        
        {/* News at time */}
        {news.length > 0 && (
          <div>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>News Context at Analysis Date</div>
            {news.map((n,i)=>(
              <div key={i} style={{fontSize:11,color:'var(--text-muted)',padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <span style={{color:'var(--text-primary)',fontWeight:600}}>{n.date}: </span>{n.title}
              </div>
            ))}
          </div>
        )}
        
        <div style={{fontSize:10,color:'var(--text-muted)',marginTop:14,opacity:0.5}}>
          Started: {run.started_at} | Completed: {run.completed_at} | Engine: {run.engine_version}
        </div>
      </div>
    </div>
  )
}

export default function MLTrainingLog() {
  const nav = useNavigate()
  const [runs, setRuns] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState({symbol:'',status:'',validated:''})
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [runsData, statsData] = await Promise.all([fetchRuns(PAGE_SIZE, page*PAGE_SIZE, filter), fetchStats()])
      setRuns(Array.isArray(runsData) ? runsData : [])
      if (Array.isArray(statsData)) {
        const completed = statsData.filter(r=>r.status==='completed')
        const validated = completed.filter(r=>r.thesis_validated===true)
        const invalidated = completed.filter(r=>r.thesis_validated===false)
        const avgOutcome = completed.filter(r=>r.outcome_5d_pct!==null).reduce((s,r)=>s+(r.outcome_5d_pct||0),0)/(completed.filter(r=>r.outcome_5d_pct!==null).length||1)
        const bullValidation = completed.filter(r=>r.computed_bias==='bullish'&&r.thesis_validated===true).length
        const bearValidation = completed.filter(r=>r.computed_bias==='bearish'&&r.thesis_validated===true).length
        const bullTotal = completed.filter(r=>r.computed_bias==='bullish'&&r.thesis_validated!==null).length
        const bearTotal = completed.filter(r=>r.computed_bias==='bearish'&&r.thesis_validated!==null).length
        setStats({
          total:statsData.length, completed:completed.length,
          validated:validated.length, invalidated:invalidated.length,
          validationRate: completed.filter(r=>r.thesis_validated!==null).length>0
            ? Math.round(validated.length/completed.filter(r=>r.thesis_validated!==null).length*100) : 0,
          avgOutcome:+avgOutcome.toFixed(2),
          bullValidationRate: bullTotal>0?Math.round(bullValidation/bullTotal*100):null,
          bearValidationRate: bearTotal>0?Math.round(bearValidation/bearTotal*100):null,
        })
      }
    } catch(e) { console.error('ML log load error', e) }
    setLoading(false)
  }, [filter, page])

  useEffect(() => { load() }, [load])

  const triggerRun = async (mode='single') => {
    setTriggering(true); setTriggerResult(null)
    try {
      const url = '/api/ml-trainer?key=ankushai_admin_2025&mode='+mode+(mode==='batch'?'&n=5':'')
      const r = await fetch(url)
      const d = await r.json()
      setTriggerResult(d)
      setTimeout(load, 3000)  // reload after 3s
    } catch(e) { setTriggerResult({error:e.message}) }
    setTriggering(false)
  }

  return (
    <div style={{padding:'20px 24px',maxWidth:1400,margin:'0 auto',color:'var(--text-primary)'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>🧠 ML Training Log</div>
          <div style={{fontSize:13,color:'var(--text-muted)'}}>
            Blind-drop historical training — every AI thesis vs actual market outcome
          </div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <button onClick={()=>triggerRun('single')} disabled={triggering}
            style={{background:'linear-gradient(135deg,#7c3aed,#3b82f6)',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600,opacity:triggering?0.6:1}}>
            {triggering?'Running...':'▶ Run Single Training'}
          </button>
          <button onClick={()=>triggerRun('batch')} disabled={triggering}
            style={{background:'rgba(124,58,237,0.15)',color:'#7c3aed',border:'1px solid rgba(124,58,237,0.3)',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600,opacity:triggering?0.6:1}}>
            ⚡ Batch (5 runs)
          </button>
          <button onClick={load} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',cursor:'pointer',color:'var(--text-muted)',fontSize:13}}>
            ↺ Refresh
          </button>
        </div>
      </div>
      
      {/* Trigger result toast */}
      {triggerResult && (
        <div style={{background:triggerResult.error?'rgba(239,68,68,0.08)':'rgba(16,185,129,0.08)',border:'1px solid '+(triggerResult.error?'rgba(239,68,68,0.2)':'rgba(16,185,129,0.2)'),borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--text-secondary)'}}>
          {triggerResult.error
            ? '❌ Error: '+triggerResult.error
            : triggerResult.status==='completed'
              ? '✅ Run completed: '+triggerResult.symbol+' '+triggerResult.analysisDate+' | '+triggerResult.scoringNote
              : JSON.stringify(triggerResult).substring(0,200)
          }
        </div>
      )}
      
      {/* Stats strip */}
      {stats && (
        <div style={{display:'flex',gap:12,marginBottom:24,flexWrap:'wrap'}}>
          <StatCard label="Total Runs" value={stats.total} sub="in last 500" />
          <StatCard label="Validation Rate" value={stats.validationRate+'%'} sub={stats.validated+' valid / '+stats.invalidated+' invalid'} color={stats.validationRate>=60?'#10b981':stats.validationRate>=50?'#f59e0b':'#ef4444'} />
          <StatCard label="Avg 5d Outcome" value={(stats.avgOutcome>=0?'+':'')+stats.avgOutcome+'%'} sub="across all scored runs" color={stats.avgOutcome>=0?'#10b981':'#ef4444'} />
          <StatCard label="Bull Hit Rate" value={stats.bullValidationRate!==null?stats.bullValidationRate+'%':'—'} sub="bullish thesis accuracy" color="#10b981" />
          <StatCard label="Bear Hit Rate" value={stats.bearValidationRate!==null?stats.bearValidationRate+'%':'—'} sub="bearish thesis accuracy" color="#ef4444" />
          <StatCard label="Completed" value={stats.completed} sub={`of ${stats.total} runs`} />
        </div>
      )}
      
      {/* Filters */}
      <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <input value={filter.symbol} onChange={e=>setFilter(f=>({...f,symbol:e.target.value.toUpperCase()}))}
          placeholder="Filter symbol..." style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',color:'var(--text-primary)',fontSize:12,width:120}} />
        <select value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value}))}
          style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',color:'var(--text-primary)',fontSize:12}}>
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
        <select value={filter.validated} onChange={e=>setFilter(f=>({...f,validated:e.target.value}))}
          style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',color:'var(--text-primary)',fontSize:12}}>
          <option value="">All outcomes</option>
          <option value="true">✅ Validated only</option>
          <option value="false">❌ Invalidated only</option>
        </select>
        <button onClick={()=>{setFilter({symbol:'',status:'',validated:''});setPage(0)}}
          style={{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',color:'var(--text-muted)',fontSize:12,cursor:'pointer'}}>
          Clear
        </button>
      </div>
      
      {/* Table */}
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,0.02)'}}>
              {['Date/Time','Symbol','Analysis Date','Price','Bias','Thesis (truncated)','5d Outcome','✓/✗'].map(h=>(
                <th key={h} style={{padding:'10px 10px',fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',textAlign:'left'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{padding:'40px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Loading training runs...</td></tr>
            ) : runs.length === 0 ? (
              <tr><td colSpan={8} style={{padding:'40px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                No training runs yet. Click "Run Single Training" to start the ML engine.
              </td></tr>
            ) : (
              runs.map(run => <RunRow key={run.run_id||run.id} run={run} onClick={()=>setSelected(run)} />)
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {runs.length === PAGE_SIZE && (
        <div style={{display:'flex',justifyContent:'center',gap:12,marginTop:16}}>
          {page > 0 && <button onClick={()=>setPage(p=>p-1)} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 16px',color:'var(--text-primary)',cursor:'pointer',fontSize:12}}>← Previous</button>}
          <span style={{padding:'7px 12px',color:'var(--text-muted)',fontSize:12}}>Page {page+1}</span>
          <button onClick={()=>setPage(p=>p+1)} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 16px',color:'var(--text-primary)',cursor:'pointer',fontSize:12}}>Next →</button>
        </div>
      )}
      
      {/* Detail modal */}
      {selected && <RunDetail run={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}
