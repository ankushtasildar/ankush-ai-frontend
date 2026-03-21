import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const fmt = (n,d=2) => n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
const fmtD = (n,sign=false) => { if(n==null)return'—'; const s=sign&&n>0?'+':''; return s+(n<0?'-':'')+'$'+fmt(Math.abs(n)) }
const fmtPct = n => n==null?'—':(n>=0?'+':'')+fmt(n,1)+'%'

async function getLivePrice(symbol) {
  try {
    const r = await fetch('/api/market?action=quote&symbol='+symbol)
    const d = await r.json()
    return { price: d.price, changePercent: d.changePercent }
  } catch(e) { return null }
}

export default function Portfolio() {
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [summary, setSummary] = useState({ totalValue:0, totalCost:0, totalPnl:0, dayPnl:0, openTrades:0, winRate:0 })
  const [accountSize, setAccountSize] = useState(10000)
  const [addingPos, setAddingPos] = useState(false)
  const [newPos, setNewPos] = useState({ symbol:'', shares:'', avgCost:'', type:'stock' })

  const loadPortfolio = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Get open journal trades as positions
    const { data: trades } = await supabase.from('journal_entries')
      .select('*').eq('user_id', user.id).eq('status', 'open')

    // Get closed trades for stats
    const { data: closed } = await supabase.from('journal_entries')
      .select('pnl_amount, status').eq('user_id', user.id).neq('status', 'open')

    // Get user prefs for account size
    const { data: prefs } = await supabase.from('user_preferences')
      .select('account_size').eq('user_id', user.id).single()
    if (prefs?.account_size) setAccountSize(prefs.account_size)

    const openTrades = trades || []
    const closedTrades = closed || []
    const totalPnlClosed = closedTrades.reduce((a,x)=>a+(x.pnl_amount||0),0)
    const won = closedTrades.filter(x=>x.status==='won').length
    const winRate = closedTrades.length ? Math.round(won/closedTrades.length*100) : 0

    setPositions(openTrades)
    setSummary(s => ({...s, openTrades: openTrades.length, totalPnl: totalPnlClosed, winRate }))
    setLoading(false)
  }, [])

  useEffect(() => { loadPortfolio() }, [loadPortfolio])

  async function refreshPrices() {
    setRefreshing(true)
    const symbols = [...new Set(positions.map(p => p.symbol))]
    const quotes = await Promise.allSettled(symbols.map(s => getLivePrice(s)))
    const priceMap = {}
    symbols.forEach((s, i) => {
      if (quotes[i].status === 'fulfilled' && quotes[i].value) {
        priceMap[s] = quotes[i].value
      }
    })
    // Calculate live P&L for each position
    let totalValue = 0, totalCost = 0, dayPnl = 0
    const updated = positions.map(p => {
      const liveData = priceMap[p.symbol]
      const currentPrice = liveData?.price || p.entry_price || 0
      const qty = p.quantity || 1
      const cost = (p.entry_price || 0) * qty
      const value = currentPrice * qty
      const unrealized = value - cost
      const dayChange = liveData ? liveData.changePercent * cost / 100 : 0
      totalValue += value
      totalCost += cost
      dayPnl += dayChange
      return { ...p, currentPrice, unrealized, dayChange, unrealizedPct: cost > 0 ? unrealized/cost*100 : 0 }
    })
    setPositions(updated)
    setSummary(s => ({...s, totalValue, totalCost, dayPnl, totalUnrealized: totalValue - totalCost }))
    setRefreshing(false)
  }

  const inp = {padding:'7px 10px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,color:'#f0f6ff',fontSize:12,outline:'none',fontFamily:'"DM Mono",monospace',width:'100%'}

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:24,fontWeight:800,margin:'0 0 3px'}}>Portfolio</h1>
          <div style={{color:'#3d4e62',fontSize:11}}>Live P&L from open journal trades</div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={refreshPrices} disabled={refreshing} style={{padding:'7px 14px',background:'rgba(37,99,235,0.1)',border:'1px solid rgba(37,99,235,0.3)',borderRadius:8,color:'#60a5fa',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>
            {refreshing?'⟳ Refreshing...':'⟳ Refresh Prices'}
          </button>
          <button onClick={()=>setAddingPos(!addingPos)} style={{padding:'7px 14px',background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:8,color:'#10b981',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>
            + Add Position
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['ACCOUNT SIZE','$'+fmt(accountSize),'#f0f6ff'],
          ['OPEN POSITIONS',summary.openTrades,'#f59e0b'],
          ['UNREALIZED P&L',fmtD(summary.totalUnrealized||0,true),summary.totalUnrealized>0?'#10b981':summary.totalUnrealized<0?'#ef4444':'#4a5c7a'],
          ['TODAY\'S P&L',fmtD(summary.dayPnl||0,true),summary.dayPnl>0?'#10b981':summary.dayPnl<0?'#ef4444':'#4a5c7a'],
          ['REALIZED P&L',fmtD(summary.totalPnl,true),summary.totalPnl>0?'#10b981':summary.totalPnl<0?'#ef4444':'#4a5c7a'],
          ['WIN RATE',summary.winRate+'%',summary.winRate>=55?'#10b981':summary.winRate>=45?'#f59e0b':'#ef4444'],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'12px 14px'}}>
            <div style={{color:c,fontFamily:'"DM Mono",monospace',fontSize:17,fontWeight:800}}>{v}</div>
            <div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',marginTop:3}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Positions table */}
      {loading && <div style={{textAlign:'center',color:'#3d4e62',padding:40,fontFamily:'"DM Mono",monospace',fontSize:12}}>Loading portfolio...</div>}
      {!loading && positions.length === 0 && (
        <div style={{textAlign:'center',padding:'60px 20px',color:'#3d4e62'}}>
          <div style={{fontSize:36,marginBottom:12}}>📊</div>
          <div style={{fontSize:14,color:'#f0f6ff',marginBottom:6}}>No open positions</div>
          <div style={{fontSize:11}}>Log trades from TopSetups to track your portfolio live</div>
        </div>
      )}
      {positions.length > 0 && (
        <div style={{background:'#0d1420',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'80px 70px 90px 90px 90px 90px 90px 1fr',padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,0.05)',color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',gap:8}}>
            <span>SYMBOL</span><span>BIAS</span><span>ENTRY</span><span>CURRENT</span><span>QTY</span><span>UNREALIZED</span><span>DAY %</span><span>SETUP</span>
          </div>
          {positions.map(p => {
            const color = p.unrealized > 0 ? '#10b981' : p.unrealized < 0 ? '#ef4444' : '#4a5c7a'
            return (
              <div key={p.id} style={{display:'grid',gridTemplateColumns:'80px 70px 90px 90px 90px 90px 90px 1fr',padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',gap:8,alignItems:'center'}}>
                <span style={{fontFamily:'"DM Mono",monospace',fontWeight:800,fontSize:14}}>{p.symbol}</span>
                <span style={{color:p.bias==='bullish'?'#10b981':'#ef4444',fontSize:10}}>{p.bias==='bullish'?'▲ BULL':'▼ BEAR'}</span>
                <span style={{fontFamily:'"DM Mono",monospace',fontSize:12}}>${fmt(p.entry_price)}</span>
                <span style={{fontFamily:'"DM Mono",monospace',fontSize:12,color:p.currentPrice?'#f0f6ff':'#4a5c7a'}}>{p.currentPrice?'$'+fmt(p.currentPrice):'—'}</span>
                <span style={{fontFamily:'"DM Mono",monospace',fontSize:12}}>{p.quantity||1}</span>
                <span style={{fontFamily:'"DM Mono",monospace',fontSize:12,color}}>{p.unrealized!=null?fmtD(p.unrealized,true):'—'}</span>
                <span style={{fontFamily:'"DM Mono",monospace',fontSize:11,color:p.dayChange>0?'#10b981':p.dayChange<0?'#ef4444':'#4a5c7a'}}>{p.unrealizedPct!=null?fmtPct(p.unrealizedPct):'—'}</span>
                <span style={{color:'#3d4e62',fontSize:10}}>{p.setup_type}</span>
              </div>
            )
          })}
        </div>
      )}

      <div style={{marginTop:16,padding:'10px 14px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.04)',borderRadius:8,color:'#2d3d50',fontSize:10,lineHeight:1.7}}>
        Portfolio positions are pulled from open Journal trades. Click "Refresh Prices" for live P&L. Close trades in the Journal to realize P&L.
      </div>
    </div>
  )
}
