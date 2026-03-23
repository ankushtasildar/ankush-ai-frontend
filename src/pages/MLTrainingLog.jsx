// src/pages/MLTrainingLog.jsx — AnkushAI Admin ML Training Monitor
// Jordan Hayes (Design) + Marcus Webb (Quant) + Alex Torres (Infra)
// v2: Thesis Dir vs Mkt Bias separation, new columns (1d/5d/10d/20d/target/stop), 
//     real progress tracking, no fake avg5d stat

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

async function fetchRuns(limit=100, offset=0, filter={}) {
  let url = SUPA_URL+'/rest/v1/ml_training_runs?order=started_at.desc&limit='+limit+'&offset='+offset+'&select=*'
  if (filter.symbol) url += '&symbol=eq.'+filter.symbol
  if (filter.status) url += '&status=eq.'+filter.status
  if (filter.validated !== undefined && filter.validated !== '') url += '&thesis_validated=eq.'+filter.validated
  const r = await fetch(url, { headers:{ apikey:SUPA_ANON, Authorization:'Bearer '+SUPA_ANON } })
  return r.json()
}

async function fetchStats() {
  const r = await fetch(SUPA_URL+'/rest/v1/ml_training_runs?order=started_at.desc&limit=500&select=thesis_validated,predicted_direction,computed_bias,outcome_5d_pct,symbol,status', {
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

function pctColor(v) {
  if (v === null || v === undefined || v === '—') return 'var(--text-muted)'
  const n = parseFloat(v)
  if (isNaN(n)) return 'var(--text-muted)'
  return n >= 0 ? '#10b981' : '#ef4444'
}

function fmtPct(val) {
  if (val === null || val === undefined) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

function RunRow({ run, onClick }) {
  const validated = run.thesis_validated
  // Thesis direction = what the AI predicted (up/down/sideways)
  const thesisDir = run.predicted_direction === 'up' ? '▲ Bull' :
                    run.predicted_direction === 'down' ? '▼ Bear' :
                    run.predicted_direction === 'sideways' ? '↔ Side' : '—'
  const thesisDirColor = run.predicted_direction === 'up' ? '#10b981' :
                         run.predicted_direction === 'down' ? '#ef4444' : '#f59e0b'
  // Market bias = SPY/macro context at time of analysis (separate concept)
  const mktBias = run.computed_bias || '—'
  const mktBiasColor = run.computed_bias === 'bullish' ? '#10b981' :
                       run.computed_bias === 'bearish' ? '#ef4444' : '#f59e0b'
  
  const target = run.expected_price_target
    ? '$' + Number(run.expected_price_target).toFixed(2)
    : run.target_1 ? '$' + Number(run.target_1).toFixed(2) : '—'
  const stop = run.stop_loss ? '$' + Number(run.stop_loss).toFixed(2) : '—'
  const price = run.entry_price || run.price_at_generation || run.price_at_analysis
  const thesis = run.thesis || ''
  const date = run.analysis_date || (run.started_at ? run.started_at.split('T')[0] : '—')

  const td = { padding: '7px 8px', fontSize: 11, verticalAlign: 'middle' }
  const tdMono = { ...td, fontFamily: 'var(--font-mono)' }

  return (
    <tr onClick={onClick} style={{cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',transition:'background .12s'}}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.025)'}
        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <td style={{...tdMono,color:'var(--text-muted)',whiteSpace:'nowrap'}}>{date}</td>
      <td style={{...td,fontWeight:700,color:'var(--accent)'}}>{run.symbol}</td>
      <td style={{...tdMono}}>{price ? '$'+Number(price).toFixed(2) : '—'}</td>
      <td style={{...td,fontWeight:600,color:thesisDirColor}}>{thesisDir}</td>
      <td style={{...td}}>
        <span style={{background:mktBiasColor+'18',color:mktBiasColor,padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:700,textTransform:'uppercase'}}>
          {mktBias}
        </span>
      </td>
      <td style={{...td,color:'var(--text-muted)',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={thesis}>
        {thesis.substring(0,75)}{thesis.length>75?'…':''}
      </td>
      <td style={{...td,fontSize:10,color:'var(--text-muted)'}}>{run.setup_type||'—'}</td>
      <td style={{...tdMono}}>{target}</td>
      <td style={{...tdMono}}>{stop}</td>
      <td style={{...tdMono,color:pctColor(run.outcome_1d_pct)}}>{fmtPct(run.outcome_1d_pct)}</td>
      <td style={{...tdMono,color:pctColor(run.outcome_5d_pct)}}>{fmtPct(run.outcome_5d_pct)}</td>
      <td style={{...tdMono,color:pctColor(run.outcome_10d_pct)}}>{fmtPct(run.outcome_10d_pct)}</td>
      <td style={{...tdMono,color:pctColor(run.outcome_20d_pct)}}>{fmtPct(run.outcome_20d_pct)}</td>
      <td style={{...td,textAlign:'center'}}>
        {validated === true  && <span style={{color:'#10b981',fontWeight:700,fontSize:11}}>✓ WIN</span>}
        {validated === false && <span style={{color:'#ef4444',fontWeight:700,fontSize:11}}>✗ MISS</span>}
        {validated === null  && run.status === 'completed' && <span style={{color:'var(--text-muted)',fontSize:11}}>⏳</span>}
        {run.status === 'failed' && <span style={{color:'#f59e0b',fontSize:11}}>⚠</span>}
      </td>
    </tr>
  )
}

function RunDetail({ run, onClose }) {
  if (!run) return null
  const signals = (() => { try { return run.signals_snapshot ? JSON.parse(run.signals_snapshot) : {} } catch(e) { return {} } })()
  const news = (() => { try { return run.news_context ? JSON.parse(run.news_context) : [] } catch(e) { return [] } })()
  const scores = signals.scores || {}
  const validated = run.thesis_validated

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
         onClick={onClose}>
      <div style={{background:'var(--bg-elevated)',borderRadius:14,padding:24,maxWidth:720,width:'100%',maxHeight:'88vh',overflowY:'auto',border:'1px solid var(--border)'}}
           onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:'var(--text-primary)'}}>{run.symbol} — {run.analysis_date}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{run.run_id}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:18,padding:4}}>✕</button>
        </div>

        {/* Status */}
        <div style={{padding:'10px 14px',borderRadius:8,marginBottom:16,
          background:validated===true?'rgba(16,185,129,0.08)':validated===false?'rgba(239,68,68,0.08)':'rgba(100,116,139,0.08)',
          border:'1px solid '+(validated===true?'rgba(16,185,129,0.2)':validated===false?'rgba(239,68,68,0.2)':'rgba(100,116,139,0.2)')}}>
          <div style={{fontSize:12,fontWeight:700,color:validated===true?'#10b981':validated===false?'#ef4444':'#64748b'}}>
            {validated===true?'✅ THESIS VALIDATED':validated===false?'❌ THESIS INVALIDATED':'⏳ OUTCOME PENDING'}
          </div>
          {run.scoring_note && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{run.scoring_note}</div>}
          {/* Multi-timeframe outcomes */}
          <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
            {[['1d',scores.o1d],['5d',scores.o5d],['10d',scores.o10d],['20d',scores.o20d],['Max Gain',scores.maxGainPct],['Max DD',scores.maxDrawdownPct]].map(([label,pct])=>
              pct != null && (
                <div key={label} style={{background:pct>=0?'#052e1680':'#2d0a0a80',border:'1px solid '+(pct>=0?'#10b981':'#ef4444'),borderRadius:5,padding:'3px 8px',fontSize:11}}>
                  <span style={{color:'var(--text-muted)'}}>{label}: </span>
                  <span style={{color:pct>=0?'#10b981':'#ef4444',fontWeight:600}}>{pct>=0?'+':''}{pct}%</span>
                </div>
              )
            )}
          </div>
          {/* Attribution */}
          {run.attribution && (
            <div style={{marginTop:12,padding:'10px 12px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8}}>
              <div style={{fontSize:10,color:'var(--text-muted)',letterSpacing:'0.08em',marginBottom:4}}>
                ATTRIBUTION — WHY IT {run.thesis_validated ? 'WORKED' : 'FAILED'}
              </div>
              <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5}}>{run.attribution}</div>
              {run.key_factor && (
                <div style={{marginTop:6,display:'flex',gap:6,alignItems:'center'}}>
                  <span style={{fontSize:10,color:'var(--text-muted)'}}>KEY FACTOR:</span>
                  <span style={{fontSize:11,background:'#7c3aed30',border:'1px solid #7c3aed60',color:'#a78bfa',borderRadius:4,padding:'2px 7px'}}>{run.key_factor}</span>
                  {run.pattern_tag && <span style={{fontSize:11,background:'#1e3a5f',border:'1px solid #3b82f680',color:'#93c5fd',borderRadius:4,padding:'2px 7px'}}>{run.pattern_tag}</span>}
                </div>
              )}
              {run.lesson_learned && <div style={{marginTop:6,fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>📚 {run.lesson_learned}</div>}
            </div>
          )}
        </div>

        {/* Thesis */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Generated Thesis</div>
          <div style={{fontSize:13,lineHeight:1.6,color:'var(--text-primary)',background:'var(--bg-card)',padding:'10px 14px',borderRadius:8,border:'1px solid var(--border)'}}>
            {run.thesis || 'No thesis generated'}
          </div>
        </div>

        {/* Prediction vs Actual */}
        <div style={{display:'flex',gap:12,marginBottom:14}}>
          <div style={{flex:1,background:'var(--bg-card)',padding:'10px 14px',borderRadius:8,border:'1px solid var(--border)'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Thesis Prediction</div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--accent)'}}>{run.predicted_direction?.toUpperCase()||'—'}</div>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>Window: {run.expected_move_by_days||'?'}d | Target: {run.expected_price_target?'$'+Number(run.expected_price_target).toFixed(2):'—'}</div>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>Magnitude: {run.predicted_magnitude_pct||'?'}% | Confidence: {run.model_confidence||'?'}%</div>
          </div>
          <div style={{flex:1,background:'var(--bg-card)',padding:'10px 14px',borderRadius:8,border:'1px solid var(--border)'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Market Context (bias)</div>
            <div style={{fontSize:16,fontWeight:700,color:run.computed_bias==='bullish'?'#10b981':run.computed_bias==='bearish'?'#ef4444':'#f59e0b'}}>
              {(run.computed_bias||'—').toUpperCase()}
            </div>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>SPY/macro bias at analysis date — separate from thesis direction</div>
          </div>
        </div>

        {/* Entry trigger + risk */}
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
                <div style={{fontSize:9,fontWeight:700,color:'#ef4444',textTransform:'uppercase',marginBottom:3}}>Key Risk / Invalidation</div>
                <div style={{fontSize:11,color:'var(--text-secondary)'}}>{run.key_risk}</div>
              </div>
            )}
          </div>
        )}

        {/* Signal snapshot */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Signal Snapshot</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {[
              ['EMA21','$'+(signals.ema21||'—')],['EMA50','$'+(signals.ema50||'—')],['EMA200','$'+(signals.ema200||'—')],
              ['RSI(14)',signals.rsi14||'—'],['ROC 5d',(signals.roc5!=null?(signals.roc5>=0?'+':'')+signals.roc5+'%':'—')],
              ['ROC 20d',(signals.roc20!=null?(signals.roc20>=0?'+':'')+signals.roc20+'%':'—')],
              ['ATR(14)','$'+(signals.atr14||'—')],['Bias Score',(signals.biasScore||'—')+'%'],['Mkt Bias',signals.computedBias?.toUpperCase()||'—'],
            ].map(([l,v])=>(
              <div key={l} style={{background:'var(--bg-card)',padding:'6px 10px',borderRadius:6}}>
                <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase'}}>{l}</div>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--font-mono)'}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {news.length > 0 && (
          <div>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>News at Analysis Date</div>
            {news.map((n,i)=>(
              <div key={i} style={{fontSize:11,color:'var(--text-muted)',padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <span style={{color:'var(--text-primary)',fontWeight:600}}>{n.date}: </span>{n.title}
              </div>
            ))}
          </div>
        )}
        <div style={{fontSize:10,color:'var(--text-muted)',marginTop:14,opacity:0.5}}>
          Started: {run.started_at} | Engine: {run.engine_version}
        </div>
      </div>
    </div>
  )
}

const RUN_STEPS = ['Idle','Fetching data...','Generating thesis...','Scoring outcome...','Storing result...','Complete ✓']

export default function MLTrainingLog() {
  const [runs, setRuns] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState({symbol:'',status:'',validated:''})
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState(null)
  const [runStep, setRunStep] = useState(0)
  const [page, setPage] = useState(0)
  const stepTimer = useRef(null)
  const PAGE_SIZE = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [runsData, statsData] = await Promise.all([
        fetchRuns(PAGE_SIZE, page*PAGE_SIZE, filter),
        fetchStats()
      ])
      setRuns(Array.isArray(runsData) ? runsData : [])
      if (Array.isArray(statsData)) {
        const completed = statsData.filter(r=>r.status==='completed')
        const validated = completed.filter(r=>r.thesis_validated===true)
        const invalidated = completed.filter(r=>r.thesis_validated===false)
        // Use predicted_direction (thesis direction) not computed_bias (market bias) for win attribution
        const bullV = completed.filter(r=>r.predicted_direction==='up'&&r.thesis_validated===true).length
        const bearV = completed.filter(r=>r.predicted_direction==='down'&&r.thesis_validated===true).length
        const bullT = completed.filter(r=>r.predicted_direction==='up'&&r.thesis_validated!==null).length
        const bearT = completed.filter(r=>r.predicted_direction==='down'&&r.thesis_validated!==null).length
        const scoredCount = completed.filter(r=>r.thesis_validated!==null).length
        setStats({
          total: statsData.length,
          completed: completed.length,
          validated: validated.length,
          invalidated: invalidated.length,
          validationRate: scoredCount > 0 ? Math.round(validated.length / scoredCount * 100) : 0,
          bullValidationRate: bullT > 0 ? Math.round(bullV / bullT * 100) : null,
          bearValidationRate: bearT > 0 ? Math.round(bearV / bearT * 100) : null,
        })
      }
    } catch(e) { console.error('ML log load error', e) }
    setLoading(false)
  }, [filter, page])

  useEffect(() => { load() }, [load])

  // Animate progress steps during a run (correlated: 4 real steps over ~25-40s avg run time)
  const startStepProgress = () => {
    setRunStep(1)
    const delays = [0, 4000, 10000, 22000, 34000]
    delays.forEach((d, i) => {
      stepTimer.current = setTimeout(() => setRunStep(i + 1), d)
    })
  }
  const stopStepProgress = (success) => {
    clearTimeout(stepTimer.current)
    setRunStep(success ? 5 : 0)
    setTimeout(() => setRunStep(0), 2500)
  }

  const triggerRun = async (mode='single') => {
    setTriggering(true)
    setTriggerResult(null)
    startStepProgress()
    try {
      const url = '/api/ml-trainer?key=ankushai_admin_2025&mode='+mode+(mode==='batch'?'&n=10':'')
      const r = await fetch(url)
      const d = await r.json()
      setTriggerResult(d)
      stopStepProgress(true)
      setTimeout(load, 2000)
    } catch(e) {
      setTriggerResult({error:e.message})
      stopStepProgress(false)
    }
    setTriggering(false)
  }

  return (
    <div style={{padding:'20px 24px',maxWidth:1500,margin:'0 auto',color:'var(--text-primary)'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>🧠 ML Training Log</div>
          <div style={{fontSize:13,color:'var(--text-muted)'}}>
            Blind-drop historical training — every AI thesis vs actual market outcome. AI learns from every run.
          </div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={()=>triggerRun('single')} disabled={triggering}
            style={{background:'linear-gradient(135deg,#7c3aed,#3b82f6)',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600,opacity:triggering?0.6:1,display:'flex',alignItems:'center',gap:8}}>
            {triggering && runStep > 0 && runStep < 5
              ? <><span style={{width:120,textAlign:'left'}}>{RUN_STEPS[runStep]}</span>
                  <span style={{display:'inline-block',width:60,height:4,background:'rgba(255,255,255,0.2)',borderRadius:2,overflow:'hidden',position:'relative'}}>
                    <span style={{position:'absolute',left:0,top:0,height:'100%',background:'#fff',borderRadius:2,transition:'width .4s',width:(runStep/5*100)+'%'}} />
                  </span></>
              : '▶ Run Single Training'
            }
          </button>
          <button onClick={()=>triggerRun('batch')} disabled={triggering}
            style={{background:'rgba(124,58,237,0.15)',color:'#7c3aed',border:'1px solid rgba(124,58,237,0.3)',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600,opacity:triggering?0.6:1}}>
            ⚡ Batch (10 runs)
          </button>
          <button onClick={load} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',cursor:'pointer',color:'var(--text-muted)',fontSize:13}}>
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* Trigger result */}
      {triggerResult && (
        <div style={{background:triggerResult.error?'rgba(239,68,68,0.08)':'rgba(16,185,129,0.08)',border:'1px solid '+(triggerResult.error?'rgba(239,68,68,0.2)':'rgba(16,185,129,0.2)'),borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--text-secondary)'}}>
          {triggerResult.error
            ? '❌ Error: '+triggerResult.error
            : triggerResult.status==='completed'
              ? '✅ '+triggerResult.symbol+' | '+triggerResult.analysis_date+' | '+triggerResult.scoring_note
              : JSON.stringify(triggerResult).substring(0,300)
          }
        </div>
      )}

      {/* Stats — no avg 5d outcome (meaningless aggregate across different declared windows) */}
      {stats && (
        <div style={{display:'flex',gap:12,marginBottom:24,flexWrap:'wrap'}}>
          <StatCard label="Total Runs" value={stats.total} sub="in last 500" />
          <StatCard label="Validation Rate" value={stats.validationRate+'%'} sub={stats.validated+' valid / '+stats.invalidated+' invalid'} color={stats.validationRate>=60?'#10b981':stats.validationRate>=50?'#f59e0b':'#ef4444'} />
          <StatCard label="Bull Thesis Hit Rate" value={stats.bullValidationRate!==null?stats.bullValidationRate+'%':'—'} sub="when thesis predicted UP" color="#10b981" />
          <StatCard label="Bear Thesis Hit Rate" value={stats.bearValidationRate!==null?stats.bearValidationRate+'%':'—'} sub="when thesis predicted DOWN" color="#ef4444" />
          <StatCard label="Completed" value={stats.completed} sub={'of '+stats.total+' runs'} />
        </div>
      )}

      {/* AI Learning note */}
      <div style={{background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.15)',borderRadius:8,padding:'9px 14px',marginBottom:16,fontSize:12,color:'#93c5fd'}}>
        🧠 <strong>The AI is actively learning.</strong> Every run stores a pattern + lesson in <code>ai_learned_patterns</code>. New thesis prompts inject the top 5 winning patterns and top 3 failure patterns — the model compounds its own knowledge each session.
      </div>

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
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:1200}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,0.02)'}}>
              {['Date','Symbol','Price','Thesis Dir','Mkt Bias','Thesis','Setup','Target','Stop','1d','5d','10d','20d','Result'].map(h=>(
                <th key={h} style={{padding:'9px 8px',fontSize:9,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} style={{padding:'40px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Loading training runs...</td></tr>
            ) : runs.length === 0 ? (
              <tr><td colSpan={14} style={{padding:'40px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                No training runs yet. Click Run Single Training to start the ML engine.
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

      {selected && <RunDetail run={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}
