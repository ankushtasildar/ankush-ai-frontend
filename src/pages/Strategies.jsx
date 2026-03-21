import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STRATEGIES = [
  {id:'ema_breakout',name:'EMA Stack Breakout',category:'Momentum',icon:'📈',difficulty:'Intermediate',winRate:'62%',avgRR:'2.8:1',bestIn:'Trending markets, low VIX',avoidIn:'Choppy/sideways, VIX > 25',color:'#10b981',
   setup:['Price above EMA20 > EMA50 > EMA200 (bullish stack)','RSI between 50-65 (not overbought)','Volume surge on breakout day (>1.5x average)','Clean consolidation above prior resistance'],
   entry:'Buy the first retest of EMA20 after breakout. Enter on close above yesterday high.',
   stop:'Below EMA50. Hard stop 1.5% below entry.',
   target:'T1: Previous swing high. T2: 2x ATR extension. Scale out 50% at T1.',
   options:'Buy ATM calls 30-45 DTE. Target 50-100% gain. IV rank < 50 preferred.'},
  {id:'earnings_iv',name:'Pre-Earnings IV Crush',category:'Options',icon:'💥',difficulty:'Advanced',winRate:'58%',avgRR:'2.1:1',bestIn:'High IV rank stocks before earnings',avoidIn:'Low IV rank, unpredictable earnings',color:'#f59e0b',
   setup:['IV Rank > 50 with earnings in 7-14 days','Stock has clear range (no recent breakout)','Historical post-earnings move < current implied move','Check premium buyer vs seller skew'],
   entry:'Sell iron condor 5-7 days before earnings. Strike at ±1σ expected move.',
   stop:'Close if position loses 2x premium collected. Buy back at 200% loss.',
   target:'Close at 50% profit. Never hold through earnings announcement.',
   options:'Iron condor or short strangle. Sell 30 DTE, close 7 DTE or at 50% profit.'},
  {id:'vix_regime',name:'VIX Regime Risk Management',category:'Macro',icon:'⚡',difficulty:'All Levels',winRate:'N/A — Framework',avgRR:'Varies',bestIn:'All market conditions',avoidIn:'Never avoid — always apply',color:'#a78bfa',
   setup:['VIX < 15: Greed — go directional, reduce hedge','VIX 15-20: Neutral — balanced, full size','VIX 20-25: Caution — reduce size 25-50%, add hedges','VIX 25-35: Fear — spreads only, no naked longs, 25% size','VIX > 35: Panic — cash or short gamma only'],
   entry:'Position size = Base Size × VIX Multiplier. Current VIX determines multiplier.',
   stop:'Hard portfolio stop: -5% from peak triggers full risk-off mode for 48 hours.',
   target:'Stay in profitable positions but tighten stops in high VIX environments.',
   options:'High VIX = premium sellers paradise. Low VIX = cheap to buy protection.'},
  {id:'fibonacci',name:'Fibonacci Retracement Entry',category:'Technical',icon:'🔢',difficulty:'Intermediate',winRate:'55%',avgRR:'3.2:1',bestIn:'Trending markets after impulse moves',avoidIn:'Rangebound/sideways markets',color:'#60a5fa',
   setup:['Identify clear impulse move (>5% in <10 days)','Wait for pullback to 38.2%, 50%, or 61.8% fib level','Look for candlestick reversal at fib zone','Volume decreases on pullback, increases on reversal'],
   entry:'Enter at fib level when reversal candle closes. Smaller at 38.2%, larger at 61.8%.',
   stop:'Below the next fib level. Never below 78.6% (invalidates setup).',
   target:'T1: Previous high (100%). T2: 127.2% extension. T3: 161.8% extension.',
   options:'Buy calls at 50-61.8% fib retracement. 21-30 DTE. Strike at current price.'},
  {id:'sector_rotation',name:'Sector Rotation Momentum',category:'Macro',icon:'🗺️',difficulty:'Intermediate',winRate:'59%',avgRR:'2.4:1',bestIn:'Trending macro environments',avoidIn:'High correlation, no sector divergence',color:'#f97316',
   setup:['Identify leading sector (top 3-month performer)','Confirm with relative strength vs SPY','Sector ETF at breakout (XLK, XLE, XLF etc.)','Macro catalyst supports sector thesis'],
   entry:'Buy leading sector ETF or top 2-3 stocks within it. Enter on pullback to 20MA.',
   stop:'Sector underperforms SPY for 2 consecutive weeks → exit all positions.',
   target:'Hold 4-8 weeks. Exit when sector stops leading or reverses below 50MA.',
   options:'Buy sector ETF calls (XLK, XLE, XLF). 60-90 DTE. Target 3-5 months.'},
  {id:'sympathy',name:'Sympathy Move Play',category:'Momentum',icon:'🎯',difficulty:'Advanced',winRate:'48%',avgRR:'4.1:1',bestIn:'High momentum, sector news catalysts',avoidIn:'Low volume, broad market selloff',color:'#ef4444',
   setup:['Primary stock makes major move (+10%+) on strong catalyst','Identify 2-3 sector peers that have not moved yet','Peer has similar business, lower float, higher beta','Market is in risk-on mode (VIX declining)'],
   entry:'Buy the sympathy play within first 30-60 min of primary stock big move. Do not chase.',
   stop:'Below day VWAP. Tight stop — these are momentum plays, not value.',
   target:'T1: 5-7% gain. T2: 10-15% if momentum continues. Exit by end of day.',
   options:'Same-day or next-day expiry calls (weeklies). High risk, high reward.'},
]

export default function Strategies() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('All')
  const cats = ['All','Momentum','Options','Macro','Technical']
  const filtered = STRATEGIES.filter(s => filter==='All'||s.category===filter)
  const active = selected ? STRATEGIES.find(s=>s.id===selected) : null
  const diffColor = d => d==='Advanced'?'#ef4444':d==='Intermediate'?'#f59e0b':'#10b981'
  const tab = a => ({padding:'5px 14px',background:a?'rgba(37,99,235,0.12)':'none',border:'1px solid '+(a?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.06)'),borderRadius:5,color:a?'#60a5fa':'#4a5c7a',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'})
  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif',display:'flex',gap:20}}>
      <div style={{width:active?320:undefined,flex:active?'0 0 320px':1}}>
        <div style={{marginBottom:16}}><h1 style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,margin:'0 0 2px'}}>Strategies</h1><div style={{color:'#3d4e62',fontSize:11}}>6 proven trading frameworks · click any to see full playbook</div></div>
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>{cats.map(c=><button key={c} style={tab(filter===c)} onClick={()=>setFilter(c)}>{c}</button>)}</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.map(s=>(
            <div key={s.id} onClick={()=>setSelected(selected===s.id?null:s.id)}
              style={{background:'#0d1420',border:'1px solid '+(selected===s.id?s.color+'60':'rgba(255,255,255,0.07)'),borderRadius:12,padding:'14px 16px',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=s.color+'40'}
              onMouseLeave={e=>e.currentTarget.style.borderColor=selected===s.id?s.color+'60':'rgba(255,255,255,0.07)'}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <span style={{fontSize:20}}>{s.icon}</span>
                  <div><div style={{fontFamily:'"DM Mono",monospace',fontSize:13,fontWeight:700}}>{s.name}</div>
                  <div style={{color:'#4a5c7a',fontSize:10,marginTop:2}}><span style={{color:s.color}}>{s.category}</span> · <span style={{color:diffColor(s.difficulty)}}>{s.difficulty}</span></div></div>
                </div>
                <div style={{textAlign:'right'}}><div style={{fontFamily:'"DM Mono",monospace',fontSize:12,color:'#10b981',fontWeight:700}}>{s.winRate}</div><div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace'}}>Win Rate</div></div>
              </div>
              {!active&&<div style={{display:'flex',gap:12,marginTop:8,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.04)'}}>
                <span style={{color:'#4a5c7a',fontSize:10}}>R/R: <strong style={{color:'#f0f6ff'}}>{s.avgRR}</strong></span>
                <span style={{color:'#4a5c7a',fontSize:10}}>Best: <strong style={{color:'#f0f6ff'}}>{s.bestIn.split(',')[0]}</strong></span>
              </div>}
            </div>
          ))}
        </div>
      </div>
      {active&&(
        <div style={{flex:1,background:'#0d1420',border:'1px solid '+active.color+'30',borderRadius:16,padding:24,maxHeight:'calc(100vh - 60px)',overflowY:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}>
            <div>
              <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:4}}><span style={{fontSize:28}}>{active.icon}</span><h2 style={{fontFamily:'"Syne",sans-serif',fontSize:20,fontWeight:800}}>{active.name}</h2></div>
              <div style={{display:'flex',gap:12}}><span style={{background:active.color+'15',border:'1px solid '+active.color+'30',borderRadius:5,padding:'2px 9px',color:active.color,fontSize:10,fontFamily:'"DM Mono",monospace'}}>{active.category}</span><span style={{color:diffColor(active.difficulty),fontSize:10,fontFamily:'"DM Mono",monospace'}}>{active.difficulty}</span><span style={{color:'#10b981',fontSize:11,fontFamily:'"DM Mono",monospace',fontWeight:700}}>{active.winRate} Win Rate</span><span style={{color:'#60a5fa',fontSize:11,fontFamily:'"DM Mono",monospace'}}>Avg {active.avgRR} R/R</span></div>
            </div>
            <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',color:'#4a5c7a',cursor:'pointer',fontSize:20}}>✕</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
            <div style={{padding:'10px 14px',background:'rgba(16,185,129,0.05)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:8}}><div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',marginBottom:6}}>BEST CONDITIONS</div><div style={{color:'#10b981',fontSize:11}}>{active.bestIn}</div></div>
            <div style={{padding:'10px 14px',background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:8}}><div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace',marginBottom:6}}>AVOID WHEN</div><div style={{color:'#ef4444',fontSize:11}}>{active.avoidIn}</div></div>
          </div>
          <div style={{marginBottom:18}}><div style={{fontFamily:'"DM Mono",monospace',fontSize:10,color:'#4a5c7a',marginBottom:10}}>SETUP CHECKLIST</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>{active.setup.map((s,i)=><div key={i} style={{display:'flex',gap:10,padding:'8px 12px',background:'rgba(255,255,255,0.02)',borderRadius:7,fontSize:12}}><span style={{color:active.color,flexShrink:0}}>☐</span><span style={{color:'#9ab'}}>{s}</span></div>)}</div>
          </div>
          {[['ENTRY',active.entry,'#f59e0b'],['STOP LOSS',active.stop,'#ef4444'],['TARGET',active.target,'#10b981'],['OPTIONS PLAY',active.options,'#a78bfa']].map(([label,text,color])=>(
            <div key={label} style={{marginBottom:14,padding:'12px 16px',background:color+'08',border:'1px solid '+color+'20',borderRadius:10}}>
              <div style={{fontFamily:'"DM Mono",monospace',fontSize:9,color:color,marginBottom:6,fontWeight:700}}>{label}</div>
              <div style={{fontSize:12,color:'#9ab',lineHeight:1.7}}>{text}</div>
            </div>
          ))}
          <div style={{display:'flex',gap:8,marginTop:20,paddingTop:16,borderTop:'1px solid rgba(255,255,255,0.06)'}}>
            <button onClick={()=>navigate('/app/setups')} style={{flex:1,padding:'10px',background:'linear-gradient(135deg,'+active.color+','+active.color+'cc)',border:'none',borderRadius:8,color:'#fff',fontSize:12,cursor:'pointer',fontWeight:700}}>Find Setups Using This Strategy</button>
            <button onClick={()=>navigate('/app/charts')} style={{flex:1,padding:'10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#6b7a90',fontSize:12,cursor:'pointer'}}>Open Charts →</button>
          </div>
        </div>
      )}
    </div>
  )
}