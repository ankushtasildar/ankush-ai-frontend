import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const fmt = (n, d=2) => n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})

export default function Intelligence() {
  const navigate = useNavigate()
  const [patterns, setPatterns] = useState([])
  const [stats, setStats] = useState(null)
  const [scanHistory, setScanHistory] = useState([])
  const [recentSetups, setRecentSetups] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [triggering, setTriggering] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [patternsRes, statsRes, scanRes, setupsRes, outcomesRes] = await Promise.allSettled([
      supabase.from('ai_learned_patterns').select('*').order('prompt_weight', { ascending: false }),
      fetch('/api/intelligence?action=stats').then(r => r.json()),
      supabase.from('scan_cache').select('created_at,setup_count,market_mood,vix,spy_change').order('created_at', { ascending: false }).limit(10),
      supabase.from('setup_records').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('setup_outcomes').select('*').order('created_at', { ascending: false }).limit(20),
    ])

    if (patternsRes.status === 'fulfilled') setPatterns(patternsRes.value.data || [])
    if (statsRes.status === 'fulfilled') setStats(statsRes.value)
    if (scanRes.status === 'fulfilled') setScanHistory(scanRes.value.data || [])
    if (setupsRes.status === 'fulfilled') setRecentSetups(setupsRes.value.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function triggerScan() {
    setTriggering(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/analysis?type=scan', {
        headers: session ? { 'Authorization': 'Bearer ' + session.access_token } : {}
      })
      const d = await r.json()
      alert(`Scan complete: ${d.setups?.length || 0} setups generated. Cache: ${d.cached ? 'served from cache' : 'fresh scan'}`)
      load()
    } catch(e) { alert('Scan error: ' + e.message) }
    setTriggering(false)
  }

  async function triggerEOD() {
    setTriggering(true)
    try {
      const r = await fetch('/api/cron/eod')
      const d = await r.json()
      alert(`EOD: ${d.status} — ${d.mood || ''} VIX ${d.vix || ''}`)
    } catch(e) { alert(e.message) }
    setTriggering(false)
  }

  async function triggerPremarket() {
    setTriggering(true)
    try {
      const r = await fetch('/api/cron/premarket')
      const d = await r.json()
      alert(`Premarket: ${d.status} — ${d.setups || 0} setups`)
    } catch(e) { alert(e.message) }
    setTriggering(false)
  }

  const tabStyle = active => ({ padding:'6px 14px', background:active?'rgba(37,99,235,0.12)':'none', border:`1px solid ${active?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.06)'}`, borderRadius:6, color:active?'#60a5fa':'#4a5c7a', fontSize:11, cursor:'pointer', fontFamily:'"DM Mono",monospace' })

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,margin:'0 0 2px'}}>Intelligence Engine</h1>
          <div style={{color:'#3d4e62',fontSize:11}}>Self-learning pattern recognition · 100 analyst frameworks · Shared scan cache</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={triggerPremarket} disabled={triggering} style={{padding:'7px 14px',background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.25)',borderRadius:8,color:'#10b981',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>⚡ Warm Cache</button>
          <button onClick={triggerScan} disabled={triggering} style={{padding:'7px 14px',background:'rgba(37,99,235,0.1)',border:'1px solid rgba(37,99,235,0.25)',borderRadius:8,color:'#60a5fa',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>🔍 Force Scan</button>
          <button onClick={triggerEOD} disabled={triggering} style={{padding:'7px 14px',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:8,color:'#f59e0b',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>🌙 EOD Debrief</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
        {[['overview','Overview'],['patterns','Patterns'],['scan_history','Scan Cache'],['setups','Setup Tracker']].map(([v,l])=>(
          <button key={v} style={tabStyle(activeTab===v)} onClick={()=>setActiveTab(v)}>{l}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div>
          {/* System stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:20}}>
            {[
              ['PATTERNS LEARNED', patterns.length, '#a78bfa'],
              ['TOTAL SETUPS', stats?.overview?.total_setups || 0, '#60a5fa'],
              ['WIN RATE', stats?.overview?.win_rate_pct ? stats.overview.win_rate_pct.toFixed(1)+'%' : '—', '#10b981'],
              ['SCAN CACHE HITS', scanHistory.length, '#f59e0b'],
              ['OPEN SETUPS', stats?.overview?.open_setups || 0, '#60a5fa'],
              ['RESOLVED', stats?.overview?.resolved_setups || 0, '#4a5c7a'],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
                <div style={{color:c,fontFamily:'"DM Mono",monospace',fontSize:22,fontWeight:800}}>{v}</div>
                <div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>

          {/* How it works */}
          <div style={{background:'rgba(37,99,235,0.04)',border:'1px solid rgba(37,99,235,0.12)',borderRadius:12,padding:20,marginBottom:16}}>
            <div style={{fontFamily:'"DM Mono",monospace',fontSize:11,fontWeight:700,color:'#60a5fa',marginBottom:12}}>HOW THE INTELLIGENCE LOOP WORKS</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12}}>
              {[
                ['1. Pre-Market Scan', '8:30am ET daily — AI scans 60+ symbols across 100 frameworks. Results saved to scan_cache table.'],
                ['2. Shared Cache', 'All users see the same scan results instantly (<100ms). One AI call serves unlimited users.'],
                ['3. Setup Recording', 'Every setup is saved to setup_records with entry/stop/target levels and confidence.'],
                ['4. Outcome Tracking', 'EOD cron checks if setups hit target or stop. Win/loss recorded to setup_outcomes.'],
                ['5. Pattern Learning', 'Patterns that win repeatedly get higher prompt_weight. Losers get lower weight.'],
                ['6. Improved Scans', 'Next scan prompt is calibrated by learned patterns — system compounds over time.'],
              ].map(([title,desc])=>(
                <div key={title} style={{padding:'10px 12px',background:'rgba(255,255,255,0.02)',borderRadius:8}}>
                  <div style={{fontSize:11,fontWeight:600,color:'#60a5fa',marginBottom:4}}>{title}</div>
                  <div style={{fontSize:10,color:'#4a5c7a',lineHeight:1.6}}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Last scan cache entry */}
          {scanHistory.length > 0 && (
            <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#4a5c7a',marginBottom:8}}>LATEST CACHED SCAN</div>
              <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                {[
                  ['Setups', scanHistory[0].setup_count],
                  ['Mood', scanHistory[0].market_mood],
                  ['VIX', scanHistory[0].vix?.toFixed(2)],
                  ['SPY Chg', scanHistory[0].spy_change ? (scanHistory[0].spy_change > 0 ? '+' : '') + scanHistory[0].spy_change?.toFixed(2) + '%' : '—'],
                  ['Cached At', new Date(scanHistory[0].created_at).toLocaleTimeString()],
                  ['Age', Math.round((Date.now() - new Date(scanHistory[0].created_at).getTime()) / 60000) + ' min ago'],
                ].map(([l,v])=>(
                  <div key={l} style={{textAlign:'center'}}>
                    <div style={{fontFamily:'"DM Mono",monospace',fontSize:14,fontWeight:700}}>{v||'—'}</div>
                    <div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PATTERNS TAB */}
      {activeTab === 'patterns' && (
        <div>
          <div style={{color:'#4a5c7a',fontSize:11,marginBottom:14}}>
            {patterns.length} learned patterns · weights updated after each scan cycle · higher weight = more influence on next scan prompt
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:10}}>
            {patterns.map((p, i) => {
              const wr = p.win_rate != null ? (p.win_rate * 100).toFixed(0) : null
              const weightColor = p.prompt_weight >= 1.3 ? '#10b981' : p.prompt_weight >= 1.0 ? '#60a5fa' : '#ef4444'
              return (
                <div key={p.id || i} style={{background:'#0d1420',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div>
                      <div style={{fontFamily:'"DM Mono",monospace',fontSize:13,fontWeight:700}}>{p.pattern_name}</div>
                      <div style={{color:'#4a5c7a',fontSize:10,marginTop:2}}>{p.pattern_type}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{color:weightColor,fontFamily:'"DM Mono",monospace',fontWeight:800,fontSize:16}}>×{p.prompt_weight?.toFixed(1)}</div>
                      <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace'}}>WEIGHT</div>
                    </div>
                  </div>

                  {/* Weight bar */}
                  <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,marginBottom:10,overflow:'hidden'}}>
                    <div style={{width:Math.min(100,(p.prompt_weight/2)*100)+'%',height:'100%',background:weightColor,borderRadius:2}}/>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:8}}>
                    {[['Strategy', p.recommended_iv_strategy||p.recommended_options_strategy||'—'],
                      ['Win Rate', wr ? wr+'%' : '—'],
                      ['Sample', p.sample_size ? p.sample_size+' trades' : '—'],
                      ['Works When', null]
                    ].map(([l,v])=>v!=null&&(
                      <div key={l} style={{padding:'5px 8px',background:'rgba(255,255,255,0.02)',borderRadius:6}}>
                        <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace',marginBottom:2}}>{l}</div>
                        <div style={{fontSize:10,color:'#6b7a90',fontFamily:'"DM Mono",monospace'}}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {p.works_best_when && (
                    <div style={{fontSize:10,color:'#4a5c7a',lineHeight:1.6,padding:'6px 8px',background:'rgba(16,185,129,0.04)',borderRadius:6,borderLeft:'2px solid rgba(16,185,129,0.3)',marginBottom:6}}>
                      ✓ {p.works_best_when}
                    </div>
                  )}
                  {p.fails_when && (
                    <div style={{fontSize:10,color:'#4a5c7a',lineHeight:1.6,padding:'6px 8px',background:'rgba(239,68,68,0.04)',borderRadius:6,borderLeft:'2px solid rgba(239,68,68,0.3)'}}>
                      ✗ {p.fails_when}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {patterns.length === 0 && !loading && (
            <div style={{textAlign:'center',padding:'40px',color:'#3d4e62'}}>
              <div style={{fontSize:32,marginBottom:12}}>🧠</div>
              <div>No patterns loaded yet. Run a scan to begin learning.</div>
            </div>
          )}
        </div>
      )}

      {/* SCAN CACHE TAB */}
      {activeTab === 'scan_history' && (
        <div>
          <div style={{color:'#4a5c7a',fontSize:11,marginBottom:12}}>Each row = one shared scan result. All users tap this cache instead of generating individually.</div>
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'120px 80px 80px 80px 80px 1fr',padding:'8px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:9,color:'#3d4e62',fontFamily:'"DM Mono",monospace'}}>
              <span>TIME</span><span>SETUPS</span><span>MOOD</span><span>VIX</span><span>SPY Δ</span><span>AGE</span>
            </div>
            {scanHistory.map((s, i) => {
              const ageMin = Math.round((Date.now() - new Date(s.created_at).getTime()) / 60000)
              return (
                <div key={i} style={{display:'grid',gridTemplateColumns:'120px 80px 80px 80px 80px 1fr',padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.03)',fontSize:11}}>
                  <span style={{fontFamily:'"DM Mono",monospace',color:'#6b7a90'}}>{new Date(s.created_at).toLocaleTimeString()}</span>
                  <span style={{fontFamily:'"DM Mono",monospace',fontWeight:700,color:'#60a5fa'}}>{s.setup_count}</span>
                  <span style={{color:s.market_mood==='Fear'?'#ef4444':s.market_mood==='Greed'?'#10b981':'#f59e0b',fontSize:10}}>{s.market_mood||'—'}</span>
                  <span style={{fontFamily:'"DM Mono",monospace'}}>{s.vix?.toFixed(1)||'—'}</span>
                  <span style={{color:s.spy_change>=0?'#10b981':'#ef4444',fontFamily:'"DM Mono",monospace'}}>{s.spy_change!=null?(s.spy_change>=0?'+':'')+s.spy_change.toFixed(2)+'%':'—'}</span>
                  <span style={{color:'#3d4e62',fontSize:10}}>{ageMin < 60 ? ageMin+'m ago' : Math.round(ageMin/60)+'h ago'}</span>
                </div>
              )
            })}
            {scanHistory.length === 0 && (
              <div style={{padding:'24px',textAlign:'center',color:'#3d4e62',fontSize:11}}>No cached scans yet. Run a scan to populate.</div>
            )}
          </div>
        </div>
      )}

      {/* SETUP TRACKER TAB */}
      {activeTab === 'setups' && (
        <div>
          <div style={{color:'#4a5c7a',fontSize:11,marginBottom:12}}>All setups generated by AI scans — tracked for outcome resolution and pattern learning.</div>
          {recentSetups.length > 0 ? (
            <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'70px 130px 70px 80px 80px 80px 70px 80px',padding:'8px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:9,color:'#3d4e62',fontFamily:'"DM Mono",monospace'}}>
                <span>SYMBOL</span><span>SETUP TYPE</span><span>BIAS</span><span>ENTRY</span><span>TARGET</span><span>STOP</span><span>CONF</span><span>OUTCOME</span>
              </div>
              {recentSetups.map((s, i) => (
                <div key={i} style={{display:'grid',gridTemplateColumns:'70px 130px 70px 80px 80px 80px 70px 80px',padding:'9px 16px',borderBottom:'1px solid rgba(255,255,255,0.03)',fontSize:11,alignItems:'center'}}>
                  <span style={{fontFamily:'"DM Mono",monospace',fontWeight:700}}>{s.symbol}</span>
                  <span style={{color:'#4a5c7a',fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.setup_type}</span>
                  <span style={{color:s.bias==='bullish'?'#10b981':'#ef4444',fontSize:10}}>{s.bias==='bullish'?'▲ Bull':'▼ Bear'}</span>
                  <span style={{fontFamily:'"DM Mono",monospace',fontSize:10}}>{s.entry_high?'$'+fmt(s.entry_high):'—'}</span>
                  <span style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#10b981'}}>{s.target_1?'$'+fmt(s.target_1):'—'}</span>
                  <span style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#ef4444'}}>{s.stop_loss?'$'+fmt(s.stop_loss):'—'}</span>
                  <span style={{fontFamily:'"DM Mono",monospace',fontSize:10}}>{s.confidence||'—'}/10</span>
                  <span style={{fontSize:9}}>
                    {s.outcome === 'win' ? <span style={{color:'#10b981',fontWeight:700}}>WIN ✓</span>
                     : s.outcome === 'loss' ? <span style={{color:'#ef4444',fontWeight:700}}>LOSS ✗</span>
                     : <span style={{color:'#4a5c7a'}}>Open</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{textAlign:'center',padding:'40px',color:'#3d4e62'}}>
              <div style={{fontSize:32,marginBottom:12}}>📊</div>
              <div>No setups tracked yet. Run a scan to start the intelligence loop.</div>
              <button onClick={triggerScan} disabled={triggering} style={{marginTop:16,padding:'10px 24px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:10,color:'#fff',fontSize:13,cursor:'pointer',fontWeight:600}}>⚡ Run First Scan</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
