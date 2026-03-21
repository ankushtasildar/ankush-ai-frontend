import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const fmt = (n, d=2) => n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})

// Alert type configs
const ALERT_TYPES = [
  { value: 'price_above', label: 'Price Above', icon: '↑', color: '#10b981' },
  { value: 'price_below', label: 'Price Below', icon: '↓', color: '#ef4444' },
  { value: 'percent_change', label: '% Change', icon: '±', color: '#f59e0b' },
  { value: 'vix_above', label: 'VIX Above', icon: '⚡', color: '#a78bfa' },
  { value: 'rsi_above', label: 'RSI Above', icon: '📈', color: '#60a5fa' },
  { value: 'rsi_below', label: 'RSI Below', icon: '📉', color: '#f97316' },
]

function CreateAlertModal({ onClose, onCreated }) {
  const [symbol, setSymbol] = useState('')
  const [type, setType] = useState('price_above')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!symbol || !value) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('price_alerts').insert({
      symbol: symbol.toUpperCase().trim(),
      alert_type: type,
      target_value: parseFloat(value),
      is_active: true,
      user_id: user?.id,
    })
    if (!error) { onCreated(); onClose() }
    else { alert('Error: ' + error.message); setSaving(false) }
  }

  const inp = { width:'100%', padding:'8px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#f0f6ff', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }
  const selectedType = ALERT_TYPES.find(t => t.value === type)

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#0d1420',border:'1px solid rgba(255,255,255,0.1)',borderRadius:16,padding:24,width:360}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontFamily:'"Syne",sans-serif',fontSize:17,fontWeight:700}}>🔔 Set Price Alert</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:20}}>✕</button>
        </div>

        <div style={{marginBottom:12}}>
          <label style={{color:'#4a5c7a',fontSize:10,display:'block',marginBottom:5}}>SYMBOL</label>
          <input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} placeholder="e.g. AAPL" style={inp} autoFocus/>
        </div>

        <div style={{marginBottom:12}}>
          <label style={{color:'#4a5c7a',fontSize:10,display:'block',marginBottom:5}}>ALERT TYPE</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
            {ALERT_TYPES.map(t => (
              <button key={t.value} onClick={()=>setType(t.value)} style={{padding:'6px 4px',background:type===t.value?`${t.color}15`:'rgba(255,255,255,0.03)',border:`1px solid ${type===t.value?`${t.color}40`:'rgba(255,255,255,0.07)'}`,borderRadius:6,color:type===t.value?t.color:'#4a5c7a',fontSize:10,cursor:'pointer',textAlign:'center'}}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <label style={{color:'#4a5c7a',fontSize:10,display:'block',marginBottom:5}}>
            TARGET VALUE {type === 'percent_change' ? '(%)' : type.includes('rsi') ? '(RSI 0-100)' : '($)'}
          </label>
          <input value={value} onChange={e=>setValue(e.target.value)} placeholder={type==='percent_change'?'e.g. -5':type.includes('rsi')?'e.g. 70':'e.g. 150'} style={{...inp,borderColor:value?`${selectedType?.color}40`:undefined}}/>
        </div>

        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'#6b7a90',fontSize:12,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} disabled={saving||!symbol||!value} style={{flex:2,padding:'10px',background:`linear-gradient(135deg,${selectedType?.color||'#2563eb'},${selectedType?.color||'#1d4ed8'})`,border:'none',borderRadius:10,color:'#fff',fontSize:12,cursor:'pointer',fontWeight:600,opacity:!symbol||!value?.6:1}}>
            {saving?'Saving...':'🔔 Set Alert'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Signals() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState([])
  const [openSetups, setOpenSetups] = useState([])
  const [liveData, setLiveData] = useState({}) // symbol -> {price, change, changePercent}
  const [showCreateAlert, setShowCreateAlert] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const refreshRef = useRef(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    // Load DB alerts
    const { data: dbAlerts } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    // Load open trades from journal as signals
    const { data: trades } = await supabase
      .from('journal_entries')
      .select('symbol, entry_price, stop_price, target_price, bias, setup_type, rr_ratio, confidence')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20)

    // Also load from cached scan for potential setups
    const { data: scanCache } = await supabase
      .from('scan_cache')
      .select('scan_data')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (dbAlerts) setAlerts(dbAlerts)
    if (trades) setOpenSetups(trades)

    // Merge scan setups with open trades if available
    if (scanCache?.scan_data?.setups) {
      const scanSetups = scanCache.scan_data.setups.slice(0, 5)
      setOpenSetups(prev => {
        const symbols = new Set(prev.map(t => t.symbol))
        const newOnes = scanSetups.filter(s => !symbols.has(s.symbol)).map(s => ({
          symbol: s.symbol, entry_price: s.entryHigh || s.entry_high,
          stop_price: s.stopLoss || s.stop_loss, target_price: s.target1 || s.target_1,
          bias: s.bias, setup_type: s.setupType || s.setup_type, rr_ratio: s.rrRatio || s.rr_ratio,
          confidence: s.confidence, fromScan: true
        }))
        return [...prev, ...newOnes]
      })
    }
    setLoading(false)
  }, [])

  // Fetch live prices
  const refreshPrices = useCallback(async () => {
    const allSymbols = [...new Set([
      ...alerts.map(a => a.symbol).filter(Boolean),
      ...openSetups.map(s => s.symbol).filter(Boolean),
    ])]
    if (!allSymbols.length) return

    try {
      const r = await fetch(`/api/market?action=quotes&symbols=${allSymbols.slice(0,15).join(',')}`)
      const data = await r.json()
      if (Array.isArray(data)) {
        const map = {}
        data.forEach(q => { if (q.symbol && q.price) map[q.symbol] = q })
        setLiveData(map)
        setLastUpdate(new Date())

        // Check and trigger alerts
        for (const alert of alerts) {
          const price = map[alert.symbol]?.price
          if (!price || !alert.is_active) continue

          let triggered = false
          if (alert.alert_type === 'price_above' && price >= alert.target_value) triggered = true
          if (alert.alert_type === 'price_below' && price <= alert.target_value) triggered = true
          if (alert.alert_type === 'percent_change' && map[alert.symbol]?.changePercent != null) {
            if (Math.abs(map[alert.symbol].changePercent) >= Math.abs(alert.target_value)) triggered = true
          }
          if (alert.alert_type === 'vix_above' && alert.symbol === 'VIX') triggered = price >= alert.target_value

          if (triggered) {
            // Mark triggered in DB
            supabase.from('price_alerts').update({ triggered_at: new Date().toISOString(), is_active: false })
              .eq('id', alert.id).then(() => loadData())
            // Browser notification
            if (Notification.permission === 'granted') {
              new Notification(`🔔 AnkushAI Alert: ${alert.symbol}`, {
                body: `${alert.alert_type.replace('_',' ')} $${fmt(alert.target_value)} — Current: $${fmt(price)}`
              })
            }
          }
        }
      }
    } catch(e) {}
  }, [alerts, openSetups, loadData])

  useEffect(() => {
    loadData()
    if (Notification.permission === 'default') Notification.requestPermission()
  }, [loadData])

  useEffect(() => {
    if (alerts.length || openSetups.length) refreshPrices()
  }, [alerts, openSetups])

  // Auto-refresh every 60s during market hours, 5min after hours
  useEffect(() => {
    const now = new Date()
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const mins = et.getHours() * 60 + et.getMinutes()
    const isMarketHours = et.getDay() >= 1 && et.getDay() <= 5 && mins >= 570 && mins < 960
    const interval = isMarketHours ? 60000 : 300000
    refreshRef.current = setInterval(refreshPrices, interval)
    return () => clearInterval(refreshRef.current)
  }, [refreshPrices])

  async function deleteAlert(id) {
    await supabase.from('price_alerts').update({ is_active: false }).eq('id', id)
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const signalCard = (setup, idx) => {
    const live = liveData[setup.symbol]
    const price = live?.price
    const changePercent = live?.changePercent

    // Signal strength vs entry
    let distFromEntry = null, hitTarget = false, hitStop = false, atEntry = false
    if (price && setup.entry_price) {
      distFromEntry = ((price - setup.entry_price) / setup.entry_price * 100)
      hitTarget = setup.target_price && price >= setup.target_price
      hitStop = setup.stop_price && price <= setup.stop_price
      atEntry = Math.abs(distFromEntry) < 2 // within 2% of entry
    }

    const signalStatus = hitTarget ? 'target' : hitStop ? 'stop' : atEntry ? 'entry' : 'watching'
    const statusColors = { target: '#10b981', stop: '#ef4444', entry: '#f59e0b', watching: '#4a5c7a' }
    const statusLabels = { target: '🎯 TARGET HIT', stop: '🛑 STOP HIT', entry: '⚡ AT ENTRY', watching: '👁 Watching' }

    return (
      <div key={idx} style={{background:'#0d1420',border:`1px solid ${setup.bias==='bullish'?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'}`,borderRadius:12,padding:16,position:'relative'}}>
        {/* Status badge */}
        <div style={{position:'absolute',top:12,right:12,background:`${statusColors[signalStatus]}15`,border:`1px solid ${statusColors[signalStatus]}30`,borderRadius:5,padding:'2px 8px',fontSize:9,color:statusColors[signalStatus],fontFamily:'"DM Mono",monospace',fontWeight:700}}>
          {statusLabels[signalStatus]}
        </div>

        <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:10,paddingRight:120}}>
          <div>
            <div style={{fontFamily:'"DM Mono",monospace',fontSize:18,fontWeight:800}}>{setup.symbol}</div>
            <div style={{color:'#4a5c7a',fontSize:10,marginTop:1}}>{setup.setup_type}</div>
          </div>
          <span style={{background:setup.bias==='bullish'?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',border:`1px solid ${setup.bias==='bullish'?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'}`,borderRadius:4,padding:'2px 7px',color:setup.bias==='bullish'?'#10b981':'#ef4444',fontSize:9,fontWeight:700}}>
            {setup.bias==='bullish'?'▲':'▼'}
          </span>
        </div>

        {/* Live price */}
        {price ? (
          <div style={{display:'flex',gap:12,alignItems:'baseline',marginBottom:10}}>
            <span style={{fontFamily:'"DM Mono",monospace',fontSize:22,fontWeight:800}}>${fmt(price)}</span>
            {changePercent != null && <span style={{color:changePercent>=0?'#10b981':'#ef4444',fontSize:12,fontFamily:'"DM Mono",monospace'}}>{changePercent>=0?'+':''}{fmt(changePercent)}%</span>}
            {distFromEntry != null && <span style={{color:'#4a5c7a',fontSize:10}}>{distFromEntry>=0?'+':''}{fmt(distFromEntry,1)}% from entry</span>}
          </div>
        ) : (
          <div style={{color:'#3d4e62',fontSize:12,marginBottom:10,fontFamily:'"DM Mono",monospace'}}>Loading price...</div>
        )}

        {/* Level markers */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:10}}>
          {[['ENTRY', setup.entry_price, '#f59e0b'],['TARGET', setup.target_price, '#10b981'],['STOP', setup.stop_price, '#ef4444']].map(([lbl,val,color])=>(
            <div key={lbl} style={{textAlign:'center',padding:'6px',background:'rgba(255,255,255,0.02)',borderRadius:6}}>
              <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace',marginBottom:2}}>{lbl}</div>
              <div style={{color:color,fontFamily:'"DM Mono",monospace',fontSize:11,fontWeight:700}}>{val?'$'+fmt(val):'—'}</div>
            </div>
          ))}
        </div>

        {/* Confidence + R/R */}
        <div style={{display:'flex',gap:12,fontSize:9,color:'#3d4e62',fontFamily:'"DM Mono",monospace',marginBottom:10}}>
          {setup.rr_ratio && <span>R/R: <strong style={{color:'#4a5c7a'}}>{setup.rr_ratio}x</strong></span>}
          {setup.confidence && <span>Conf: <strong style={{color:'#60a5fa'}}>{setup.confidence}/10</strong></span>}
          {setup.fromScan && <span style={{color:'#a78bfa'}}>● Live Scan</span>}
        </div>

        <div style={{display:'flex',gap:6,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
          <button onClick={()=>setShowCreateAlert(true)} style={{flex:1,padding:'6px',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:6,color:'#f59e0b',fontSize:9,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>🔔 Set Alert</button>
          <button onClick={()=>navigate('/app/charts?symbol='+setup.symbol)} style={{flex:1,padding:'6px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:6,color:'#6b7a90',fontSize:9,cursor:'pointer'}}>📈 Chart</button>
          {!setup.fromScan && <button onClick={()=>navigate('/app/journal')} style={{flex:1,padding:'6px',background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:6,color:'#10b981',fontSize:9,cursor:'pointer'}}>Close</button>}
        </div>
      </div>
    )
  }

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif'}}>
      {showCreateAlert && <CreateAlertModal onClose={()=>setShowCreateAlert(false)} onCreated={loadData}/>}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,margin:'0 0 2px'}}>Signals</h1>
          <div style={{color:'#3d4e62',fontSize:11}}>Live position monitoring · database-backed alerts · auto-refresh{lastUpdate && ` · updated ${lastUpdate.toLocaleTimeString()}`}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={refreshPrices} style={{padding:'7px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#4a5c7a',fontSize:11,cursor:'pointer'}}>↻ Refresh</button>
          <button onClick={()=>setShowCreateAlert(true)} style={{padding:'7px 14px',background:'linear-gradient(135deg,#f59e0b,#d97706)',border:'none',borderRadius:8,color:'#080c14',fontSize:11,cursor:'pointer',fontWeight:700}}>🔔 New Alert</button>
        </div>
      </div>

      {/* Active alerts */}
      {alerts.length > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:'#4a5c7a',marginBottom:10,fontFamily:'"DM Mono",monospace'}}>ACTIVE ALERTS ({alerts.length})</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {alerts.map(alert => {
              const live = liveData[alert.symbol]
              const typeInfo = ALERT_TYPES.find(t => t.value === alert.alert_type)
              return (
                <div key={alert.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:8}}>
                  <span style={{color:typeInfo?.color||'#60a5fa',fontSize:16}}>{typeInfo?.icon||'🔔'}</span>
                  <div style={{flex:1}}>
                    <span style={{fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:13}}>{alert.symbol}</span>
                    <span style={{color:'#4a5c7a',fontSize:10,marginLeft:8}}>{typeInfo?.label}</span>
                    <span style={{fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:12,marginLeft:8,color:typeInfo?.color}}>${fmt(alert.target_value)}</span>
                  </div>
                  {live?.price && <span style={{fontFamily:'"DM Mono",monospace',fontSize:12,color:'#6b7a90'}}>Current: ${fmt(live.price)}</span>}
                  <button onClick={()=>deleteAlert(alert.id)} style={{padding:'4px 10px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:5,color:'#ef4444',fontSize:10,cursor:'pointer'}}>Remove</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Open position signals */}
      {openSetups.length > 0 && (
        <div>
          <div style={{fontSize:12,fontWeight:700,color:'#4a5c7a',marginBottom:10,fontFamily:'"DM Mono",monospace'}}>POSITION MONITOR ({openSetups.length})</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {openSetups.map((s, i) => signalCard(s, i))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && alerts.length === 0 && openSetups.length === 0 && (
        <div style={{textAlign:'center',padding:'60px 20px',color:'#3d4e62'}}>
          <div style={{fontSize:48,marginBottom:16}}>⚡</div>
          <div style={{fontSize:16,fontWeight:600,color:'#f0f6ff',marginBottom:8}}>No signals yet</div>
          <div style={{fontSize:12,marginBottom:20}}>Set price alerts or log open trades to start monitoring</div>
          <div style={{display:'flex',gap:10,justifyContent:'center'}}>
            <button onClick={()=>setShowCreateAlert(true)} style={{padding:'10px 20px',background:'linear-gradient(135deg,#f59e0b,#d97706)',border:'none',borderRadius:10,color:'#080c14',fontSize:13,cursor:'pointer',fontWeight:700}}>🔔 Set Alert</button>
            <button onClick={()=>navigate('/app/setups')} style={{padding:'10px 20px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:10,color:'#fff',fontSize:13,cursor:'pointer',fontWeight:600}}>Log a Trade</button>
          </div>
        </div>
      )}
    </div>
  )
}
