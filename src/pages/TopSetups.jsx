import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const fmt = (n, d=2) => n==null?'\u2014':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
const fmtDollar = n => n==null?'\u2014':'$'+fmt(n)

// === LOG TRADE MODAL ===
function LogTradeModal({ setup, onClose, onSaved }) {
  const [entry, setEntry] = useState(setup?.entryHigh?.toString() || setup?.entry_high?.toString() || '')
  const [stop, setStop] = useState(setup?.stopLoss?.toString() || setup?.stop_loss?.toString() || '')
  const [target, setTarget] = useState(setup?.target1?.toString() || setup?.target_1?.toString() || '')
  const [qty, setQty] = useState('1')
  const [type, setType] = useState('options')
  const [optCost, setOptCost] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const rr = entry && stop && target
    ? (Math.abs(parseFloat(target)-parseFloat(entry))/Math.abs(parseFloat(entry)-parseFloat(stop))).toFixed(2)
    : null

  async function save() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('journal_entries').insert({
        symbol: setup.symbol,
        setup_type: setup.setupType || setup.setup_type || 'AI Setup',
        bias: setup.bias,
        entry_price: parseFloat(entry) || null,
        stop_price: parseFloat(stop) || null,
        target_price: parseFloat(target) || null,
        quantity: parseInt(qty) || 1,
        trade_type: type,
        option_cost: type === 'options' ? parseFloat(optCost) || null : null,
        rr_ratio: rr ? parseFloat(rr) : null,
        confidence: setup.confidence,
        notes: notes || (setup.analysis ? setup.analysis.substring(0, 500) : ''),
        frameworks: setup.frameworks || [],
        setup_id: setup.id || null,
        status: 'open',
        opened_at: new Date().toISOString(),
        user_id: user?.id
      })
      if (!error) { setSaved(true); setTimeout(() => { onSaved && onSaved(); onClose(); }, 1200); }
      else { alert('Save error: ' + error.message); setSaving(false); }
    } catch(e) { alert(e.message); setSaving(false); }
  }

  const inp = { width:'100%', padding:'8px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#f0f6ff', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const lbl = { color:'#4a5c7a', fontSize:10, marginBottom:5, display:'block' }

  if (saved) return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
      <div style={{background:'#0d1420',border:'1px solid rgba(16,185,129,0.3)',borderRadius:16,padding:40,textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:12}}></div>
        <div style={{fontFamily:'"Syne",sans-serif',fontSize:18,fontWeight:700,color:'#10b981'}}>Trade Logged!</div>
        <div style={{color:'#4a5c7a',fontSize:12,marginTop:6}}>{setup.symbol}  Journal</div>
      </div>
    </div>
  )

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#0d1420',border:'1px solid rgba(255,255,255,0.1)',borderRadius:16,padding:24,width:400,maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div>
            <div style={{fontFamily:'"Syne",sans-serif',fontSize:17,fontWeight:700}}> Log Trade: {setup.symbol}</div>
            <div style={{color:'#4a5c7a',fontSize:11,marginTop:3}}>{setup.setupType || 'AI Setup'} . {setup.bias === 'bullish' ? '^ Bullish' : 'v Bearish'} . Conf {setup.confidence}/10</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:20,lineHeight:1}}></button>
        </div>

        {/* Trade type */}
        <div style={{display:'flex',gap:6,marginBottom:14}}>
          {['stock','options'].map(t => (
            <button key={t} onClick={()=>setType(t)} style={{flex:1,padding:'8px',background:type===t?'rgba(37,99,235,0.12)':'rgba(255,255,255,0.04)',border:`1px solid ${type===t?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.08)'}`,borderRadius:8,color:type===t?'#60a5fa':'#6b7a90',fontSize:11,cursor:'pointer'}}>
              {t === 'stock' ? ' Stock / ETF' : ' Options'}
            </button>
          ))}
        </div>

        {/* Price levels */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          <div><label style={lbl}>Entry ($)</label><input value={entry} onChange={e=>setEntry(e.target.value)} placeholder={setup?.entryHigh || setup?.entry_high || 'e.g. 150'} style={{...inp,borderColor:entry?'rgba(37,99,235,0.3)':undefined}}/></div>
          <div><label style={lbl}>Stop Loss ($)</label><input value={stop} onChange={e=>setStop(e.target.value)} placeholder={setup?.stopLoss || setup?.stop_loss || 'e.g. 145'} style={{...inp,borderColor:stop?'rgba(239,68,68,0.3)':undefined}}/></div>
          <div><label style={lbl}>Target ($)</label><input value={target} onChange={e=>setTarget(e.target.value)} placeholder={setup?.target1 || setup?.target_1 || 'e.g. 165'} style={{...inp,borderColor:target?'rgba(16,185,129,0.3)':undefined}}/></div>
          <div><label style={lbl}>{type==='options'?'Contracts':'Shares'}</label><input type="number" value={qty} onChange={e=>setQty(e.target.value)} style={inp}/></div>
        </div>

        {type === 'options' && (
          <div style={{marginBottom:12}}>
            <label style={lbl}>Contract Cost ($)</label>
            <input value={optCost} onChange={e=>setOptCost(e.target.value)} placeholder="e.g. 320" style={inp}/>
          </div>
        )}

        {/* R/R display */}
        {rr && (
          <div style={{background:'rgba(37,99,235,0.06)',border:'1px solid rgba(37,99,235,0.15)',borderRadius:8,padding:'8px 12px',marginBottom:12,display:'flex',gap:16}}>
            <span style={{color:'#60a5fa',fontSize:11}}>R/R: <strong>{rr}:1</strong></span>
            <span style={{color:parseFloat(rr)>=2?'#10b981':parseFloat(rr)>=1?'#f59e0b':'#ef4444',fontSize:11}}>{parseFloat(rr)>=2?' Strong':' Borderline'}</span>
            {entry && stop && <span style={{color:'#4a5c7a',fontSize:11}}>Risk/share: ${fmt(Math.abs(parseFloat(entry)-parseFloat(stop)))}</span>}
          </div>
        )}

        {/* Notes */}
        <div style={{marginBottom:16}}>
          <label style={lbl}>Notes (optional)</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Trade thesis, key levels, why this setup..." style={{...inp,resize:'vertical'}}/>
        </div>

        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'#6b7a90',fontSize:12,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} disabled={saving||!entry||!stop} style={{flex:2,padding:'10px',background:saving?'rgba(16,185,129,0.3)':'linear-gradient(135deg,#10b981,#059669)',border:'none',borderRadius:10,color:'#fff',fontSize:12,cursor:saving||!entry||!stop?'default':'pointer',fontWeight:600,opacity:!entry||!stop?.7:1}}>
            {saving ? ' Saving...' : ' Log to Journal'}
          </button>
        </div>
      </div>
    </div>
  )
}

// === SETUP CARD ===
function SetupCard({ setup, rank, onLogTrade }) {
  const [expanded, setExpanded] = useState(false)
  const [inWatchlist, setInWatchlist] = useState(false)
  const isBull = setup.bias === 'bullish'
  const conf = setup.confidence || 7
  const confColor = conf >= 8 ? '#10b981' : conf >= 6 ? '#f59e0b' : '#ef4444'
  const rrNum = setup.rrRatio || setup.rr_ratio || 0

  useEffect(() => {
    const wl = JSON.parse(localStorage.getItem('ankushai_watchlist') || '[]')
    setInWatchlist(wl.includes(setup.symbol))
  }, [setup.symbol])

  function toggleWatchlist(e) {
    e.stopPropagation()
    const wl = JSON.parse(localStorage.getItem('ankushai_watchlist') || '[]')
    const updated = wl.includes(setup.symbol) ? wl.filter(s=>s!==setup.symbol) : [...wl, setup.symbol]
    localStorage.setItem('ankushai_watchlist', JSON.stringify(updated))
    setInWatchlist(!inWatchlist)
  }

  const frameworks = setup.frameworks || []

  return (
    <div style={{background:'#0d1420',border:`1px solid ${isBull?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'}`,borderRadius:14,padding:'16px 18px',position:'relative',transition:'box-shadow .15s'}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 0 0 1px ${isBull?'rgba(16,185,129,0.4)':'rgba(239,68,68,0.4)'}`}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>

      {/* Rank */}
      <div style={{position:'absolute',top:14,left:-10,background:rank===1?'#f59e0b':rank<=3?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.06)',borderRadius:4,padding:'1px 7px',fontSize:9,fontFamily:'"DM Mono",monospace',color:rank===1?'#080c14':'#6b7a90',fontWeight:700}}>#{rank}</div>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontFamily:'"DM Mono",monospace',fontSize:20,fontWeight:800,color:'#f0f6ff'}}>{setup.symbol}</span>
            <span style={{background:isBull?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',border:`1px solid ${isBull?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'}`,borderRadius:5,padding:'2px 8px',color:isBull?'#10b981':'#ef4444',fontSize:10,fontFamily:'"DM Mono",monospace',fontWeight:700}}>
              {isBull?'^ BULLISH':'v BEARISH'}
            </span>
          </div>
          <div style={{color:'#4a5c7a',fontSize:11,marginTop:3}}>{setup.setupType || setup.setup_type}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{display:'flex',gap:6,alignItems:'center',justifyContent:'flex-end',marginBottom:4}}>
            <span style={{color:'#6b7a90',fontSize:10,fontFamily:'"DM Mono",monospace'}}>R/R</span>
            <span style={{color:rrNum>=2.5?'#10b981':rrNum>=1.5?'#f59e0b':'#ef4444',fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:13}}>{rrNum.toFixed(1)}:1</span>
          </div>
          {setup.ivRank != null && (
            <span style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:4,padding:'1px 7px',color:'#a5b4fc',fontSize:9,fontFamily:'"DM Mono",monospace'}}>IV Rank {setup.ivRank}</span>
          )}
        </div>
      </div>

      {/* Price levels */}
      {(setup.entryHigh || setup.entry_high) && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10,padding:'10px 12px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>
          <div style={{textAlign:'center'}}>
            <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace',marginBottom:3}}>ENTRY ZONE</div>
            <div style={{color:'#f59e0b',fontSize:13,fontWeight:700,fontFamily:'"DM Mono",monospace'}}>{fmtDollar(setup.entryHigh||setup.entry_high)}</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace',marginBottom:3}}>TARGET</div>
            <div style={{color:'#10b981',fontSize:13,fontWeight:700,fontFamily:'"DM Mono",monospace'}}>{fmtDollar(setup.target1||setup.target_1)}</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace',marginBottom:3}}>STOP LOSS</div>
            <div style={{color:'#ef4444',fontSize:13,fontWeight:700,fontFamily:'"DM Mono",monospace'}}>{fmtDollar(setup.stopLoss||setup.stop_loss)}</div>
          </div>
        </div>
      )}

      {/* Recommended trade */}
      {setup.recommendedTrade && (
        <div style={{color:'#60a5fa',fontSize:11,marginBottom:10,padding:'8px 12px',background:'rgba(37,99,235,0.06)',borderRadius:7,borderLeft:'3px solid rgba(37,99,235,0.4)'}}>
          {setup.recommendedTrade}
        </div>
      )}

      {/* Confidence bar */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',minWidth:70}}>CONFIDENCE</div>
        <div style={{flex:1,height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
          <div style={{width:(conf/10*100)+'%',height:'100%',background:confColor,borderRadius:2,transition:'width .3s'}}/>
        </div>
        <div style={{color:confColor,fontSize:10,fontFamily:'"DM Mono",monospace',minWidth:20}}>{conf}</div>
      </div>

      {/* Framework tags */}
      {frameworks.length > 0 && (
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:10}}>
          {frameworks.slice(0,4).map((f,i) => (
            <span key={i} style={{background:'rgba(255,255,255,0.05)',borderRadius:4,padding:'2px 7px',color:'#4a5c7a',fontSize:9,fontFamily:'"DM Mono",monospace'}}>{f}</span>
          ))}
        </div>
      )}

      {/* Expandable analysis */}
      {setup.analysis && (
        <div>
          <button onClick={()=>setExpanded(!expanded)} style={{background:'none',border:'none',color:'#3d4e62',cursor:'pointer',fontSize:10,fontFamily:'"DM Mono",monospace',padding:'4px 0',width:'100%',textAlign:'left'}}>
            {expanded?'^ Hide Analysis':'v Full Analysis'}
          </button>
          {expanded && <div style={{color:'#6b7a90',fontSize:11,lineHeight:1.7,marginTop:6,padding:'10px 12px',background:'rgba(255,255,255,0.02)',borderRadius:8}}>{setup.analysis}</div>}
        </div>
      )}

      {/* Action buttons */}
      <div style={{display:'flex',gap:6,marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
        {/* LOG TRADE - the key new button */}
        <button onClick={()=>onLogTrade(setup)} style={{flex:2,padding:'7px 0',background:'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.08))',border:'1px solid rgba(16,185,129,0.3)',borderRadius:7,color:'#10b981',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace',fontWeight:700,letterSpacing:'.04em',transition:'all .15s'}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(16,185,129,0.2)';e.currentTarget.style.borderColor='rgba(16,185,129,0.5)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.08))';e.currentTarget.style.borderColor='rgba(16,185,129,0.3)'}}>
           Log Trade
        </button>
        <button onClick={()=>window.location.href='/app/charts?symbol='+setup.symbol} style={{flex:1,padding:'7px 0',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,color:'#6b7a90',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>
           Chart
        </button>
        <button onClick={toggleWatchlist} style={{padding:'7px 10px',background:'rgba(255,255,255,0.04)',border:`1px solid ${inWatchlist?'rgba(245,158,11,0.3)':'rgba(255,255,255,0.08)'}`,borderRadius:7,color:inWatchlist?'#f59e0b':'#4a5c7a',fontSize:13,cursor:'pointer'}}>
          {inWatchlist?'':''}
        </button>
      </div>
    </div>
  )
}

// === MAIN PAGE ===
export default function TopSetups() {
  const [setups, setSetups] = useState([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState(null)
  const [filter, setFilter] = useState('All Frameworks')
  const [sortBy, setSortBy] = useState('Confidence')
  const [logTradeSetup, setLogTradeSetup] = useState(null)
  const [scanMode, setScanMode] = useState('BASELINE MODE')
  const [stats, setStats] = useState({ total: 0, bullish: 0, bearish: 0, avgConf: 0, avgRR: 0, watchlist: 0, scansToday: 0 })
  const [isPro, setIsPro] = useState(true) // default true until checked
  const scanRef = useRef(null)

  // -- Subscription check ---------------------------------
  useEffect(() => {
    const checkSub = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setIsPro(false); return }
        // Admin always pro
        if (user.email === 'ankushtasildar2@gmail.com') { setIsPro(true); return }
        const { data } = await supabase.from('subscriptions').select('status,plan').eq('user_id', user.id).eq('status', 'active').maybeSingle()
        setIsPro(!!(data?.status === 'active'))
      } catch(e) { setIsPro(false) }
    }
    checkSub()
  }, [])

  useEffect(() => {
    loadCachedSetups()
  }, [])

  async function loadCachedSetups() {
    setLoading(true)
    try {
      const cached = localStorage.getItem('ankushai_setups')
      if (cached) {
        const data = JSON.parse(cached)
        setSetups(data.setups || [])
        setLastScan(data.timestamp)
        calcStats(data.setups || [])
      }
    } catch(e) {}
    setLoading(false)
  }

  function calcStats(s) {
    const wl = JSON.parse(localStorage.getItem('ankushai_watchlist') || '[]')
    setStats({
      total: s.length,
      bullish: s.filter(x=>x.bias==='bullish').length,
      bearish: s.filter(x=>x.bias==='bearish').length,
      avgConf: s.length ? (s.reduce((a,x)=>a+(x.confidence||0),0)/s.length).toFixed(1) : 0,
      avgRR: s.length ? (s.reduce((a,x)=>a+(x.rrRatio||x.rr_ratio||0),0)/s.length).toFixed(1) : 0,
      watchlist: s.filter(x=>wl.includes(x.symbol)).length,
      scansToday: parseInt(localStorage.getItem('ankushai_scans_today')||'0')
    })
  }

  async function runScan() {
    setScanning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/analysis?type=scan', {
        headers: session ? { 'Authorization': 'Bearer ' + session.access_token } : {}
      })
      if (!r.ok) throw new Error('Scan failed: ' + r.status)
      const data = await r.json()
      const newSetups = data.setups || data || []
      setSetups(newSetups)
      setLastScan(Date.now())
      calcStats(newSetups)
      localStorage.setItem('ankushai_setups', JSON.stringify({ setups: newSetups, timestamp: Date.now() }))
      const today = new Date().toDateString()
      if (localStorage.getItem('ankushai_scan_date') !== today) {
        localStorage.setItem('ankushai_scan_date', today)
        localStorage.setItem('ankushai_scans_today', '1')
      } else {
        localStorage.setItem('ankushai_scans_today', String(parseInt(localStorage.getItem('ankushai_scans_today')||'0')+1))
      }
    } catch(e) {
      console.error('Scan error:', e.message)
    }
    setScanning(false)
  }

  const FILTERS = ['All Frameworks','breakout','momentum','earnings','fibonacci','macro','technical','options','sympathy','sector','the_strat','value']
  const SORTS = ['Confidence','Urgency','R/R Ratio','Analyst Agreement']

  const filtered = setups.filter(s => filter === 'All Frameworks' || (s.frameworks||[]).includes(filter) || s.setupType?.toLowerCase().includes(filter))
  const sorted = [...filtered].sort((a,b) => {
    if (sortBy === 'Confidence') return (b.confidence||0)-(a.confidence||0)
    if (sortBy === 'R/R Ratio') return (b.rrRatio||b.rr_ratio||0)-(a.rrRatio||a.rr_ratio||0)
    return 0
  })

  const tabStyle = (active) => ({padding:'5px 12px',background:active?'rgba(37,99,235,0.12)':'none',border:`1px solid ${active?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.06)'}`,borderRadius:5,color:active?'#60a5fa':'#4a5c7a',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'})

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif'}}>
      {/* Log Trade Modal */}
      {logTradeSetup && (
        <LogTradeModal
          setup={logTradeSetup}
          onClose={()=>setLogTradeSetup(null)}
          onSaved={()=>{setLogTradeSetup(null)}}
        />
      )}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:24,fontWeight:800,margin:'0 0 4px'}}>AnkushAI Top Setups</h1>
          <div style={{color:'#3d4e62',fontSize:11}}>100 analyst frameworks . 60+ symbol universe . Penny stock gate . Real dollar levels</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,padding:'4px 10px',color:'#4a5c7a',fontSize:10,fontFamily:'"DM Mono",monospace'}}> {scanMode}</span>
          <button onClick={runScan} disabled={scanning} style={{padding:'8px 18px',background:scanning?'rgba(37,99,235,0.3)':'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:8,color:'#fff',fontSize:12,cursor:scanning?'default':'pointer',fontWeight:600,fontFamily:'"DM Mono",monospace',opacity:scanning?.7:1}}>
            {scanning?' Scanning...':' Force Rescan'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{display:'flex',gap:20,padding:'10px 16px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,marginBottom:14,flexWrap:'wrap'}}>
        {[['SETUPS', stats.total],['BULLISH',stats.bullish,'#10b981'],['BEARISH',stats.bearish,'#ef4444'],['AVG CONF',stats.avgConf+'/10'],['AVG R/R',stats.avgRR+':1'],['WATCHLIST',stats.watchlist],['SCANS TODAY',stats.scansToday]].map(([l,v,c])=>(
          <div key={l} style={{textAlign:'center',minWidth:60}}>
            <div style={{color:c||'#f0f6ff',fontFamily:'"DM Mono",monospace',fontSize:16,fontWeight:700}}>{v||'0'}</div>
            <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace',marginTop:2}}>{l}</div>
          </div>
        ))}
        {lastScan && <div style={{color:'#2d3d50',fontSize:10,marginLeft:'auto',alignSelf:'center'}}>Last scan: {new Date(lastScan).toLocaleTimeString()}</div>}
      </div>

      {/* Filter + Sort */}
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        {FILTERS.map(f=>(
          <button key={f} style={tabStyle(filter===f)} onClick={()=>setFilter(f)}>{f}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:4,alignItems:'center'}}>
          <span style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace'}}>SORT BY</span>
          {SORTS.map(s=>(
            <button key={s} style={tabStyle(sortBy===s)} onClick={()=>setSortBy(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {!loading && setups.length === 0 && (
        <div style={{textAlign:'center',padding:'60px 20px',color:'#3d4e62'}}>
          <div style={{fontSize:48,marginBottom:16}}></div>
          <div style={{fontSize:16,fontWeight:600,color:'#f0f6ff',marginBottom:8}}>No setups yet</div>
          <div style={{fontSize:12,marginBottom:20}}>Run a scan to get AI-powered setup recommendations</div>
          <button onClick={runScan} disabled={scanning} style={{padding:'10px 24px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:10,color:'#fff',fontSize:13,cursor:'pointer',fontWeight:600}}>
            {scanning?' Scanning...':' Run Scan'}
          </button>
        </div>
      )}

      {/* Setup cards grid */}
      {sorted.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14}}>
          {sorted.map((setup, i) => {
            const locked = !isPro && i >= 3
            return (
              <div key={setup.symbol + i} style={{position:'relative'}}>
                <SetupCard
                  setup={setup}
                  rank={i+1}
                  onLogTrade={locked ? undefined : setLogTradeSetup}
                />
                {locked && (
                  <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(8,11,18,0.82)',backdropFilter:'blur(6px)',borderRadius:12,border:'1px solid rgba(59,130,246,0.3)',zIndex:10,gap:12}}>
                    <div style={{fontSize:24}}>LOCKED</div>
                    <div style={{fontWeight:700,fontSize:15,color:'#f0f6ff',textAlign:'center'}}>Pro Setup</div>
                    <div style={{fontSize:12,color:'#8899aa',textAlign:'center',maxWidth:200}}>Upgrade to see all setups</div>
                    <a href="/billing" style={{marginTop:4,background:'#3b82f6',color:'#fff',borderRadius:8,padding:'8px 20px',fontSize:13,fontWeight:600,cursor:'pointer',textDecoration:'none',display:'inline-block'}}>
                      Upgrade to Pro
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {!isPro && sorted.length > 3 && (
          <div style={{textAlign:'center',marginTop:24,padding:'16px',background:'rgba(59,130,246,0.08)',borderRadius:12,border:'1px solid rgba(59,130,246,0.2)'}}>
            <span style={{color:'#8899aa',fontSize:13}}>Showing <strong style={{color:'#f0f6ff'}}>3 of {sorted.length}</strong> setups. </span>
            <a href="/billing" style={{color:'#3b82f6',fontSize:13,fontWeight:600,textDecoration:'none'}}>Upgrade to Pro to unlock all</a>
          </div>
        )}
    </div>
  )
}
