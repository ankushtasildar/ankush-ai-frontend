import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'

const STRATEGIES = ['Day Trade','Swing Trade','Position Trade','Long-Term','Options Play','Hedging']
const ASSET_TYPES = ['Stock','Options','ETF','Crypto','Futures']
const TICKERS = ['AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','AMD','INTC','SPY','QQQ','IWM','DIA','GLD','SLV','TLT','HYG','XLF','XLE','XLK','XLV','XLI','XLB','XLU','XLRE','NFLX','UBER','SNAP','ROKU','SHOP','SQ','PYPL','COIN','BA','CAT','GE','GM','F','HON','JPM','BAC','GS','MS','C','WFC','V','MA','AXP','JNJ','PFE','MRNA','ABBV','LLY','BMY','MRK','AMGN','GILD','XOM','CVX','OXY','COP','SLB','BABA','NIO','XPEV','LI','TSM','UVXY','SPXS','SPXL','TQQQ','SQQQ','UPRO','TNA','TZA','SOFI','HOOD','PLTR','RBLX','DKNG','PENN','ARKK','ARKG','ARKF','SMH','SOXX','MSTR','RIOT','MARA','WMT','TGT','COST','HD','DIS','CMCSA','T','VZ','ZM','CRM','NOW','ADBE','ORCL','INTU','SMCI','ARM','AVGO','QCOM','MRVL','LRCX','AMAT','KLAC','BRK.B','GOOG','VIX','SVXY','PLTR','RIVN','LCID','JOBY','ARCHER','ACHR','CELH','HIMS','KVUE','ARM','AEHR','COHU']

function getExpirations() {
  const exps = [], now = new Date()
  for (let i = 1; i <= 52 && exps.length < 16; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i * 7)
    const day = d.getDay()
    d.setDate(d.getDate() + ((5 - day + 7) % 7))
    exps.push(d.toISOString().split('T')[0])
  }
  return exps
}

function getStrikes(rawPrice) {
  const p = parseFloat(rawPrice)
  if (!p || isNaN(p)) return []
  const step = p < 15 ? 0.5 : p < 30 ? 1 : p < 75 ? 2.5 : p < 150 ? 5 : p < 400 ? 10 : p < 900 ? 25 : 50
  const arr = []
  for (let i = -10; i <= 10; i++) {
    arr.push(+(Math.round((p + i * step) / step) * step).toFixed(step < 1 ? 1 : 0))
  }
  return [...new Set(arr)].sort((a,b) => a - b)
}

const S = {
  page: { padding: 24, fontFamily: '"DM Mono",monospace', minHeight: '100vh', color: '#e2e8f0' },
  hdr: { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 },
  h1: { color:'#e2e8f0',fontSize:20,fontWeight:700,margin:0 },
  sub: { color:'#4a5c7a',fontSize:11,marginTop:4 },
  btn: (bg='#2563eb',c='white') => ({ padding:'9px 18px',borderRadius:8,border:'none',fontSize:12,cursor:'pointer',fontFamily:'inherit',background:bg,color:c,fontWeight:600 }),
  card: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:12,padding:20,marginBottom:16 },
  lbl: { color:'#4a5c7a',fontSize:10,marginBottom:5,display:'block',textTransform:'uppercase',letterSpacing:'0.06em' },
  inp: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:8,padding:'10px 12px',color:'#e2e8f0',fontSize:13,fontFamily:'inherit',width:'100%',outline:'none',boxSizing:'border-box' },
  sel: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:8,padding:'10px 12px',color:'#e2e8f0',fontSize:13,fontFamily:'inherit',width:'100%',outline:'none',cursor:'pointer' },
  g3: { display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14 },
  g4: { display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14 },
}

function TickerInput({ value, onChange, onSelect }) {
  const [open, setOpen] = useState(false)
  const [sugg, setSugg] = useState([])
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const handle = v => {
    onChange(v)
    const q = v.toUpperCase()
    if (q.length >= 1) { const s = TICKERS.filter(t => t.startsWith(q)).slice(0,8); setSugg(s); setOpen(s.length > 0) }
    else setOpen(false)
  }
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <input style={{ ...S.inp, textTransform:'uppercase' }} value={value} onChange={e => handle(e.target.value)} placeholder="AAPL, TSLA, SPY..." onFocus={() => sugg.length && setOpen(true)} />
      {open && (
        <div style={{ position:'absolute',top:'105%',left:0,right:0,background:'#141b24',border:'1px solid #2d3f55',borderRadius:8,zIndex:300,boxShadow:'0 10px 40px rgba(0,0,0,0.7)' }}>
          {sugg.map(s => (
            <div key={s} onMouseDown={()=>{ onSelect(s); setOpen(false) }}
              style={{ padding:'10px 14px',cursor:'pointer',fontSize:13,color:'#93c5fd',borderBottom:'1px solid #1e2d3d' }}
              onMouseEnter={e=>e.currentTarget.style.background='#1e2d3d'}
              onMouseLeave={e=>e.currentTarget.style.background=''}>{s}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function OptionsLadder({ ticker, expiration, selectedStrike, selectedType, onSelect, underlyingPrice }) {
  const p = parseFloat(underlyingPrice)
  const strikes = getStrikes(underlyingPrice)
  const atmIdx = strikes.findIndex(s => s >= p)

  function mock(strike, type) {
    const s = parseFloat(strike)
    const diff = Math.abs(s - p) / (p || 1)
    const itm = type === 'call' ? s < p : s > p
    const base = Math.max(0.05, (itm ? Math.abs(s-p)*0.4+1.2 : 1.2) * Math.exp(-diff * 2.8))
    return {
      bid: +(base * 0.93).toFixed(2),
      ask: +(base * 1.07).toFixed(2),
      mid: +base.toFixed(2),
      iv: Math.round(18 + diff * 55 + Math.random() * 12),
      delta: +(type==='call' ? Math.max(0.04,0.52-diff*2.8) : Math.min(-0.04,-0.52+diff*2.8)).toFixed(2),
      oi: Math.round(50 + Math.random() * 9000),
      itm,
    }
  }
  if (!strikes.length) return <div style={{ color:'#4a5c7a',fontSize:12,marginTop:12 }}>Enter underlying price to view options chain.</div>
  return (
    <div style={{ marginTop:16,overflowX:'auto' }}>
      <div style={{ color:'#93c5fd',fontSize:12,marginBottom:10,fontWeight:600 }}>
        Options Chain — {ticker || '?'} {expiration && <span style={{color:'#4a5c7a'}}>exp {expiration}</span>} {underlyingPrice && <span style={{color:'#4a5c7a',marginLeft:8}}>@ ${underlyingPrice}</span>}
      </div>
      <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:600 }}>
        <thead>
          <tr>
            <th colSpan={4} style={{ padding:'5px 8px',textAlign:'center',background:'rgba(37,99,235,0.12)',color:'#60a5fa',borderBottom:'1px solid #1e2d3d' }}>CALLS</th>
            <th style={{ padding:'5px 10px',textAlign:'center',background:'#0a0f1a',color:'#e2e8f0',fontWeight:700,borderBottom:'1px solid #1e2d3d',minWidth:60 }}>STRIKE</th>
            <th colSpan={4} style={{ padding:'5px 8px',textAlign:'center',background:'rgba(239,68,68,0.10)',color:'#f87171',borderBottom:'1px solid #1e2d3d' }}>PUTS</th>
          </tr>
          <tr style={{ color:'#4a5c7a',fontSize:10 }}>
            {['Bid','Ask','Mid','IV%'].map(h => <th key={'c'+h} style={{ padding:'4px 6px',textAlign:'right',borderBottom:'1px solid #0d1520' }}>{h}</th>)}
            <th style={{ padding:'4px 8px',textAlign:'center',background:'#141b24',borderBottom:'1px solid #0d1520' }} />
            {['IV%','Mid','Ask','Bid'].map(h => <th key={'p'+h} style={{ padding:'4px 6px',textAlign:'left',borderBottom:'1px solid #0d1520' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {strikes.map((strike, i) => {
            const c = mock(strike, 'call')
            const pt = mock(strike, 'put')
            const isAtm = i === atmIdx - 1 || i === atmIdx
            const cSel = String(selectedStrike) === String(strike) && selectedType === 'call'
            const pSel = String(selectedStrike) === String(strike) && selectedType === 'put'
            return (
              <tr key={strike} style={{ background: isAtm ? 'rgba(37,99,235,0.06)' : i%2===0?'transparent':'rgba(255,255,255,0.01)' }}>
                {[c.bid,c.ask,c.mid,c.iv+'%'].map((v,j) => (
                  <td key={j} style={{ padding:'5px 6px',textAlign:'right',color:c.itm?'#60a5fa':'#4a5c7a' }}>{v}</td>
                ))}
                <td onClick={() => onSelect(String(strike), cSel ? 'put' : 'call')}
                  style={{ padding:'5px 10px',textAlign:'center',background:cSel?'#2563eb':pSel?'#991b1b':isAtm?'#1e2d3d':'#0a0f1a',cursor:'pointer',fontWeight:700,color:cSel||pSel?'white':isAtm?'#e2e8f0':'#8b9fc0',fontSize:12,border:'1px solid #1e2d3d',userSelect:'none',transition:'background 0.1s' }}>
                  {strike}
                </td>
                {[pt.iv+'%',pt.mid,pt.ask,pt.bid].map((v,j) => (
                  <td key={j} style={{ padding:'5px 6px',textAlign:'left',color:pt.itm?'#f87171':'#4a5c7a' }}>{v}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ marginTop:8,color:'#4a5c7a',fontSize:10 }}>Click a strike to select. ITM highlighted. Prices are illustrative only.</div>
    </div>
  )
}

function AddModal({ onSave, onClose }) {
  const blank = { ticker:'',assetType:'Stock',strategy:'Swing Trade',direction:'Long',quantity:'',entryPrice:'',entryDate:new Date().toISOString().split('T')[0],notes:'',expiration:'',strike:'',optionType:'call',contracts:'1',underlyingPrice:'' }
  const [f, setF] = useState(blank)
  const [ladder, setLadder] = useState(false)
  const set = (k,v) => setF(p => ({ ...p, [k]:v }))
  const isOpts = f.assetType === 'Options'
  const totalCost = isOpts && f.contracts && f.entryPrice
    ? (parseFloat(f.contracts) * parseFloat(f.entryPrice) * 100).toFixed(2)
    : f.quantity && f.entryPrice
    ? (parseFloat(f.quantity) * parseFloat(f.entryPrice)).toFixed(2)
    : null
  const canSave = f.ticker && f.entryPrice && (isOpts ? f.contracts : f.quantity)
  function doSave() {
    if (!canSave) return
    onSave({ ...f, id: Date.now().toString(), status:'open', createdAt: new Date().toISOString() })
    onClose()
  }
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'24px 16px',overflowY:'auto' }}>
      <div style={{ background:'#0a0f1a',border:'1px solid #2d3f55',borderRadius:16,padding:28,width:'100%',maxWidth:860,boxShadow:'0 20px 60px rgba(0,0,0,0.8)' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
          <h2 style={{ color:'#e2e8f0',margin:0,fontSize:18 }}>Add Position</h2>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:22 }}>&times;</button>
        </div>

        <div style={{ ...S.g3, marginBottom:16 }}>
          <div><label style={S.lbl}>Ticker Symbol</label><TickerInput value={f.ticker} onChange={v=>set('ticker',v)} onSelect={v=>set('ticker',v)} /></div>
          <div><label style={S.lbl}>Asset Type</label><select style={S.sel} value={f.assetType} onChange={e=>set('assetType',e.target.value)}>{ASSET_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label style={S.lbl}>Trading Strategy</label><select style={S.sel} value={f.strategy} onChange={e=>set('strategy',e.target.value)}>{STRATEGIES.map(s=><option key={s}>{s}</option>)}</select></div>
        </div>

        {isOpts ? (
          <div style={{ background:'rgba(37,99,235,0.07)',border:'1px solid rgba(37,99,235,0.22)',borderRadius:12,padding:18,marginBottom:16 }}>
            <div style={{ color:'#93c5fd',fontSize:13,fontWeight:600,marginBottom:14,display:'flex',alignItems:'center',gap:8 }}>
              <span>&#x1F4C8;</span> Options Configuration
            </div>
            <div style={{ ...S.g4, marginBottom:14 }}>
              <div>
                <label style={S.lbl}>Expiration Date</label>
                <select style={S.sel} value={f.expiration} onChange={e=>set('expiration',e.target.value)}>
                  <option value="">Select exp.</option>
                  {getExpirations().map(e=><option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label style={S.lbl}>Underlying Price ($)</label>
                <input style={S.inp} type="number" value={f.underlyingPrice} onChange={e=>set('underlyingPrice',e.target.value)} placeholder="185.50" />
              </div>
              <div>
                <label style={S.lbl}>Strike Price</label>
                <select style={S.sel} value={f.strike} onChange={e=>set('strike',e.target.value)}>
                  <option value="">Select strike</option>
                  {getStrikes(f.underlyingPrice).map(s=><option key={s} value={String(s)}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={S.lbl}>Call / Put</label>
                <select style={S.sel} value={f.optionType} onChange={e=>set('optionType',e.target.value)}>
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
              </div>
            </div>
            <div style={{ ...S.g4 }}>
              <div>
                <label style={S.lbl}>Contracts</label>
                <input style={S.inp} type="number" min="1" value={f.contracts} onChange={e=>set('contracts',e.target.value)} />
              </div>
              <div>
                <label style={S.lbl}>Avg Cost / Contract ($)</label>
                <input style={S.inp} type="number" step="0.01" value={f.entryPrice} onChange={e=>set('entryPrice',e.target.value)} placeholder="2.45" />
              </div>
              <div>
                <label style={S.lbl}>Total Investment</label>
                <input style={{ ...S.inp, background:'#0d1117', color:'#60a5fa', cursor:'default' }} readOnly value={totalCost ? '$' + parseFloat(totalCost).toLocaleString() : '\u2014'} />
              </div>
              <div>
                <label style={S.lbl}>Entry Date</label>
                <input style={S.inp} type="date" value={f.entryDate} onChange={e=>set('entryDate',e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop:14,display:'flex',gap:10,alignItems:'center' }}>
              <button onClick={()=>setLadder(v=>!v)} style={{ ...S.btn('rgba(37,99,235,0.2)','#93c5fd'),fontSize:11,padding:'7px 14px' }}>
                {ladder ? 'Hide' : 'Show'} Options Chain
              </button>
              {f.strike && (
                <span style={{ color:'#60a5fa',fontSize:11 }}>
                  Selected: {f.ticker||'?'} ${f.strike} {f.optionType?.toUpperCase()} {f.expiration}
                </span>
              )}
            </div>
            {ladder && (
              <OptionsLadder
                ticker={f.ticker} expiration={f.expiration}
                selectedStrike={f.strike} selectedType={f.optionType}
                underlyingPrice={f.underlyingPrice}
                onSelect={(s,t) => { set('strike',s); set('optionType',t) }}
              />
            )}
          </div>
        ) : (
          <div style={{ ...S.g4, marginBottom:16 }}>
            <div><label style={S.lbl}>Direction</label><select style={S.sel} value={f.direction} onChange={e=>set('direction',e.target.value)}><option>Long</option><option>Short</option></select></div>
            <div><label style={S.lbl}>Shares / Units</label><input style={S.inp} type="number" value={f.quantity} onChange={e=>set('quantity',e.target.value)} placeholder="100" /></div>
            <div><label style={S.lbl}>Entry Price ($)</label><input style={S.inp} type="number" step="0.01" value={f.entryPrice} onChange={e=>set('entryPrice',e.target.value)} placeholder="185.50" /></div>
            <div><label style={S.lbl}>Entry Date</label><input style={S.inp} type="date" value={f.entryDate} onChange={e=>set('entryDate',e.target.value)} /></div>
          </div>
        )}
        {totalCost && !isOpts && (
          <div style={{ color:'#4a5c7a',fontSize:11,marginBottom:14 }}>
            Total exposure: <span style={{ color:'#60a5fa',fontWeight:600 }}>${parseFloat(totalCost).toLocaleString()}</span>
          </div>
        )}

        <div style={{ marginBottom:20 }}>
          <label style={S.lbl}>Trade Thesis / Notes</label>
          <textarea style={{ ...S.inp, minHeight:72, resize:'vertical' }}
            value={f.notes} onChange={e=>set('notes',e.target.value)}
            placeholder="Why are you in this position? Key catalyst, target, invalidation level..." />
        </div>

        <div style={{ display:'flex',gap:10,justifyContent:'flex-end',borderTop:'1px solid #1e2d3d',paddingTop:18 }}>
          <button onClick={onClose} style={S.btn('#1e2d3d','#8b9fc0')}>Cancel</button>
          <button onClick={doSave} disabled={!canSave} style={{ ...S.btn(!canSave?'#1e2d3d':'#2563eb'), opacity: canSave ? 1 : 0.5 }}>Add Position</button>
        </div>
      </div>
    </div>
  )
}

function AIPanel({ pos, onClose }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!pos) return
    const isOpts = pos.assetType === 'Options'
    const details = isOpts
      ? `Strike: $${pos.strike} | Exp: ${pos.expiration} | ${pos.optionType?.toUpperCase()} | ${pos.contracts} contracts @ $${pos.entryPrice}/contract`
      : `${pos.direction || 'Long'} ${pos.quantity} shares @ $${pos.entryPrice}`
    const prompt = `You are an experienced institutional trading coach and risk manager.

POSITION DETAILS:
Ticker: ${pos.ticker} (${pos.assetType})
${details}
Strategy: ${pos.strategy}
Entry Date: ${pos.entryDate}
Thesis: ${pos.notes || 'No thesis provided'}

Provide a structured analysis in exactly these 5 sections:

1. POSITION STRUCTURE
Evaluate sizing, risk/reward, and structure quality. For options: assess the strike selection relative to underlying, time value, and contract sizing.

2. MARKET CONTEXT
What macro and sector factors are most relevant to this position right now? What should the trader be monitoring?

3. RISK FACTORS  
What are the 3 most important risks? What market scenarios would invalidate this trade? For options: time decay, IV crush, assignment risk.

4. KEY LEVELS TO WATCH
Identify 2-3 specific price levels (support, resistance, or for options: key strikes, gamma levels) that matter for this trade.

5. STRATEGY ALIGNMENT
Does the position structure match the stated strategy (${pos.strategy})? What adjustments might improve alignment?

Keep each section concise (3-4 sentences). No explicit buy/sell recommendations. Educational, risk-aware tone.`
    fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1200, messages:[{ role:'user', content:prompt }] })
    }).then(r=>r.json())
      .then(d => { setText(d.content?.[0]?.text || 'Analysis unavailable.'); setLoading(false) })
      .catch(() => { setText('Analysis service unavailable. Please try again.'); setLoading(false) })
  }, [pos])

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
      <div style={{ background:'#0a0f1a',border:'1px solid #2d3f55',borderRadius:16,padding:28,width:'100%',maxWidth:700,maxHeight:'82vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.8)' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16 }}>
          <div>
            <div style={{ color:'#a78bfa',fontSize:15,fontWeight:700 }}>&#x1F916; AI Position Analysis</div>
            <div style={{ color:'#4a5c7a',fontSize:11,marginTop:3 }}>
              {pos?.ticker} {pos?.assetType === 'Options' ? `$${pos?.strike} ${pos?.optionType?.toUpperCase()} ${pos?.expiration}` : ''} &bull; {pos?.strategy}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:20,padding:'0 4px' }}>&times;</button>
        </div>
        {loading ? (
          <div style={{ color:'#4a5c7a',fontSize:13,padding:'24px 0',textAlign:'center' }}>
            <div style={{ fontSize:28,marginBottom:12,animation:'spin 1.2s linear infinite',display:'inline-block' }}>&#x26A1;</div>
            <div>Analyzing position...</div>
          </div>
        ) : (
          <div style={{ color:'#c4d4e8',fontSize:13,lineHeight:1.78 }}>
            {text.split('\n').map((line, i) => {
              const isHeader = /^\d+\.\s+[A-Z\s\/]+$/.test(line.trim()) || /^#+\s/.test(line)
              const clean = line.replace(/^#+\s+/, '').replace(/\*\*/g, '')
              return isHeader
                ? <div key={i} style={{ color:'#93c5fd',fontWeight:700,marginTop:i>0?18:0,marginBottom:6,fontSize:12,textTransform:'uppercase',letterSpacing:'0.04em' }}>{clean}</div>
                : <div key={i} style={{ marginBottom: line.trim() ? 4 : 8 }}>{clean}</div>
            })}
          </div>
        )}
        <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

function PCard({ pos, onClose, onAI }) {
  const isOpts = pos.assetType === 'Options'
  const cost = isOpts
    ? parseFloat(pos.contracts) * parseFloat(pos.entryPrice) * 100
    : parseFloat(pos.quantity) * parseFloat(pos.entryPrice)
  const seed = pos.id ? parseInt(pos.id.slice(-4), 10) : 42
  const change = ((seed % 100) - 47) * 0.0018
  const mockCur = (parseFloat(pos.entryPrice) * (1 + change)).toFixed(2)
  const pnl = isOpts
    ? (parseFloat(mockCur) - parseFloat(pos.entryPrice)) * parseFloat(pos.contracts) * 100
    : (parseFloat(mockCur) - parseFloat(pos.entryPrice)) * parseFloat(pos.quantity)
  const pct = cost ? (pnl / cost * 100).toFixed(2) : 0
  const up = pnl >= 0
  const sc = { 'Day Trade':'#f59e0b','Swing Trade':'#10b981','Position Trade':'#3b82f6','Options Play':'#8b5cf6','Long-Term':'#06b6d4','Hedging':'#64748b' }[pos.strategy] || '#4a5c7a'
  const isClosed = pos.status === 'closed'

  return (
    <div style={{ background:isClosed?'#080c14':'#0d1117',border:'1px solid #1e2d3d',borderLeft:`3px solid ${isClosed?'#1e2d3d':up?'#10b981':'#ef4444'}`,borderRadius:12,padding:18 }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10 }}>
        <div>
          <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:5 }}>
            <span style={{ color:'#e2e8f0',fontSize:16,fontWeight:700 }}>{pos.ticker}</span>
            {isOpts && (
              <span style={{ color:'#8b5cf6',fontSize:11,fontWeight:600,background:'rgba(139,92,246,0.15)',padding:'2px 8px',borderRadius:4 }}>
                {pos.optionType?.toUpperCase()} ${pos.strike} &bull; {pos.expiration}
              </span>
            )}
            <span style={{ display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:10,fontWeight:700,color:sc,background:sc+'22',border:'1px solid '+sc+'44' }}>{pos.strategy}</span>
            {isClosed && <span style={{ color:'#4a5c7a',fontSize:10 }}>CLOSED</span>}
          </div>
          <div style={{ color:'#4a5c7a',fontSize:11 }}>
            {pos.direction||'Long'} &bull; {isOpts ? `${pos.contracts} contracts` : `${pos.quantity} shares`} &bull; Entry {pos.entryDate}
          </div>
        </div>
        {!isClosed && (
          <div style={{ textAlign:'right' }}>
            <div style={{ color:up?'#10b981':'#ef4444',fontSize:17,fontWeight:700 }}>
              {up?'+':''}{pnl.toFixed(2)} ({up?'+':''}{pct}%)
            </div>
            <div style={{ color:'#4a5c7a',fontSize:11 }}>@ ${mockCur} &bull; cost ${pos.entryPrice}</div>
          </div>
        )}
      </div>
      {pos.notes && (
        <div style={{ color:'#4a5c7a',fontSize:11,marginBottom:10,borderTop:'1px solid #1e2d3d',paddingTop:8,fontStyle:'italic',lineHeight:1.5 }}>
          {pos.notes}
        </div>
      )}
      <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
        <button onClick={()=>onAI(pos)} style={{ ...S.btn('rgba(139,92,246,0.2)','#a78bfa'),fontSize:11,padding:'6px 14px' }}>
          &#x1F916; AI Analysis
        </button>
        {!isClosed && (
          <button onClick={()=>onClose(pos)} style={{ ...S.btn('rgba(239,68,68,0.12)','#f87171'),fontSize:11,padding:'6px 14px' }}>
            Close Position
          </button>
        )}
      </div>
    </div>
  )
}

export default function Portfolio() {
  const { user } = useAuth()
  const [positions, setPositions] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [aiPos, setAiPos] = useState(null)
  const [filter, setFilter] = useState('All')
  const KEY = 'aai_port_' + (user?.id || 'demo')

  useEffect(() => {
    try { const d = localStorage.getItem(KEY); if (d) setPositions(JSON.parse(d)) } catch(e) {}
  }, [user])

  const persist = p => { setPositions(p); localStorage.setItem(KEY, JSON.stringify(p)) }
  const add = p => persist([...positions, p])
  const closePos = p => persist(positions.map(x => x.id === p.id ? { ...x, status:'closed', closedAt:new Date().toISOString() } : x))

  const open = positions.filter(p => p.status !== 'closed')
  const closed = positions.filter(p => p.status === 'closed')
  const shown = filter === 'All' ? open : open.filter(p => p.strategy === filter)
  const exposure = open.reduce((s,p) => {
    const qty = p.assetType === 'Options' ? parseFloat(p.contracts)*100 : parseFloat(p.quantity||0)
    return s + qty * parseFloat(p.entryPrice||0)
  }, 0)

  return (
    <div style={S.page}>
      {showAdd && <AddModal onSave={add} onClose={()=>setShowAdd(false)} />}
      {aiPos && <AIPanel pos={aiPos} onClose={()=>setAiPos(null)} />}

      <div style={S.hdr}>
        <div>
          <h1 style={S.h1}>&#x1F4BC; Portfolio</h1>
          <div style={S.sub}>{open.length} open positions &bull; ${exposure.toLocaleString(undefined,{maximumFractionDigits:0})} total exposure</div>
        </div>
        <button style={S.btn()} onClick={()=>setShowAdd(true)}>+ Add Position</button>
      </div>

      <div style={{ display:'flex',gap:8,marginBottom:20,flexWrap:'wrap' }}>
        {['All',...STRATEGIES].map(s => (
          <button key={s} onClick={()=>setFilter(s)}
            style={{ padding:'5px 14px',borderRadius:20,border:'1px solid',fontSize:11,cursor:'pointer',fontFamily:'inherit',
              background:filter===s?'#1e40af':'transparent',color:filter===s?'#93c5fd':'#4a5c7a',borderColor:filter===s?'#1e40af':'#1e2d3d' }}>
            {s}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:'56px 24px' }}>
          <div style={{ fontSize:42,marginBottom:14 }}>&#x1F4BC;</div>
          <div style={{ color:'#e2e8f0',fontSize:16,marginBottom:8 }}>No open positions</div>
          <div style={{ color:'#4a5c7a',fontSize:12,marginBottom:22,maxWidth:380,margin:'0 auto 22px' }}>
            Add stocks, ETFs, or options positions. Get instant AI analysis, access the full options chain, and track every trade.
          </div>
          <button style={S.btn()} onClick={()=>setShowAdd(true)}>Add First Position</button>
        </div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(420px,1fr))',gap:14 }}>
          {shown.map(p => <PCard key={p.id} pos={p} onClose={closePos} onAI={setAiPos} />)}
        </div>
      )}

      {closed.length > 0 && (
        <div style={{ marginTop:32 }}>
          <div style={{ color:'#4a5c7a',fontSize:11,marginBottom:12,textTransform:'uppercase',letterSpacing:'0.06em' }}>
            Closed Positions ({closed.length})
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(420px,1fr))',gap:14,opacity:0.5 }}>
            {closed.map(p => <PCard key={p.id} pos={p} onClose={()=>{}} onAI={setAiPos} />)}
          </div>
        </div>
      )}
    </div>
  )
}
