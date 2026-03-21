import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const fmt = (n, d=2) => n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
const fmtDollar = (n, showSign=false) => {
  if (n==null) return '—'
  const abs = '$'+fmt(Math.abs(n))
  return showSign ? (n>=0?'+':'-')+abs : (n<0?'-':'')+abs
}
const fmtPct = (n) => n==null?'—':(n>=0?'+':'')+fmt(n)+'%'

const STATUS_COLORS = { open:'#60a5fa', closed_win:'#10b981', closed_loss:'#ef4444', breakeven:'#f59e0b' }
const STATUS_LABELS = { open:'Open', closed_win:'Win ✓', closed_loss:'Loss ✗', breakeven:'B/E' }

function PnLBadge({ entry, exit, qty, type, optCost }) {
  if (!entry || !exit) return null
  let pnl
  if (type === 'options' && optCost) {
    pnl = (exit - optCost) * (qty || 1) * 100
  } else {
    pnl = (exit - entry) * (qty || 1)
  }
  const color = pnl > 0 ? '#10b981' : pnl < 0 ? '#ef4444' : '#f59e0b'
  return <span style={{color,fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:12}}>{fmtDollar(pnl,true)}</span>
}

function CloseTradeModal({ trade, onClose, onClosed }) {
  const [exitPrice, setExitPrice] = useState('')
  const [exitDate, setExitDate] = useState(new Date().toISOString().split('T')[0])
  const [lesson, setLesson] = useState('')
  const [saving, setSaving] = useState(false)

  const entry = trade.entry_price
  const qty = trade.quantity || 1
  const type = trade.trade_type
  const optCost = trade.option_cost
  
  let pnl = null, pnlPct = null
  if (exitPrice && entry) {
    if (type === 'options' && optCost) {
      pnl = (parseFloat(exitPrice) - optCost) * qty * 100
      pnlPct = (pnl / (optCost * qty * 100)) * 100
    } else {
      pnl = (parseFloat(exitPrice) - entry) * qty
      pnlPct = ((parseFloat(exitPrice) - entry) / entry) * 100
    }
  }

  async function close() {
    if (!exitPrice) return
    setSaving(true)
    const status = pnl > 0 ? 'closed_win' : pnl < 0 ? 'closed_loss' : 'breakeven'
    const { error } = await supabase.from('journal_entries').update({
      exit_price: parseFloat(exitPrice),
      pnl_dollar: pnl,
      pnl_percent: pnlPct,
      status,
      closed_at: new Date(exitDate).toISOString(),
      notes: trade.notes ? trade.notes + (lesson ? '\n\nLesson: ' + lesson : '') : lesson,
    }).eq('id', trade.id)
    if (!error) { onClosed(); onClose() }
    else { alert('Error: ' + error.message); setSaving(false) }
  }

  const inp = {width:'100%',padding:'8px 12px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'#f0f6ff',fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'#0d1420',border:'1px solid rgba(255,255,255,0.1)',borderRadius:16,padding:24,width:380}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
          <div>
            <div style={{fontFamily:'"Syne",sans-serif',fontSize:17,fontWeight:700}}>Close Trade: {trade.symbol}</div>
            <div style={{color:'#4a5c7a',fontSize:11,marginTop:2}}>Entry: ${fmt(entry)} · {qty} {type==='options'?'contracts':'shares'}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:20}}>✕</button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          <div>
            <label style={{color:'#4a5c7a',fontSize:10,display:'block',marginBottom:5}}>Exit Price ($)</label>
            <input value={exitPrice} onChange={e=>setExitPrice(e.target.value)} placeholder="e.g. 165" style={{...inp,borderColor:exitPrice?'rgba(16,185,129,0.3)':undefined}} autoFocus/>
          </div>
          <div>
            <label style={{color:'#4a5c7a',fontSize:10,display:'block',marginBottom:5}}>Exit Date</label>
            <input type="date" value={exitDate} onChange={e=>setExitDate(e.target.value)} style={inp}/>
          </div>
        </div>

        {pnl !== null && (
          <div style={{background:pnl>=0?'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)',border:`1px solid ${pnl>=0?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'}`,borderRadius:8,padding:'10px 14px',marginBottom:12,display:'flex',justifyContent:'space-between'}}>
            <div>
              <div style={{color:'#3d4e62',fontSize:9,marginBottom:3}}>P&L</div>
              <div style={{fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:18,color:pnl>=0?'#10b981':'#ef4444'}}>{fmtDollar(pnl,true)}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{color:'#3d4e62',fontSize:9,marginBottom:3}}>RETURN</div>
              <div style={{fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:18,color:pnl>=0?'#10b981':'#ef4444'}}>{fmtPct(pnlPct)}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{color:'#3d4e62',fontSize:9,marginBottom:3}}>OUTCOME</div>
              <div style={{fontSize:12,color:pnl>0?'#10b981':pnl<0?'#ef4444':'#f59e0b',fontWeight:700}}>{pnl>0?'WIN ✓':pnl<0?'LOSS ✗':'BREAKEVEN'}</div>
            </div>
          </div>
        )}

        <div style={{marginBottom:14}}>
          <label style={{color:'#4a5c7a',fontSize:10,display:'block',marginBottom:5}}>Trade Lesson (optional)</label>
          <textarea value={lesson} onChange={e=>setLesson(e.target.value)} rows={2} placeholder="What did you learn? What would you do differently?" style={{...inp,resize:'vertical'}}/>
        </div>

        <div style={{display:'flex',gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'#6b7a90',fontSize:12,cursor:'pointer'}}>Cancel</button>
          <button onClick={close} disabled={saving||!exitPrice} style={{flex:2,padding:'10px',background:pnl>=0?'linear-gradient(135deg,#10b981,#059669)':'linear-gradient(135deg,#ef4444,#dc2626)',border:'none',borderRadius:10,color:'#fff',fontSize:12,cursor:'pointer',fontWeight:600,opacity:!exitPrice?.6:1}}>
            {saving?'Saving...':pnl>=0?'✓ Close as Win':'✗ Close as Loss'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Journal() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [search, setSearch] = useState('')
  const [closingTrade, setClosingTrade] = useState(null)
  const [stats, setStats] = useState({})
  const [expandedId, setExpandedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('journal_entries')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) {
      setEntries(data)
      calcStats(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function calcStats(data) {
    const closed = data.filter(e => e.status !== 'open' && e.pnl_dollar != null)
    const wins = closed.filter(e => e.pnl_dollar > 0)
    const totalPnl = closed.reduce((a, e) => a + (e.pnl_dollar || 0), 0)
    const avgWin = wins.length ? wins.reduce((a, e) => a + e.pnl_dollar, 0) / wins.length : 0
    const losses = closed.filter(e => e.pnl_dollar < 0)
    const avgLoss = losses.length ? losses.reduce((a, e) => a + Math.abs(e.pnl_dollar), 0) / losses.length : 0
    const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : wins.length > 0 ? 999 : 0
    setStats({
      total: data.length,
      open: data.filter(e => e.status === 'open').length,
      closed: closed.length,
      winRate: closed.length ? (wins.length / closed.length * 100).toFixed(1) : 0,
      totalPnl,
      avgWin,
      avgLoss,
      profitFactor: profitFactor.toFixed(2),
      streak: calcStreak(closed),
    })
  }

  function calcStreak(closed) {
    if (!closed.length) return { count: 0, type: 'none' }
    const sorted = [...closed].sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
    const first = sorted[0].pnl_dollar > 0 ? 'win' : 'loss'
    let count = 0
    for (const t of sorted) {
      if ((t.pnl_dollar > 0 ? 'win' : 'loss') === first) count++
      else break
    }
    return { count, type: first }
  }

  function exportCSV() {
    const headers = ['Symbol','Setup','Bias','Status','Entry','Exit','Stop','Target','Qty','Type','PnL($)','PnL(%)','R/R','Confidence','Date Opened','Date Closed','Notes']
    const rows = filtered.map(e => [
      e.symbol, e.setup_type, e.bias, e.status,
      e.entry_price, e.exit_price, e.stop_price, e.target_price,
      e.quantity, e.trade_type, e.pnl_dollar?.toFixed(2), e.pnl_percent?.toFixed(2),
      e.rr_ratio, e.confidence,
      e.opened_at?.split('T')[0] || e.created_at?.split('T')[0],
      e.closed_at?.split('T')[0] || '',
      (e.notes || '').replace(/,/g, ';').replace(/\n/g, ' ')
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}))
    a.download = `ankushai-journal-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const filtered = entries
    .filter(e => {
      if (filter === 'open') return e.status === 'open'
      if (filter === 'wins') return e.status === 'closed_win'
      if (filter === 'losses') return e.status === 'closed_loss'
      if (filter === 'options') return e.trade_type === 'options'
      if (filter === 'stock') return e.trade_type === 'stock'
      return true
    })
    .filter(e => !search || e.symbol?.toLowerCase().includes(search.toLowerCase()) || e.setup_type?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at)
      if (sort === 'pnl') return (b.pnl_dollar||0) - (a.pnl_dollar||0)
      if (sort === 'symbol') return a.symbol?.localeCompare(b.symbol)
      return 0
    })

  const tabStyle = active => ({padding:'5px 12px',background:active?'rgba(37,99,235,0.12)':'none',border:`1px solid ${active?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.06)'}`,borderRadius:5,color:active?'#60a5fa':'#4a5c7a',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'})

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif'}}>
      {closingTrade && <CloseTradeModal trade={closingTrade} onClose={()=>setClosingTrade(null)} onClosed={load}/>}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,margin:'0 0 2px'}}>Trade Journal</h1>
          <div style={{color:'#3d4e62',fontSize:11}}>Complete trade history with P&L tracking and performance analytics</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={exportCSV} style={{padding:'8px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'#6b7a90',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>↓ Export CSV</button>
          <button onClick={()=>navigate('/app/setups')} style={{padding:'8px 14px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:8,color:'#fff',fontSize:11,cursor:'pointer',fontFamily:'"DM Mono",monospace',fontWeight:600}}>+ New Trade</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['TOTAL P&L', fmtDollar(stats.totalPnl,true), stats.totalPnl>=0?'#10b981':stats.totalPnl<0?'#ef4444':'#f0f6ff'],
          ['WIN RATE', stats.winRate+'%', parseFloat(stats.winRate)>=50?'#10b981':'#ef4444'],
          ['PROFIT FACTOR', stats.profitFactor, parseFloat(stats.profitFactor)>=1?'#10b981':'#ef4444'],
          ['AVG WIN', fmtDollar(stats.avgWin,true), '#10b981'],
          ['AVG LOSS', fmtDollar(stats.avgLoss && -stats.avgLoss,true), '#ef4444'],
          ['OPEN POS', stats.open, '#60a5fa'],
          ['TOTAL TRADES', stats.closed, '#f0f6ff'],
          ['STREAK', stats.streak?.count ? `${stats.streak.count} ${stats.streak.type}` : '—', stats.streak?.type==='win'?'#10b981':stats.streak?.type==='loss'?'#ef4444':'#4a5c7a'],
        ].map(([label,val,color]) => (
          <div key={label} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:8,padding:'10px 12px',textAlign:'center'}}>
            <div style={{color:color||'#f0f6ff',fontFamily:'"DM Mono",monospace',fontSize:15,fontWeight:700}}>{val||'—'}</div>
            <div style={{color:'#3d4e62',fontSize:8,fontFamily:'"DM Mono",monospace',marginTop:3}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        {[['all','All'],['open','Open'],['wins','Wins'],['losses','Losses'],['options','Options'],['stock','Stock']].map(([v,l])=>(
          <button key={v} style={tabStyle(filter===v)} onClick={()=>setFilter(v)}>{l}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search symbol..." style={{padding:'5px 10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'#f0f6ff',fontSize:11,outline:'none',width:130}}/>
          {[['newest','Newest'],['pnl','P&L'],['symbol','Symbol']].map(([v,l])=>(
            <button key={v} style={tabStyle(sort===v)} onClick={()=>setSort(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div style={{textAlign:'center',padding:'60px 20px',color:'#3d4e62'}}>
          <div style={{fontSize:48,marginBottom:16}}>📓</div>
          <div style={{fontSize:16,fontWeight:600,color:'#f0f6ff',marginBottom:8}}>No trades logged yet</div>
          <div style={{fontSize:12,marginBottom:20}}>Run a scan and click "Log Trade" on any setup to start tracking</div>
          <button onClick={()=>navigate('/app/setups')} style={{padding:'10px 24px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',border:'none',borderRadius:10,color:'#fff',fontSize:13,cursor:'pointer',fontWeight:600}}>Go to Top Setups</button>
        </div>
      )}

      {/* Trade table */}
      {filtered.length > 0 && (
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,overflow:'hidden'}}>
          {/* Table header */}
          <div style={{display:'grid',gridTemplateColumns:'80px 120px 70px 70px 80px 80px 80px 80px 90px 100px',gap:0,padding:'8px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:9,color:'#3d4e62',fontFamily:'"DM Mono",monospace'}}>
            <span>SYMBOL</span><span>SETUP</span><span>BIAS</span><span>TYPE</span><span>ENTRY</span><span>EXIT</span><span>P&L</span><span>RETURN</span><span>STATUS</span><span>ACTIONS</span>
          </div>

          {filtered.map(e => {
            const isExpanded = expandedId === e.id
            const statusColor = STATUS_COLORS[e.status] || '#4a5c7a'
            return (
              <div key={e.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <div
                  onClick={()=>setExpandedId(isExpanded?null:e.id)}
                  style={{display:'grid',gridTemplateColumns:'80px 120px 70px 70px 80px 80px 80px 80px 90px 100px',gap:0,padding:'10px 16px',cursor:'pointer',transition:'background .1s'}}
                  onMouseEnter={ev=>ev.currentTarget.style.background='rgba(255,255,255,0.02)'}
                  onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}
                >
                  <span style={{fontFamily:'"DM Mono",monospace',fontWeight:700,fontSize:13}}>{e.symbol}</span>
                  <span style={{color:'#4a5c7a',fontSize:10,paddingRight:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.setup_type}</span>
                  <span style={{color:e.bias==='bullish'?'#10b981':'#ef4444',fontSize:10,fontFamily:'"DM Mono",monospace'}}>{e.bias==='bullish'?'▲ Bull':'▼ Bear'}</span>
                  <span style={{color:'#4a5c7a',fontSize:10,textTransform:'uppercase'}}>{e.trade_type||'—'}</span>
                  <span style={{fontFamily:'"DM Mono",monospace',fontSize:12}}>{e.entry_price?'$'+fmt(e.entry_price):'—'}</span>
                  <span style={{fontFamily:'"DM Mono",monospace',fontSize:12,color:'#6b7a90'}}>{e.exit_price?'$'+fmt(e.exit_price):'—'}</span>
                  <span style={{fontFamily:'"DM Mono",monospace',fontSize:12,fontWeight:700,color:e.pnl_dollar>0?'#10b981':e.pnl_dollar<0?'#ef4444':'#f0f6ff'}}>{e.pnl_dollar!=null?fmtDollar(e.pnl_dollar,true):'—'}</span>
                  <span style={{fontFamily:'"DM Mono",monospace',fontSize:12,color:e.pnl_percent>0?'#10b981':e.pnl_percent<0?'#ef4444':'#f0f6ff'}}>{e.pnl_percent!=null?fmtPct(e.pnl_percent):'—'}</span>
                  <span style={{display:'flex',alignItems:'center'}}>
                    <span style={{background:`${statusColor}15`,border:`1px solid ${statusColor}30`,borderRadius:4,padding:'2px 7px',color:statusColor,fontSize:9,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{STATUS_LABELS[e.status]||e.status}</span>
                  </span>
                  <span style={{display:'flex',gap:5,alignItems:'center'}}>
                    {e.status === 'open' && (
                      <button onClick={ev=>{ev.stopPropagation();setClosingTrade(e)}} style={{padding:'3px 8px',background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.25)',borderRadius:5,color:'#10b981',fontSize:9,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>Close</button>
                    )}
                    <button onClick={ev=>{ev.stopPropagation();navigate('/app/charts?symbol='+e.symbol)}} style={{padding:'3px 8px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:5,color:'#4a5c7a',fontSize:9,cursor:'pointer'}}>Chart</button>
                  </span>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{padding:'12px 16px',background:'rgba(255,255,255,0.02)',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:12,marginBottom:12}}>
                      {[
                        ['Stop Loss', e.stop_price?'$'+fmt(e.stop_price):'—'],
                        ['Target', e.target_price?'$'+fmt(e.target_price):'—'],
                        ['R/R Ratio', e.rr_ratio?e.rr_ratio+'x':'—'],
                        ['Confidence', e.confidence?e.confidence+'/10':'—'],
                        ['Quantity', e.quantity||'—'],
                        ['Option Cost', e.option_cost?'$'+fmt(e.option_cost):'—'],
                        ['Opened', e.opened_at?.split('T')[0]||e.created_at?.split('T')[0]||'—'],
                        ['Closed', e.closed_at?.split('T')[0]||'—'],
                      ].map(([label,val])=>(
                        <div key={label}>
                          <div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',marginBottom:3}}>{label}</div>
                          <div style={{fontSize:12,fontFamily:'"DM Mono",monospace'}}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {e.notes && <div style={{color:'#6b7a90',fontSize:11,lineHeight:1.7,padding:'8px 12px',background:'rgba(255,255,255,0.02)',borderRadius:6}}>{e.notes}</div>}
                    {e.frameworks?.length > 0 && (
                      <div style={{display:'flex',gap:5,marginTop:8,flexWrap:'wrap'}}>
                        {e.frameworks.map((f,i)=><span key={i} style={{background:'rgba(255,255,255,0.04)',borderRadius:4,padding:'2px 7px',color:'#4a5c7a',fontSize:9,fontFamily:'"DM Mono",monospace'}}>{f}</span>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
