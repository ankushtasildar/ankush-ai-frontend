import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function EODDebrief() {
  const [recaps, setRecaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState(null)
  const [market, setMarket] = useState(null)

  useEffect(() => { loadRecaps(); loadMarket() }, [])

  async function loadRecaps() {
    const { data } = await supabase.from('daily_recaps').select('*').order('date', { ascending: false }).limit(30)
    if (data) { setRecaps(data); if (data.length > 0) setSelected(data[0]) }
    setLoading(false)
  }

  async function loadMarket() {
    try { const d = await fetch('/api/market?action=context').then(r => r.json()); setMarket(d) } catch(e) {}
  }

  async function generateNow() {
    setGenerating(true)
    try {
      const r = await fetch('/api/cron/eod', { signal: AbortSignal.timeout(60000) })
      const d = await r.json()
      if (d.status === 'success') { await loadRecaps(); alert('EOD Debrief generated! Mood: ' + d.mood + ', VIX: ' + d.vix) }
      else if (d.status === 'skipped') { alert('Already generated today.') }
      else alert('Error: ' + (d.error || JSON.stringify(d)))
    } catch(e) { alert('Error: ' + e.message) }
    setGenerating(false)
  }

  const moodColor = (mood) => {
    if (!mood) return '#4a5c7a'
    const m = mood.toLowerCase()
    if (m.includes('fear') || m.includes('panic')) return '#ef4444'
    if (m.includes('greed')) return '#10b981'
    if (m.includes('caution')) return '#f59e0b'
    return '#60a5fa'
  }

  const formatContent = (content) => {
    if (!content) return null
    return content.split('\n').map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{fontWeight:700,color:'#f0f6ff',fontSize:13,marginTop:14,marginBottom:4,fontFamily:'"DM Mono",monospace'}}>{line.replace(/\*\*/g,'')}</div>
      if (line.match(/^[-•]\s/)) return <div key={i} style={{display:'flex',gap:8,padding:'3px 0',color:'#9ab',fontSize:12,lineHeight:1.7}}><span style={{color:'#60a5fa',flexShrink:0}}>•</span><span>{line.replace(/^[-•]\s*/,'')}</span></div>
      if (line.match(/^\d+\./)) return <div key={i} style={{display:'flex',gap:8,padding:'3px 0',color:'#9ab',fontSize:12,lineHeight:1.7}}><span style={{color:'#a78bfa',flexShrink:0,minWidth:16}}>{line.match(/^\d+/)[0]}.</span><span>{line.replace(/^\d+\.\s*/,'')}</span></div>
      if (!line.trim()) return <div key={i} style={{height:8}}/>
      return <div key={i} style={{color:'#9ab',fontSize:12,lineHeight:1.8}}>{line}</div>
    })
  }

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif',display:'flex',gap:20}}>
      <div style={{width:260,flexShrink:0,display:'flex',flexDirection:'column',gap:0,overflowY:'auto',maxHeight:'calc(100vh - 40px)'}}>
        <div style={{marginBottom:14}}>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:20,fontWeight:800,margin:'0 0 2px'}}>EOD Debrief</h1>
          <div style={{color:'#3d4e62',fontSize:10}}>AI daily market recap · auto-generated 5pm ET</div>
        </div>
        {market && (
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:'10px 12px',marginBottom:10}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace'}}>LIVE MARKET</span><span style={{color:moodColor(market.mood),fontSize:9,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{market.mood?.toUpperCase()}</span></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
              {[['SPY',market.spy?.toFixed(2),market.spyChange>=0?'#10b981':'#ef4444'],['VIX',market.vix?.toFixed(2),market.vix>25?'#ef4444':'#f59e0b']].map(([l,v,c])=>(
                <div key={l} style={{textAlign:'center',padding:'4px',background:'rgba(255,255,255,0.02)',borderRadius:5}}><div style={{color:c,fontFamily:'"DM Mono",monospace',fontSize:12,fontWeight:700}}>{v||'—'}</div><div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace'}}>{l}</div></div>
              ))}
            </div>
          </div>
        )}
        <button onClick={generateNow} disabled={generating} style={{width:'100%',padding:'8px',background:generating?'rgba(37,99,235,0.2)':'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:8,color:'#fff',fontSize:11,cursor:'pointer',fontWeight:600,marginBottom:10}}>
          {generating?'⟳ Generating...':'🌙 Generate Now'}
        </button>
        <div style={{display:'flex',flexDirection:'column',gap:4,overflowY:'auto',flex:1}}>
          {loading && <div style={{color:'#3d4e62',fontSize:11,textAlign:'center',padding:20}}>Loading...</div>}
          {!loading && recaps.length === 0 && <div style={{color:'#3d4e62',fontSize:11,textAlign:'center',padding:20}}>No recaps yet. Click Generate Now to create today's debrief.</div>}
          {recaps.map(recap => (
            <div key={recap.id} onClick={() => setSelected(recap)}
              style={{padding:'10px 12px',background:selected?.id===recap.id?'rgba(37,99,235,0.1)':'rgba(255,255,255,0.02)',border:'1px solid '+(selected?.id===recap.id?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.05)'),borderRadius:8,cursor:'pointer'}}>
              <div style={{display:'flex',justifyContent:'space-between'}}><div style={{fontFamily:'"DM Mono",monospace',fontSize:11,fontWeight:700}}>{recap.date}</div><div style={{color:moodColor(recap.market_mood),fontSize:9,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{recap.market_mood?.toUpperCase()||'—'}</div></div>
              {recap.vix_close&&<div style={{color:'#4a5c7a',fontSize:9,fontFamily:'"DM Mono",monospace',marginTop:3}}>VIX {recap.vix_close?.toFixed(1)} · SPY {recap.spy_change>=0?'+':''}{recap.spy_change?.toFixed(2)}%</div>}
            </div>
          ))}
        </div>
      </div>
      {selected ? (
        <div style={{flex:1,background:'#0d1420',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:24,overflowY:'auto',maxHeight:'calc(100vh - 60px)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:12}}>
            <div>
              <div style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,marginBottom:6}}>Market Debrief — {selected.date}</div>
              <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                {selected.market_mood&&<span style={{background:moodColor(selected.market_mood)+'15',border:'1px solid '+moodColor(selected.market_mood)+'30',borderRadius:5,padding:'2px 9px',color:moodColor(selected.market_mood),fontSize:10,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{selected.market_mood.toUpperCase()}</span>}
                {selected.vix_close&&<span style={{color:'#4a5c7a',fontSize:11,fontFamily:'"DM Mono",monospace'}}>VIX {selected.vix_close.toFixed(2)}</span>}
                {selected.spy_change!=null&&<span style={{color:selected.spy_change>=0?'#10b981':'#ef4444',fontSize:11,fontFamily:'"DM Mono",monospace'}}>SPY {selected.spy_change>=0?'+':''}{selected.spy_change.toFixed(2)}%</span>}
              </div>
            </div>
            <div style={{color:'#3d4e62',fontSize:10,fontFamily:'"DM Mono",monospace'}}>Generated {new Date(selected.created_at).toLocaleTimeString()}</div>
          </div>
          {selected.sector_summary&&<div style={{padding:'8px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:8,marginBottom:16,fontSize:10,color:'#4a5c7a',fontFamily:'"DM Mono",monospace',lineHeight:1.7}}>📊 {selected.sector_summary}</div>}
          <div style={{lineHeight:1.8}}>{formatContent(selected.content)}</div>
          {selected.tomorrow_focus&&selected.tomorrow_focus!=='See full recap above'&&<div style={{marginTop:20,padding:'14px 16px',background:'rgba(37,99,235,0.05)',border:'1px solid rgba(37,99,235,0.15)',borderRadius:10}}><div style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#60a5fa',marginBottom:8,fontWeight:700}}>TOMORROW'S FOCUS</div><div style={{color:'#9ab',fontSize:12,lineHeight:1.7}}>{selected.tomorrow_focus}</div></div>}
        </div>
      ) : (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#3d4e62',flexDirection:'column',gap:12}}>
          <div style={{fontSize:48}}>🌙</div>
          <div style={{fontSize:14,fontWeight:600,color:'#f0f6ff'}}>Select a date or generate today's debrief</div>
        </div>
      )}
    </div>
  )
}