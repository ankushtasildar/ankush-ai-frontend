import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const fmt = (n, d=2) => n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
const fmtDollar = (n, showSign=false) => {
  if (n==null) return '—'
  const abs = '$'+fmt(Math.abs(n))
  if (!showSign) return (n < 0 ? '-' : '')+abs
  return (n >= 0 ? '+' : '-')+abs
}
const fmtPct = n => n==null?'—':(n >= 0 ? '+' : '')+fmt(n,1)+'%'

const STATUS_COLORS = { open: '#f59e0b', closed: '#4a5c7a', won: '#10b981', lost: '#ef4444' }

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'12px 14px',minWidth:110}}>
      <div style={{color:color||'#f0f6ff',fontFamily:'"DM Mono",monospace',fontSize:18,fontWeight:800}}>{value}</div>
      <div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',marginTop:3}}>{label}</div>
      {sub && <div style={{color:'#4a5c7a',fontSize:9,marginTop:2}}>{sub}</div>}
    </div>
  )
}

function TradeRow({ trade, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [editExit, setEditExit] = useState(false)
  const [exitPrice, setExitPrice] = useState('')
  const [exitDate, setExitDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  const isOpen = trade.status === 'open'
  const pnl = trade.pnl_amount || 0
  const pnlColor = pnl > 0 ? '#10b981' : pnl < 0 ? '#ef4444' : '#4a5c7a'

  async function closeTradeAt(price) {
    setSaving(true)
    const exitP = parseFloat(price)
    const entry = trade.entry_price || 0
    const qty = trade.quantity || 1
    const pnlAmt = trade.trade_type === 'options'
      ? (exitP - (trade.option_cost || entry)) * qty * 100
      : (exitP - entry) * qty
    const pnlPct = entry > 0 ? (exitP - entry) / entry * 100 : 0
    const won = pnlAmt > 0

    await supabase.from('journal_entries').update({
      exit_price: exitP, status: won ? 'won' : 'lost',
      pnl_amount: pnlAmt, pnl_percent: pnlPct,
      closed_at: new Date(exitDate).toISOString(),
      outcome: won ? 'win' : 'loss'
    }).eq('id', trade.id)

    onUpdate()
    setSaving(false)
    setEditExit(false)
  }

  async function deleteTrade() {
    if (!confirm(`Delete ${trade.symbol} trade?`)) return
    await supabase.from('journal_entries').delete().eq('id', trade.id)
    onDelete()
  }

  const rr = trade.rr_ratio || (trade.entry_price && trade.stop_price && trade.target_price
    ? Math.abs(trade.target_price - trade.entry_price) / Math.abs(trade.entry_price - trade.stop_price)
    : null)

  return (
    <div style={{background:'#0d1420',border:`1px solid ${isOpen?'rgba(245,158,11,0.2)':pnl>0?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)'}`,borderRadius:12,marginBottom:6,overflow:'hidden'}}>
      {/* Main row */}
      <div style={{display:'flex',alignItems:'center',padding:'10px 14px',gap:12,cursor:'pointer'}} onClick={()=>setExpanded(!expanded)}>
        <div style={{fontFamily:'"DM Mono",monospace',fontWeight:800,fontSize:15,minWidth:60}}>{trade.symbol}</div>
        <div style={{background:STATUS_COLORS[trade.status]+'22',border:`1px solid ${STATUS_COLORS[trade.status]}44`,borderRadius:4,padding:'1px 7px',color:STATUS_COLORS[trade.status],fontSize:9,fontFamily:'"DM Mono",monospace',fontWeight:700}}>
          {(trade.status||'open').toUpperCase()}
        </div>
        <div style={{color:trade.bias==='bullish'?'#10b981':'#ef4444',fontSize:10,fontFamily:'"DM Mono",monospace'}}>{trade.bias==='bullish'?'▲':'▼'}</div>
        <div style={{color:'#4a5c7a',fontSize:10,flex:1}}>{trade.setup_type}</div>
        <div style={{textAlign:'right'}}>
          {!isOpen && <div style={{color:pnlColor,fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:14}}>{fmtDollar(pnl, true)}</div>}
          {!isOpen && <div style={{color:pnlColor,fontSize:10}}>{fmtPct(trade.pnl_percent)}</div>}
          {isOpen && trade.entry_price && <div style={{color:'#f59e0b',fontFamily:'"DM Mono",monospace',fontSize:13}}>@ ${fmt(trade.entry_price)}</div>}
        </div>
        <div style={{color:'#3d4e62',fontSize:9,minWidth:70,textAlign:'right'}}>{trade.opened_at ? new Date(trade.opened_at).toLocaleDateString() : ''}</div>
        <div style={{color:'#2d3d50',fontSize:12}}>{expanded?'▲':'▼'}</div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{padding:'10px 14px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8,marginBottom:10}}>
            {[['ENTRY', trade.entry_price?'$'+fmt(trade.entry_price):null],['STOP','$'+fmt(trade.stop_price)],['TARGET','$'+fmt(trade.target_price)],['R/R',rr?rr.toFixed(1)+':1':null],['TYPE',trade.trade_type],['CONF',trade.confidence?trade.confidence+'/10':null],['QTY',trade.quantity]].map(([l,v])=>v&&(
              <div key={l} style={{textAlign:'center',padding:'6px',background:'rgba(255,255,255,0.02)',borderRadius:6}}>
                <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace',marginBottom:3}}>{l}</div>
                <div style={{color:'#f0f6ff',fontSize:12,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{v}</div>
              </div>
            ))}
          </div>
          {trade.notes && <div style={{color:'#4a5c7a',fontSize:11,marginBottom:10,padding:'8px 10px',background:'rgba(255,255,255,0.02)',borderRadius:6,lineHeight:1.6}}>{trade.notes}</div>}
          {trade.frameworks?.length > 0 && (
            <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap'}}>
              {trade.frameworks.map((f,i)=><span key={i} style={{background:'rgba(255,255,255,0.05)',borderRadius:4,padding:'2px 7px',color:'#4a5c7a',fontSize:9}}>{f}</span>)}
            </div>
          )}

          {/* Actions */}
          <div style={{display:'flex',gap:6}}>
            {isOpen && !editExit && (
              <button onClick={(e)=>{e.stopPropagation();setEditExit(true)}} style={{padding:'6px 12px',background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:7,color:'#10b981',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>
                ✓ Close Trade
              </button>
            )}
            {isOpen && editExit && (
              <div style={{display:'flex',gap:6,alignItems:'center',flex:1}}>
                <input value={exitPrice} onChange={e=>setExitPrice(e.target.value)} placeholder="Exit price" style={{padding:'5px 10px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:7,color:'#f0f6ff',fontSize:12,width:100,outline:'none',fontFamily:'"DM Mono",monospace'}}/>
                <input type="date" value={exitDate} onChange={e=>setExitDate(e.target.value)} style={{padding:'5px 8px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,color:'#f0f6ff',fontSize:11,outline:'none'}}/>
                <button onClick={(e)=>{e.stopPropagation();closeTradeAt(exitPrice)}} disabled={!exitPrice||saving} style={{padding:'5px 12px',background:saving?'rgba(16,185,129,0.3)':'linear-gradient(135deg,#10b981,#059669)',border:'none',borderRadius:7,color:'#fff',fontSize:10,cursor:'pointer',fontWeight:700}}>
                  {saving?'..':'Save'}
                </button>
                <button onClick={(e)=>{e.stopPropagation();setEditExit(false)}} style={{padding:'5px 8px',background:'none',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,color:'#4a5c7a',fontSize:10,cursor:'pointer'}}>✕</button>
              </div>
            )}
            <button onClick={(e)=>{e.stopPropagation();deleteTrade()}} style={{padding:'6px 10px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:7,color:'#ef4444',fontSize:10,cursor:'pointer',marginLeft:'auto'}}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Journal() {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [stats, setStats] = useState({ total:0, open:0, won:0, lost:0, winRate:0, totalPnl:0, avgWin:0, avgLoss:0, bestTrade:0, worstTrade:0, avgRR:0, profitFactor:0 })

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('opened_at', { ascending: false })
    const t = data || []
    setTrades(t)
    calcStats(t)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function calcStats(t) {
    const closed = t.filter(x => x.status !== 'open')
    const won = t.filter(x => x.status === 'won')
    const lost = t.filter(x => x.status === 'lost')
    const totalPnl = closed.reduce((a,x) => a+(x.pnl_amount||0), 0)
    const wins = won.map(x => x.pnl_amount||0)
    const losses = lost.map(x => Math.abs(x.pnl_amount||0))
    const grossWin = wins.reduce((a,v)=>a+v,0)
    const grossLoss = losses.reduce((a,v)=>a+v,0)
    setStats({
      total: t.length, open: t.filter(x=>x.status==='open').length,
      won: won.length, lost: lost.length,
      winRate: closed.length ? Math.round(won.length/closed.length*100) : 0,
      totalPnl, avgWin: wins.length ? grossWin/wins.length : 0,
      avgLoss: losses.length ? grossLoss/losses.length : 0,
      bestTrade: wins.length ? Math.max(...wins) : 0,
      worstTrade: losses.length ? -Math.max(...losses) : 0,
      avgRR: t.filter(x=>x.rr_ratio).length ? t.filter(x=>x.rr_ratio).reduce((a,x)=>a+(x.rr_ratio||0),0)/t.filter(x=>x.rr_ratio).length : 0,
      profitFactor: grossLoss > 0 ? grossWin/grossLoss : grossWin > 0 ? 99 : 0
    })
  }

  function exportCSV() {
    const headers = ['Symbol','Setup','Bias','Status','Entry','Exit','Stop','Target','R/R','P&L $','P&L %','Type','Qty','Confidence','Opened','Closed','Notes']
    const rows = trades.map(t => [
      t.symbol,t.setup_type,t.bias,t.status,t.entry_price,t.exit_price,t.stop_price,t.target_price,
      t.rr_ratio,t.pnl_amount?.toFixed(2),t.pnl_percent?.toFixed(2),t.trade_type,t.quantity,t.confidence,
      t.opened_at?.split('T')[0],t.closed_at?.split('T')[0],t.notes?.replace(/,/g,'')
    ])
    const csv = [headers, ...rows].map(r=>r.map(v=>v??'').join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv)
    a.download = `ankushai-journal-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const filtered = trades.filter(t => {
    if (filter === 'open') return t.status === 'open'
    if (filter === 'won') return t.status === 'won'
    if (filter === 'lost') return t.status === 'lost'
    if (filter === 'closed') return t.status !== 'open'
    return true
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.opened_at||0) - new Date(a.opened_at||0)
    if (sortBy === 'pnl') return (b.pnl_amount||0) - (a.pnl_amount||0)
    if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol)
    return 0
  })

  const tabStyle = (active) => ({padding:'5px 12px',background:active?'rgba(37,99,235,0.12)':'none',border:`1px solid ${active?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.06)'}`,borderRadius:5,color:active?'#60a5fa':'#4a5c7a',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'})

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:24,fontWeight:800,margin:'0 0 3px'}}>Trading Journal</h1>
          <div style={{color:'#3d4e62',fontSize:11}}>Track every trade. Learn from every outcome. Build edge.</div>
        </div>
        <button onClick={exportCSV} style={{padding:'8px 16px',background:'rgba(37,99,235,0.1)',border:'1px solid rgba(37,99,235,0.3)',borderRadius:8,color:'#60a5fa',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>
          ↓ Export CSV
        </button>
      </div>

      {/* Stats grid */}
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <StatCard label="TOTAL TRADES" value={stats.total} />
        <StatCard label="OPEN" value={stats.open} color="#f59e0b" />
        <StatCard label="WIN RATE" value={stats.winRate+'%'} color={stats.winRate>=55?'#10b981':stats.winRate>=45?'#f59e0b':'#ef4444'} sub={`${stats.won}W / ${stats.lost}L`} />
        <StatCard label="TOTAL P&L" value={fmtDollar(stats.totalPnl,true)} color={stats.totalPnl>0?'#10b981':stats.totalPnl<0?'#ef4444':'#4a5c7a'} />
        <StatCard label="AVG WIN" value={fmtDollar(stats.avgWin)} color="#10b981" />
        <StatCard label="AVG LOSS" value={fmtDollar(-stats.avgLoss)} color="#ef4444" />
        <StatCard label="PROFIT FACTOR" value={stats.profitFactor.toFixed(2)} color={stats.profitFactor>=1.5?'#10b981':stats.profitFactor>=1?'#f59e0b':'#ef4444'} />
        <StatCard label="AVG R/R" value={stats.avgRR.toFixed(1)+':1'} />
        <StatCard label="BEST TRADE" value={fmtDollar(stats.bestTrade,true)} color="#10b981" />
        <StatCard label="WORST TRADE" value={fmtDollar(stats.worstTrade,true)} color="#ef4444" />
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:6,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
        {[['all','All'],['open','Open'],['won','Winners'],['lost','Losers'],['closed','Closed']].map(([v,l])=>(
          <button key={v} style={tabStyle(filter===v)} onClick={()=>setFilter(v)}>{l}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:4}}>
          <span style={{color:'#3d4e62',fontSize:9,alignSelf:'center',fontFamily:'"DM Mono",monospace'}}>SORT</span>
          {[['newest','Newest'],['pnl','P&L'],['symbol','Symbol']].map(([v,l])=>(
            <button key={v} style={tabStyle(sortBy===v)} onClick={()=>setSortBy(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* Trades */}
      {loading && <div style={{textAlign:'center',color:'#3d4e62',padding:40,fontFamily:'"DM Mono",monospace',fontSize:12}}>Loading journal...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{textAlign:'center',padding:'60px 20px',color:'#3d4e62'}}>
          <div style={{fontSize:36,marginBottom:12}}>📓</div>
          <div style={{fontSize:14,fontWeight:600,color:'#f0f6ff',marginBottom:6}}>No trades yet</div>
          <div style={{fontSize:11}}>Run a scan, find a setup, and click "Log Trade" to start tracking</div>
        </div>
      )}
      {filtered.map(trade => (
        <TradeRow key={trade.id} trade={trade} onUpdate={load} onDelete={load} />
      ))}
    </div>
  )
}
