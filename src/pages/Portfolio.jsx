import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const STRATEGIES = ['Day Trade','Swing Trade','Position Trade','Long-Term','Options Play','Hedging']
const ASSET_TYPES = ['Stock','Options','ETF','Crypto','Futures']
const TICKERS = ['AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','AMD','INTC','SPY','QQQ','IWM','DIA','GLD','SLV','TLT','HYG','XLF','XLE','XLK','XLV','NFLX','UBER','SHOP','SQ','PYPL','COIN','BA','CAT','GE','GM','F','HON','JPM','BAC','GS','MS','C','WFC','V','MA','AXP','JNJ','PFE','MRNA','ABBV','LLY','XOM','CVX','OXY','BABA','NIO','TSM','UVXY','SPXS','SPXL','TQQQ','SQQQ','SOFI','HOOD','PLTR','RBLX','ARKK','SMH','SOXX','MSTR','RIOT','MARA','WMT','TGT','COST','HD','DIS','CRM','NOW','ADBE','ORCL','SMCI','ARM','AVGO','QCOM','MRVL']

function getExpirations() {
  const exps = [], now = new Date()
  for (let i = 1; i <= 52 && exps.length < 16; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i * 7)
    const day = d.getDay(); d.setDate(d.getDate() + ((5 - day + 7) % 7))
    exps.push(d.toISOString().split('T')[0])
  }
  return exps
}

const S = {
  page: { padding:24, fontFamily:'"DM Mono",monospace', minHeight:'100vh', color:'#e2e8f0' },
  btn: (bg='#2563eb',c='white') => ({ padding:'9px 18px',borderRadius:8,border:'none',fontSize:12,cursor:'pointer',fontFamily:'inherit',background:bg,color:c,fontWeight:600 }),
  lbl: { color:'#4a5c7a',fontSize:10,marginBottom:5,display:'block',textTransform:'uppercase',letterSpacing:'0.06em' },
  inp: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:8,padding:'10px 12px',color:'#e2e8f0',fontSize:13,fontFamily:'inherit',width:'100%',outline:'none',boxSizing:'border-box' },
  sel: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:8,padding:'10px 12px',color:'#e2e8f0',fontSize:13,fontFamily:'inherit',width:'100%',outline:'none',cursor:'pointer' },
  g3: { display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14 },
  g4: { display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14 },
}

// ── DB helpers ─────────────────────────────────────────────────────────────────
function posToRow(p, userId) {
  return {
    user_id: userId,
    ticker: p.ticker,
    asset_type: p.assetType,
    strategy: p.strategy,
    direction: p.direction,
    quantity: p.quantity ? parseFloat(p.quantity) : null,
    entry_price: p.entryPrice ? parseFloat(p.entryPrice) : null,
    entry_date: p.entryDate || null,
    contracts: p.contracts ? parseFloat(p.contracts) : null,
    underlying_price: p.underlyingPrice ? parseFloat(p.underlyingPrice) : null,
    strike: p.strike || null,
    option_type: p.optionType || null,
    expiration: p.expiration || null,
    status: p.status || 'open',
    notes: p.notes || null,
  }
}

function rowToPos(r) {
  return {
    id: r.id,
    ticker: r.ticker,
    assetType: r.asset_type,
    strategy: r.strategy,
    direction: r.direction,
    quantity: r.quantity?.toString(),
    entryPrice: r.entry_price?.toString(),
    entryDate: r.entry_date,
    contracts: r.contracts?.toString(),
    underlyingPrice: r.underlying_price?.toString(),
    strike: r.strike,
    optionType: r.option_type,
    expiration: r.expiration,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    closedAt: r.closed_at,
    exitPrice: r.exit_price?.toString(),
  }
}

// ── Ticker autocomplete ────────────────────────────────────────────────────────
function TickerInput({ value, onChange, onSelect }) {
  const [open, setOpen] = useState(false)
  const [sugg, setSugg] = useState([])
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const handle = v => {
    onChange(v); const q = v.toUpperCase()
    if (q.length >= 1) { const s = TICKERS.filter(t => t.startsWith(q)).slice(0, 8); setSugg(s); setOpen(s.length > 0) }
    else setOpen(false)
  }
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <input style={{ ...S.inp,textTransform:'uppercase' }} value={value} onChange={e=>handle(e.target.value)} placeholder="AAPL, TSLA..." onFocus={()=>sugg.length&&setOpen(true)} />
      {open && (
        <div style={{ position:'absolute',top:'105%',left:0,right:0,background:'#141b24',border:'1px solid #2d3f55',borderRadius:8,zIndex:300,boxShadow:'0 10px 40px rgba(0,0,0,0.7)' }}>
          {sugg.map(s => (
            <div key={s} onMouseDown={()=>{ onSelect(s); setOpen(false) }}
              style={{ padding:'10px 14px',cursor:'pointer',fontSize:13,color:'#93c5fd',borderBottom:'1px solid #1e2d3d' }}
              onMouseEnter={e=>e.currentTarget.style.background='#1e2d3d'}
              onMouseLeave={e=>e.currentTarget.style.background=''}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Options Ladder ─────────────────────────────────────────────────────────────
function OptionsLadder({ ticker, expiration, selectedStrike, selectedType, onSelect, onPriceUpdate }) {
  const [chain, setChain] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!ticker) return
    setLoading(true); setError(null)
    fetch(`/api/options-chain?symbol=${ticker}${expiration?'&expiration='+expiration:''}`)
      .then(r=>r.json()).then(d=>{
        if (d.error) throw new Error(d.error)
        setChain(d)
        if (d.underlyingPrice && onPriceUpdate) onPriceUpdate(d.underlyingPrice.toString())
        setLoading(false)
      }).catch(e=>{ setError(e.message); setLoading(false) })
  }, [ticker, expiration])

  if (!ticker) return <div style={{ color:'#4a5c7a',fontSize:12,marginTop:12 }}>Enter a ticker to load chain.</div>
  if (loading) return <div style={{ color:'#4a5c7a',fontSize:12,marginTop:12 }}>Loading chain for {ticker}...</div>
  if (error) return <div style={{ color:'#ef4444',fontSize:12,marginTop:12 }}>⚠ {error}</div>
  if (!chain) return null

  const price = chain.underlyingPrice
  const calls = chain.calls || [], puts = chain.puts || []
  const atmIdx = chain.atmIdx || Math.floor(calls.length / 2)

  return (
    <div style={{ marginTop:16 }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8 }}>
        <div style={{ color:'#93c5fd',fontSize:12,fontWeight:600 }}>
          {ticker} @ <span style={{ color:'#60a5fa' }}>${price}</span>
          {expiration && <span style={{ color:'#4a5c7a',marginLeft:8 }}>exp {expiration}</span>}
        </div>
        <div style={{ display:'flex',gap:12,fontSize:11 }}>
          <span style={{ color:'#4a5c7a' }}>P/C: <strong style={{ color:'#e2e8f0' }}>{chain.metrics?.putCallRatio}</strong></span>
          <span style={{ color:'#4a5c7a' }}>IV Rank: <strong style={{ color:chain.metrics?.ivRank>50?'#ef4444':'#10b981' }}>{chain.metrics?.ivRank}</strong></span>
          <span style={{ color:'#4a5c7a' }}>±Move: <strong style={{ color:'#f59e0b' }}>{chain.metrics?.impliedMovePct}%</strong></span>
        </div>
      </div>
      {chain.metrics?.callWalls?.length > 0 && (
        <div style={{ fontSize:10,color:'#4a5c7a',marginBottom:10,display:'flex',gap:16,flexWrap:'wrap' }}>
          <span>Resistance: <span style={{ color:'#60a5fa' }}>{chain.metrics.callWalls.join(', ')}</span></span>
          <span>Support: <span style={{ color:'#f87171' }}>{chain.metrics.putWalls?.join(', ')}</span></span>
          {chain.metrics?.unusualVolContracts > 0 && <span style={{ color:'#f59e0b' }}>⚡ {chain.metrics.unusualVolContracts} unusual vol</span>}
        </div>
      )}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:600 }}>
          <thead>
            <tr>
              <th colSpan={5} style={{ padding:'4px 8px',textAlign:'center',background:'rgba(37,99,235,0.12)',color:'#60a5fa',borderBottom:'1px solid #1e2d3d',fontSize:10 }}>CALLS</th>
              <th style={{ padding:'4px 10px',textAlign:'center',background:'#0a0f1a',color:'#e2e8f0',fontWeight:700,borderBottom:'1px solid #1e2d3d',minWidth:60 }}>STRIKE</th>
              <th colSpan={5} style={{ padding:'4px 8px',textAlign:'center',background:'rgba(239,68,68,0.10)',color:'#f87171',borderBottom:'1px solid #1e2d3d',fontSize:10 }}>PUTS</th>
            </tr>
            <tr style={{ color:'#4a5c7a',fontSize:10 }}>
              {['Bid','Ask','IV%','Δ','OI'].map(h=><th key={'c'+h} style={{ padding:'3px 6px',textAlign:'right',borderBottom:'1px solid #0d1520' }}>{h}</th>)}
              <th style={{ borderBottom:'1px solid #0d1520',background:'#141b24' }}/>
              {['OI','Δ','IV%','Ask','Bid'].map(h=><th key={'p'+h} style={{ padding:'3px 6px',textAlign:'left',borderBottom:'1px solid #0d1520' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {calls.map((c, i) => {
              const pt = puts[i] || {}
              const isAtm = Math.abs(i - atmIdx) <= 1
              const cSel = String(selectedStrike) === String(c.strike) && selectedType === 'call'
              const pSel = String(selectedStrike) === String(c.strike) && selectedType === 'put'
              return (
                <tr key={c.strike} style={{ background:isAtm?'rgba(37,99,235,0.05)':i%2===0?'transparent':'rgba(255,255,255,0.01)' }}>
                  {[c.bid,c.ask,c.iv+'%',c.delta?.toFixed(2),(c.openInterest||0).toLocaleString()].map((v,j)=>(
                    <td key={j} style={{ padding:'5px 6px',textAlign:'right',color:c.inTheMoney?'#60a5fa':'#4a5c7a' }}>{v||'—'}</td>
                  ))}
                  <td onClick={()=>onSelect(String(c.strike), cSel?'put':'call')}
                    style={{ padding:'4px 8px',textAlign:'center',background:cSel?'#1d4ed8':pSel?'#7f1d1d':isAtm?'#1e2d3d':'#0a0f1a',cursor:'pointer',fontWeight:700,color:cSel||pSel?'white':isAtm?'#e2e8f0':'#8b9fc0',fontSize:12,border:'1px solid #1e2d3d',userSelect:'none' }}>
                    {c.strike}
                  </td>
                  {[(pt.openInterest||0).toLocaleString(),pt.delta?.toFixed(2),pt.iv+'%',pt.ask,pt.bid].map((v,j)=>(
                    <td key={j} style={{ padding:'5px 6px',textAlign:'left',color:pt.inTheMoney?'#f87171':'#4a5c7a' }}>{v||'—'}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop:6,color:'#4a5c7a',fontSize:9 }}>Click strike to select. ITM highlighted. {chain.greeksNote}</div>
    </div>
  )
}

// ── Add Position Modal ─────────────────────────────────────────────────────────
function AddModal({ onSave, onClose }) {
  const blank = { ticker:'',assetType:'Stock',strategy:'Swing Trade',direction:'Long',quantity:'',entryPrice:'',entryDate:new Date().toISOString().split('T')[0],notes:'',expiration:'',strike:'',optionType:'call',contracts:'1',underlyingPrice:'' }
  const [f, setF] = useState(blank)
  const [ladder, setLadder] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setF(p=>({...p,[k]:v}))
  const isOpts = f.assetType === 'Options'
  const totalCost = isOpts && f.contracts && f.entryPrice
    ? (parseFloat(f.contracts)*parseFloat(f.entryPrice)*100).toFixed(2)
    : f.quantity && f.entryPrice ? (parseFloat(f.quantity)*parseFloat(f.entryPrice)).toFixed(2) : null

  async function doSave() {
    if (!f.ticker || !f.entryPrice) return
    setSaving(true)
    await onSave({ ...f, status:'open' })
    onClose()
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'24px 16px',overflowY:'auto' }}>
      <div style={{ background:'#0a0f1a',border:'1px solid #2d3f55',borderRadius:16,padding:28,width:'100%',maxWidth:880 }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22 }}>
          <h2 style={{ color:'#e2e8f0',margin:0,fontSize:18 }}>Add Position</h2>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:22 }}>&times;</button>
        </div>
        <div style={{ ...S.g3,marginBottom:16 }}>
          <div><label style={S.lbl}>Ticker</label><TickerInput value={f.ticker} onChange={v=>set('ticker',v)} onSelect={v=>set('ticker',v)} /></div>
          <div><label style={S.lbl}>Asset Type</label><select style={S.sel} value={f.assetType} onChange={e=>set('assetType',e.target.value)}>{ASSET_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label style={S.lbl}>Strategy</label><select style={S.sel} value={f.strategy} onChange={e=>set('strategy',e.target.value)}>{STRATEGIES.map(s=><option key={s}>{s}</option>)}</select></div>
        </div>
        {isOpts ? (
          <div style={{ background:'rgba(37,99,235,0.07)',border:'1px solid rgba(37,99,235,0.2)',borderRadius:12,padding:18,marginBottom:16 }}>
            <div style={{ color:'#93c5fd',fontSize:13,fontWeight:600,marginBottom:14 }}>📈 Options Configuration</div>
            <div style={{ ...S.g4,marginBottom:14 }}>
              <div><label style={S.lbl}>Expiration</label><select style={S.sel} value={f.expiration} onChange={e=>set('expiration',e.target.value)}><option value="">Select...</option>{getExpirations().map(e=><option key={e} value={e}>{e}</option>)}</select></div>
              <div><label style={S.lbl}>Underlying Price</label><input style={S.inp} type="number" value={f.underlyingPrice} onChange={e=>set('underlyingPrice',e.target.value)} placeholder="185.50" /></div>
              <div><label style={S.lbl}>Strike</label><input style={S.inp} value={f.strike} onChange={e=>set('strike',e.target.value)} placeholder="From chain" /></div>
              <div><label style={S.lbl}>Call / Put</label><select style={S.sel} value={f.optionType} onChange={e=>set('optionType',e.target.value)}><option value="call">Call</option><option value="put">Put</option></select></div>
            </div>
            <div style={S.g4}>
              <div><label style={S.lbl}>Contracts</label><input style={S.inp} type="number" min="1" value={f.contracts} onChange={e=>set('contracts',e.target.value)} /></div>
              <div><label style={S.lbl}>Cost / Contract ($)</label><input style={S.inp} type="number" step="0.01" value={f.entryPrice} onChange={e=>set('entryPrice',e.target.value)} placeholder="2.45" /></div>
              <div><label style={S.lbl}>Total Cost</label><input style={{ ...S.inp,background:'#0d1117',color:'#60a5fa',cursor:'default' }} readOnly value={totalCost?'$'+parseFloat(totalCost).toLocaleString():'—'} /></div>
              <div><label style={S.lbl}>Entry Date</label><input style={S.inp} type="date" value={f.entryDate} onChange={e=>set('entryDate',e.target.value)} /></div>
            </div>
            <div style={{ marginTop:14,display:'flex',gap:10,alignItems:'center' }}>
              <button onClick={()=>setLadder(v=>!v)} style={{ ...S.btn('rgba(37,99,235,0.2)','#93c5fd'),fontSize:11,padding:'7px 14px' }}>
                {ladder?'Hide':'Load'} Live Chain
              </button>
              {f.strike && <span style={{ color:'#60a5fa',fontSize:11 }}>{f.ticker||'?'} ${f.strike} {f.optionType?.toUpperCase()} {f.expiration}</span>}
            </div>
            {ladder && <OptionsLadder ticker={f.ticker} expiration={f.expiration} selectedStrike={f.strike} selectedType={f.optionType} onPriceUpdate={p=>set('underlyingPrice',p)} onSelect={(s,t)=>{ set('strike',s); set('optionType',t) }} />}
          </div>
        ) : (
          <div style={{ ...S.g4,marginBottom:16 }}>
            <div><label style={S.lbl}>Direction</label><select style={S.sel} value={f.direction} onChange={e=>set('direction',e.target.value)}><option>Long</option><option>Short</option></select></div>
            <div><label style={S.lbl}>Shares</label><input style={S.inp} type="number" value={f.quantity} onChange={e=>set('quantity',e.target.value)} placeholder="100" /></div>
            <div><label style={S.lbl}>Entry Price ($)</label><input style={S.inp} type="number" step="0.01" value={f.entryPrice} onChange={e=>set('entryPrice',e.target.value)} placeholder="185.50" /></div>
            <div><label style={S.lbl}>Entry Date</label><input style={S.inp} type="date" value={f.entryDate} onChange={e=>set('entryDate',e.target.value)} /></div>
          </div>
        )}
        <div style={{ marginBottom:20 }}>
          <label style={S.lbl}>Trade Thesis</label>
          <textarea style={{ ...S.inp,minHeight:60,resize:'vertical' }} value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Why are you in this? Catalyst, targets, invalidation..." />
        </div>
        <div style={{ display:'flex',gap:10,justifyContent:'flex-end',borderTop:'1px solid #1e2d3d',paddingTop:16 }}>
          <button onClick={onClose} style={S.btn('#1e2d3d','#8b9fc0')}>Cancel</button>
          <button onClick={doSave} disabled={!f.ticker||!f.entryPrice||saving} style={{ ...S.btn(),opacity:!f.ticker||!f.entryPrice||saving?0.5:1 }}>
            {saving?'Saving...':'Add Position'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Panel ───────────────────────────────────────────────────────────────────
function AIPanel({ pos, onClose }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!pos) return
    const isOpts = pos.assetType === 'Options'
    const prompt = `You are an experienced institutional trading coach.

POSITION: ${pos.ticker} (${pos.assetType})
${isOpts?`Strike: $${pos.strike} | Exp: ${pos.expiration} | ${pos.optionType?.toUpperCase()} | ${pos.contracts} contracts @ $${pos.entryPrice}/contract`:`${pos.direction||'Long'} ${pos.quantity} shares @ $${pos.entryPrice}`}
Strategy: ${pos.strategy} | Entry: ${pos.entryDate}
Thesis: ${pos.notes||'Not provided'}

Analyze in 5 sections:
**POSITION STRUCTURE** — sizing, risk/reward, structure quality
**MARKET CONTEXT** — macro/sector factors relevant right now
**RISK FACTORS** — top 3 specific risks, exact invalidation scenarios
**KEY LEVELS** — 2-3 specific price levels that matter for this trade
**STRATEGY ALIGNMENT** — does execution match stated strategy?

No buy/sell signals. Educational, risk-aware. Be specific to ${pos.ticker}.`

    fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1200, messages:[{role:'user',content:prompt}] })
    }).then(r=>r.json()).then(d=>{ setText(d.content?.[0]?.text||'Analysis unavailable.'); setLoading(false) })
      .catch(()=>{ setText('Analysis service unavailable.'); setLoading(false) })
  }, [pos])

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
      <div style={{ background:'#0a0f1a',border:'1px solid #2d3f55',borderRadius:16,padding:28,width:'100%',maxWidth:700,maxHeight:'82vh',overflow:'auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16 }}>
          <div>
            <div style={{ color:'#a78bfa',fontSize:15,fontWeight:700 }}>🤖 AI Position Analysis</div>
            <div style={{ color:'#4a5c7a',fontSize:11,marginTop:3 }}>{pos?.ticker} {pos?.assetType==='Options'?`$${pos?.strike} ${pos?.optionType?.toUpperCase()} ${pos?.expiration}`:''} · {pos?.strategy}</div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:20 }}>&times;</button>
        </div>
        {loading ? (
          <div style={{ color:'#4a5c7a',fontSize:13,padding:'24px 0',textAlign:'center' }}>
            <div style={{ fontSize:26,marginBottom:10,animation:'spin 1.2s linear infinite',display:'inline-block' }}>⚡</div>
            <div>Analyzing...</div>
          </div>
        ) : (
          <div style={{ color:'#c4d4e8',fontSize:13,lineHeight:1.78 }}>
            {text.split('\n').map((line,i) => {
              const isH = /^\*\*[A-Z]/.test(line.trim())
              const clean = line.replace(/\*\*/g,'')
              return isH
                ? <div key={i} style={{ color:'#93c5fd',fontWeight:700,marginTop:i>0?16:0,marginBottom:5,fontSize:11,textTransform:'uppercase',letterSpacing:'0.04em' }}>{clean}</div>
                : <div key={i} style={{ marginBottom:clean.trim()?3:8 }}>{clean}</div>
            })}
          </div>
        )}
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}

// ── Position Card ──────────────────────────────────────────────────────────────
function PCard({ pos, liveQuote, onClose, onAI }) {
  const isOpts  = pos.assetType === 'Options'
  const entry   = parseFloat(pos.entryPrice || 0)
  const qty     = isOpts ? parseFloat(pos.contracts||0)*100 : parseFloat(pos.quantity||0)
  const dir     = pos.direction === 'Short' ? -1 : 1
  const live    = liveQuote?.effectivePrice ?? liveQuote?.price
  const hasLive = !!live && live > 0 && pos.status !== 'closed'
  const pnl     = hasLive ? (live - entry) * dir * qty : 0
  const pnlPct  = entry > 0 && qty > 0 ? (pnl / (entry * qty)) * 100 : 0
  const up      = pnl >= 0
  const sc      = { 'Day Trade':'#f59e0b','Swing Trade':'#10b981','Position Trade':'#3b82f6','Options Play':'#8b5cf6','Long-Term':'#06b6d4','Hedging':'#64748b' }[pos.strategy]||'#4a5c7a'
  const isClosed= pos.status === 'closed'
  const sessLabel = { regular:'', premarket:' · pre-mkt', afterhours:' · after hrs', closed:'' }[liveQuote?.session] || ''

  return (
    <div style={{ background:isClosed?'#080c14':'#0d1117',border:'1px solid #1e2d3d',borderLeft:`3px solid ${isClosed?'#1e2d3d':hasLive?(up?'#10b981':'#ef4444'):'#2563eb'}`,borderRadius:12,padding:18 }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10 }}>
        <div>
          <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:5 }}>
            <span style={{ color:'#e2e8f0',fontSize:16,fontWeight:700 }}>{pos.ticker}</span>
            {isOpts && <span style={{ color:'#8b5cf6',fontSize:11,fontWeight:600,background:'rgba(139,92,246,0.15)',padding:'2px 8px',borderRadius:4 }}>{pos.optionType?.toUpperCase()} ${pos.strike} · {pos.expiration}</span>}
            <span style={{ display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:10,fontWeight:700,color:sc,background:sc+'22',border:'1px solid '+sc+'44' }}>{pos.strategy}</span>
            {isClosed && <span style={{ color:'#4a5c7a',fontSize:10 }}>CLOSED</span>}
          </div>
          <div style={{ color:'#4a5c7a',fontSize:11 }}>
            {pos.direction||'Long'} · {isOpts?`${pos.contracts} contracts`:`${pos.quantity} shares`} · in @ ${entry.toFixed(2)} · {pos.entryDate}
          </div>
        </div>
        {!isClosed && (
          <div style={{ textAlign:'right' }}>
            {hasLive ? (
              <>
                <div style={{ color:'#60a5fa',fontSize:14,fontWeight:700 }}>${live.toFixed(2)}<span style={{ color:'#4a5c7a',fontSize:9,marginLeft:4 }}>{sessLabel}</span></div>
                <div style={{ color:up?'#10b981':'#ef4444',fontSize:13,fontWeight:700 }}>{up?'+':''}{pnl.toFixed(2)} ({up?'+':''}{pnlPct.toFixed(2)}%)</div>
              </>
            ) : (
              <div style={{ color:'#4a5c7a',fontSize:11 }}>fetching...</div>
            )}
          </div>
        )}
      </div>
      {pos.notes && <div style={{ color:'#4a5c7a',fontSize:11,marginBottom:10,borderTop:'1px solid #1e2d3d',paddingTop:8,fontStyle:'italic',lineHeight:1.5 }}>{pos.notes}</div>}
      <div style={{ display:'flex',gap:8 }}>
        <button onClick={()=>onAI(pos)} style={{ ...S.btn('rgba(139,92,246,0.2)','#a78bfa'),fontSize:11,padding:'6px 14px' }}>🤖 AI Analysis</button>
        {!isClosed && <button onClick={()=>onClose(pos)} style={{ ...S.btn('rgba(239,68,68,0.12)','#f87171'),fontSize:11,padding:'6px 14px' }}>Close</button>}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Portfolio() {
  const { user } = useAuth()
  const [positions,   setPositions]   = useState([])
  const [liveQuotes,  setLiveQuotes]  = useState({})
  const [showAdd,     setShowAdd]     = useState(false)
  const [aiPos,       setAiPos]       = useState(null)
  const [filter,      setFilter]      = useState('All')
  const [dbLoading,   setDbLoading]   = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const refreshRef = useRef(null)

  // Load from Supabase
  useEffect(() => {
    if (!user) return
    loadPositions()
  }, [user])

  async function loadPositions() {
    try {
      const { data, error } = await supabase
        .from('portfolio_positions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setPositions((data || []).map(rowToPos))
    } catch(e) {
      console.error('Portfolio load error:', e)
      // Fallback to localStorage
      try {
        const d = localStorage.getItem('aai_port_' + user.id)
        if (d) setPositions(JSON.parse(d))
      } catch(e2) {}
    } finally {
      setDbLoading(false)
    }
  }

  async function addPosition(formData) {
    const optimisticId = 'tmp_' + Date.now()
    const optimistic = { ...formData, id: optimisticId, createdAt: new Date().toISOString() }
    setPositions(prev => [optimistic, ...prev])
    try {
      const { data, error } = await supabase
        .from('portfolio_positions')
        .insert([posToRow(formData, user.id)])
        .select().single()
      if (error) throw error
      setPositions(prev => prev.map(p => p.id === optimisticId ? rowToPos(data) : p))
    } catch(e) {
      console.error('Portfolio insert error:', e)
      // Keep optimistic update — don't lose the position
    }
  }

  async function closePosition(pos) {
    setPositions(prev => prev.map(p => p.id === pos.id ? { ...p, status:'closed', closedAt:new Date().toISOString() } : p))
    try {
      await supabase.from('portfolio_positions')
        .update({ status:'closed', closed_at: new Date().toISOString() })
        .eq('id', pos.id)
    } catch(e) { console.error('Close position error:', e) }
  }

  // Fetch live prices — and auto-refresh every 30s
  const fetchPrices = useCallback(async (posArr) => {
    const open = posArr.filter(p => p.status !== 'closed')
    if (!open.length) return
    const tickers = [...new Set(open.map(p => p.ticker))].join(',')
    try {
      const r = await fetch(`/api/quotes?symbols=${tickers}`)
      if (!r.ok) return
      const data = await r.json()
      if (Array.isArray(data)) {
        const map = {}
        data.forEach(q => { map[q.symbol] = q })
        setLiveQuotes(map)
        setLastRefresh(new Date())
      }
    } catch(e) {}
  }, [])

  useEffect(() => {
    if (positions.length > 0) {
      fetchPrices(positions)
      refreshRef.current = setInterval(() => fetchPrices(positions), 30000)
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [positions, fetchPrices])

  const open   = positions.filter(p => p.status !== 'closed')
  const closed = positions.filter(p => p.status === 'closed')
  const shown  = filter==='All' ? open : open.filter(p => p.strategy===filter)

  // Aggregate P&L
  const totalPnl = open.reduce((sum, p) => {
    const q = liveQuotes[p.ticker]
    if (!q) return sum
    const entry = parseFloat(p.entryPrice||0)
    const cur   = q.effectivePrice ?? q.price ?? 0
    const qty   = p.assetType==='Options' ? parseFloat(p.contracts||0)*100 : parseFloat(p.quantity||0)
    const dir   = p.direction==='Short' ? -1 : 1
    return sum + (cur - entry)*dir*qty
  }, 0)

  const totalExposure = open.reduce((sum, p) => {
    const qty = p.assetType==='Options' ? parseFloat(p.contracts||0)*100 : parseFloat(p.quantity||0)
    return sum + qty*parseFloat(p.entryPrice||0)
  }, 0)

  const hasPrices = Object.keys(liveQuotes).length > 0

  return (
    <div style={S.page}>
      {showAdd && <AddModal onSave={addPosition} onClose={()=>setShowAdd(false)} />}
      {aiPos   && <AIPanel pos={aiPos} onClose={()=>setAiPos(null)} />}

      {/* Header */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:22 }}>
        <div>
          <h1 style={{ color:'#e2e8f0',fontSize:20,fontWeight:700,margin:'0 0 5px' }}>📊 Portfolio</h1>
          <div style={{ color:'#4a5c7a',fontSize:11,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
            <span>{open.length} open · ${totalExposure.toLocaleString(undefined,{maximumFractionDigits:0})} exposure</span>
            {hasPrices && open.length > 0 && (
              <span style={{ color:totalPnl>=0?'#10b981':'#ef4444',fontWeight:600 }}>
                · P&L: {totalPnl>=0?'+':''}{totalPnl.toFixed(2)}
              </span>
            )}
            {lastRefresh && <span style={{ color:'#1e2d3d' }}>· prices {lastRefresh.toLocaleTimeString()}</span>}
          </div>
        </div>
        <button style={S.btn()} onClick={()=>setShowAdd(true)}>+ Add Position</button>
      </div>

      {/* Strategy filter */}
      <div style={{ display:'flex',gap:8,marginBottom:20,flexWrap:'wrap' }}>
        {['All',...STRATEGIES].map(s => (
          <button key={s} onClick={()=>setFilter(s)}
            style={{ padding:'5px 14px',borderRadius:20,border:'1px solid',fontSize:11,cursor:'pointer',fontFamily:'inherit',
              background:filter===s?'#1e40af':'transparent',color:filter===s?'#93c5fd':'#4a5c7a',borderColor:filter===s?'#1e40af':'#1e2d3d' }}>
            {s}
          </button>
        ))}
      </div>

      {/* Positions grid */}
      {dbLoading ? (
        <div style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:12,padding:'48px 24px',textAlign:'center',color:'#4a5c7a',fontSize:13 }}>
          <div style={{ fontSize:26,marginBottom:10,animation:'spin 1.2s linear infinite',display:'inline-block' }}>⚡</div>
          <div>Loading positions...</div>
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : shown.length === 0 ? (
        <div style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:12,padding:'56px 24px',textAlign:'center' }}>
          <div style={{ fontSize:42,marginBottom:14 }}>📊</div>
          <div style={{ color:'#e2e8f0',fontSize:16,marginBottom:8 }}>No open positions</div>
          <div style={{ color:'#4a5c7a',fontSize:12,marginBottom:22,maxWidth:380,margin:'0 auto 22px' }}>
            Add positions to track live P&L. Synced to your account — available on any device.
          </div>
          <button style={S.btn()} onClick={()=>setShowAdd(true)}>Add First Position</button>
        </div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(420px,1fr))',gap:14 }}>
          {shown.map(p => <PCard key={p.id} pos={p} liveQuote={liveQuotes[p.ticker]} onClose={closePosition} onAI={setAiPos} />)}
        </div>
      )}

      {/* Closed positions */}
      {closed.length > 0 && (
        <div style={{ marginTop:32 }}>
          <div style={{ color:'#4a5c7a',fontSize:11,marginBottom:12,textTransform:'uppercase',letterSpacing:'0.06em' }}>Closed ({closed.length})</div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(420px,1fr))',gap:14,opacity:0.5 }}>
            {closed.map(p => <PCard key={p.id} pos={p} liveQuote={null} onClose={()=>{}} onAI={setAiPos} />)}
          </div>
        </div>
      )}
    </div>
  )
}
