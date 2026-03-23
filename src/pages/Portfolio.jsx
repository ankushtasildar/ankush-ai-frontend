import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { WinStreak, TradeLoggedToast, SignalMeter } from '../components/Gamification'
import { useNavigate } from 'react-router-dom'

const fmt = (n, d=2) => n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
const fmtDollar = (n, sign=false) => n==null?'—':(sign&&n>0?'+':'')+(n<0?'-':'')+'$'+fmt(Math.abs(n))
const fmtPct = n => n==null?'—':(n>=0?'+':'')+fmt(n)+'%'

export default function Portfolio() {
  const navigate = useNavigate()
  const [positions, setPositions] = useState([])
  const [tradeLogged, setTradeLogged] = useState(false)
  const [lastLoggedSymbol, setLastLoggedSymbol] = useState('')   // open journal entries
  const [closed, setClosed] = useState([])          // closed journal entries
  const [prices, setPrices] = useState({})          // live prices keyed by symbol
  const [loading, setLoading] = useState(true)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [accountSize, setAccountSize] = useState(10000)
  const [editingSize, setEditingSize] = useState(false)
  const [newSize, setNewSize] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('journal_entries')
      .select('*')
      .order('opened_at', { ascending: false })
    if (data) {
      setPositions(data.filter(e => e.status === 'open'))
      setClosed(data.filter(e => e.status !== 'open' && e.pnl_dollar != null))
    }
    // Load saved account size
    const saved = localStorage.getItem('ankushai_account_size')
    if (saved) setAccountSize(parseFloat(saved))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Fetch live prices for open positions
  useEffect(() => {
    const syms = [...new Set(positions.map(p => p.symbol).filter(Boolean))]
    if (!syms.length) return
    setPricesLoading(true)
    fetch(`/api/market?action=quotes&symbols=${syms.join(',')}`)
      .then(r => r.json())
      .then(data => {
        const map = {}
        if (Array.isArray(data)) data.forEach(q => { if (q.symbol) map[q.symbol] = q })
        setPrices(map)
      })
      .catch(() => {})
      .finally(() => setPricesLoading(false))
  }, [positions])

  // Computed stats from all trades
  const wins = closed.filter(e => e.pnl_dollar > 0)
  const losses = closed.filter(e => e.pnl_dollar < 0)
  const realizedPnL = closed.reduce((a, e) => a + (e.pnl_dollar || 0), 0)
  const winRate = closed.length ? wins.length / closed.length * 100 : 0
  const avgWin = wins.length ? wins.reduce((a, e) => a + e.pnl_dollar, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((a, e) => a + Math.abs(e.pnl_dollar), 0) / losses.length : 0
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : wins.length > 0 ? 99 : 0

  // Unrealized P&L from open positions using live prices
  const unrealizedPnL = positions.reduce((sum, p) => {
    const livePrice = prices[p.symbol]?.price
    if (!livePrice || !p.entry_price) return sum
    const qty = p.quantity || 1
    if (p.trade_type === 'options' && p.option_cost) {
      return sum + (livePrice - p.option_cost) * qty * 100
    }
    return sum + (livePrice - p.entry_price) * qty
  }, 0)

  const totalPnL = realizedPnL + unrealizedPnL
  const portfolioValue = accountSize + realizedPnL
  const returnPct = accountSize > 0 ? (realizedPnL / accountSize) * 100 : 0

  function saveAccountSize() {
    const val = parseFloat(newSize)
    if (!isNaN(val) && val > 0) {
      setAccountSize(val)
      localStorage.setItem('ankushai_account_size', val)
    }
    setEditingSize(false)
  }

  const statCard = (label, value, color, sub) => (
    <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,padding:'14px 16px'}}>
      <div style={{color:color||'#f0f6ff',fontFamily:'"DM Mono",monospace',fontSize:20,fontWeight:800}}>{value}</div>
      <div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',marginTop:3}}>{label}</div>
      {sub && <div style={{color:'#4a5c7a',fontSize:10,marginTop:4}}>{sub}</div>}
    </div>
  )

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif'}}>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,margin:'0 0 2px'}}>Portfolio</h1>
          <div style={{color:'#3d4e62',fontSize:11}}>Live P&L from journal trades · {positions.length} open · {closed.length} closed</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {editingSize ? (
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <input value={newSize} onChange={e=>setNewSize(e.target.value)} placeholder={accountSize}
                style={{padding:'6px 10px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(37,99,235,0.4)',borderRadius:7,color:'#f0f6ff',fontSize:12,width:110,outline:'none',fontFamily:'inherit'}}
                autoFocus onKeyDown={e=>{if(e.key==='Enter')saveAccountSize();if(e.key==='Escape')setEditingSize(false)}}/>
              <button onClick={saveAccountSize} style={{padding:'6px 12px',background:'rgba(37,99,235,0.2)',border:'1px solid rgba(37,99,235,0.3)',borderRadius:7,color:'#60a5fa',fontSize:11,cursor:'pointer'}}>Save</button>
            </div>
          ) : (
            <button onClick={()=>{setNewSize(accountSize);setEditingSize(true)}} style={{padding:'7px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'#4a5c7a',fontSize:11,cursor:'pointer'}}>
              Account: ${fmt(accountSize,0)}
            </button>
          )}
          <button onClick={()=>navigate('/app/setups')} style={{padding:'7px 14px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:8,color:'#fff',fontSize:11,cursor:'pointer',fontWeight:600}}>+ Log Trade</button>
        </div>
      </div>

      {/* Main stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:20}}>
        {statCard('PORTFOLIO VALUE', '$'+fmt(portfolioValue,0), portfolioValue>=accountSize?'#10b981':'#ef4444')}
        {statCard('REALIZED P&L', fmtDollar(realizedPnL,true), realizedPnL>=0?'#10b981':'#ef4444', `${fmtPct(returnPct)} return`)}
        {statCard('UNREALIZED P&L', fmtDollar(unrealizedPnL,true), unrealizedPnL>=0?'#10b981':'#ef4444', pricesLoading?'updating...':'live prices')}
        {statCard('WIN RATE', winRate.toFixed(1)+'%', winRate>=50?'#10b981':'#ef4444', `${wins.length}W / ${losses.length}L`)}
        {statCard('PROFIT FACTOR', profitFactor.toFixed(2), profitFactor>=1.5?'#10b981':profitFactor>=1?'#f59e0b':'#ef4444')}
        {statCard('AVG WIN', fmtDollar(avgWin,true), '#10b981')}
        {statCard('AVG LOSS', '-$'+fmt(avgLoss), '#ef4444')}
        {statCard('OPEN POSITIONS', positions.length, '#60a5fa')}
      </div>

      {/* Open positions */}
      {positions.length > 0 && (
        <div style={{marginBottom:24}}>
          <div style={{fontSize:12,fontWeight:700,color:'#4a5c7a',marginBottom:10,fontFamily:'"DM Mono",monospace',display:'flex',alignItems:'center',gap:8}}>
            OPEN POSITIONS
            {pricesLoading && <span style={{color:'#3d4e62',fontSize:9}}>updating prices...</span>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:10}}>
            {positions.map(p => {
              const livePrice = prices[p.symbol]?.price
              const liveChange = prices[p.symbol]?.changePercent
              let unrlzd = null, unrlzdPct = null
              if (livePrice && p.entry_price) {
                const qty = p.quantity || 1
                if (p.trade_type === 'options' && p.option_cost) {
                  unrlzd = (livePrice - p.option_cost) * qty * 100
                  unrlzdPct = (livePrice - p.option_cost) / p.option_cost * 100
                } else {
                  unrlzd = (livePrice - p.entry_price) * qty
                  unrlzdPct = (livePrice - p.entry_price) / p.entry_price * 100
                }
              }
              const pnlColor = unrlzd == null ? '#4a5c7a' : unrlzd > 0 ? '#10b981' : '#ef4444'
              const distToStop = p.entry_price && p.stop_price ? ((p.entry_price - p.stop_price) / p.entry_price * 100) : null
              const distToTarget = p.entry_price && p.target_price ? ((p.target_price - p.entry_price) / p.entry_price * 100) : null
              const isBull = p.bias === 'bullish'

              return (
                <div key={p.id} style={{background:'#0d1420',border:`1px solid ${isBull?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'}`,borderRadius:12,padding:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontFamily:'"DM Mono",monospace',fontSize:18,fontWeight:800}}>{p.symbol}</span>
                        <span style={{background:isBull?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',border:`1px solid ${isBull?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'}`,borderRadius:4,padding:'1px 6px',color:isBull?'#10b981':'#ef4444',fontSize:9,fontWeight:700}}>{isBull?'▲ BULL':'▼ BEAR'}</span>
                        <span style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace'}}>{p.trade_type?.toUpperCase()}</span>
                      </div>
                      <div style={{color:'#4a5c7a',fontSize:10,marginTop:2}}>{p.setup_type}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      {livePrice && <div style={{fontFamily:'"DM Mono",monospace',fontSize:16,fontWeight:700}}>${fmt(livePrice)}</div>}
                      {liveChange != null && <div style={{fontSize:10,color:liveChange>=0?'#10b981':'#ef4444',fontFamily:'"DM Mono",monospace'}}>{fmtPct(liveChange)}</div>}
                    </div>
                  </div>

                  {/* Price levels progress */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:10,padding:'8px 10px',background:'rgba(255,255,255,0.02)',borderRadius:8}}>
                    <div style={{textAlign:'center'}}>
                      <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace'}}>ENTRY</div>
                      <div style={{color:'#f59e0b',fontSize:12,fontWeight:700,fontFamily:'"DM Mono",monospace'}}>${fmt(p.entry_price)}</div>
                    </div>
                    <div style={{textAlign:'center'}}>
                      <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace'}}>TARGET</div>
                      <div style={{color:'#10b981',fontSize:12,fontWeight:700,fontFamily:'"DM Mono",monospace'}}>{p.target_price?'$'+fmt(p.target_price):'—'}</div>
                    </div>
                    <div style={{textAlign:'center'}}>
                      <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace'}}>STOP</div>
                      <div style={{color:'#ef4444',fontSize:12,fontWeight:700,fontFamily:'"DM Mono",monospace'}}>{p.stop_price?'$'+fmt(p.stop_price):'—'}</div>
                    </div>
                  </div>

                  {/* Unrealized P&L */}
                  {unrlzd != null && (
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:`${pnlColor}10`,borderRadius:6,marginBottom:8}}>
                      <span style={{color:'#4a5c7a',fontSize:9,fontFamily:'"DM Mono",monospace'}}>UNREALIZED P&L</span>
                      <div style={{display:'flex',gap:8}}>
                        <span style={{color:pnlColor,fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:13}}>{fmtDollar(unrlzd,true)}</span>
                        <span style={{color:pnlColor,fontFamily:'"DM Mono",monospace',fontSize:11}}>{fmtPct(unrlzdPct)}</span>
                      </div>
                    </div>
                  )}

                  {/* Risk metrics */}
                  <div style={{display:'flex',gap:10,fontSize:9,color:'#3d4e62',fontFamily:'"DM Mono",monospace'}}>
                    {p.rr_ratio && <span>R/R: <strong style={{color:'#4a5c7a'}}>{p.rr_ratio}x</strong></span>}
                    {distToStop && <span>Risk: <strong style={{color:'#ef4444'}}>{fmt(Math.abs(distToStop),1)}%</strong></span>}
                    {distToTarget && <span>Upside: <strong style={{color:'#10b981'}}>{fmt(distToTarget,1)}%</strong></span>}
                    {p.confidence && <span>Conf: <strong style={{color:'#60a5fa'}}>{p.confidence}/10</strong></span>}
                  </div>

                  <div style={{display:'flex',gap:6,marginTop:10,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                    <button onClick={()=>navigate('/app/journal')} style={{flex:1,padding:'6px',background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:6,color:'#10b981',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>Close Trade</button>
                    <button onClick={()=>navigate('/app/charts?symbol='+p.symbol)} style={{flex:1,padding:'6px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:6,color:'#6b7a90',fontSize:10,cursor:'pointer'}}>Chart</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Closed trades performance curve */}
      {closed.length > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:'#4a5c7a',marginBottom:10,fontFamily:'"DM Mono",monospace'}}>RECENT CLOSED TRADES</div>
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,overflow:'hidden'}}>
            {closed.slice(0,10).map((e,i) => (
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:i<9?'1px solid rgba(255,255,255,0.03)':'none'}}>
                <span style={{fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:13,minWidth:60}}>{e.symbol}</span>
                <span style={{color:'#4a5c7a',fontSize:10,flex:1}}>{e.setup_type}</span>
                <span style={{fontFamily:'"DM Mono",monospace',fontSize:12,fontWeight:700,color:e.pnl_dollar>0?'#10b981':'#ef4444',minWidth:80,textAlign:'right'}}>{fmtDollar(e.pnl_dollar,true)}</span>
                <span style={{fontFamily:'"DM Mono",monospace',fontSize:11,color:e.pnl_percent>0?'#10b981':'#ef4444',minWidth:60,textAlign:'right'}}>{fmtPct(e.pnl_percent)}</span>
                <span style={{background:e.pnl_dollar>0?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',border:`1px solid ${e.pnl_dollar>0?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'}`,borderRadius:4,padding:'2px 6px',color:e.pnl_dollar>0?'#10b981':'#ef4444',fontSize:9,fontWeight:700}}>{e.pnl_dollar>0?'WIN':'LOSS'}</span>
              </div>
            ))}
          </div>
          {closed.length > 10 && (
            <button onClick={()=>navigate('/app/journal')} style={{width:'100%',padding:'8px',background:'none',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,color:'#4a5c7a',fontSize:11,cursor:'pointer',marginTop:8}}>View all {closed.length} trades in Journal →</button>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && positions.length === 0 && closed.length === 0 && (
        <div style={{textAlign:'center',padding:'60px 20px',color:'#3d4e62'}}>
          <div style={{fontSize:48,marginBottom:16}}>📊</div>
          <div style={{fontSize:16,fontWeight:600,color:'#f0f6ff',marginBottom:8}}>No positions yet</div>
          <div style={{fontSize:12,marginBottom:20}}>Start tracking your edge today — log your first trade from Top Setups</div>
          <button onClick={()=>navigate('/app/setups')} style={{padding:'10px 24px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:10,color:'#fff',fontSize:13,cursor:'pointer',fontWeight:600}}>Go to Top Setups</button>
        </div>
      )}
    </div>
  )
}
