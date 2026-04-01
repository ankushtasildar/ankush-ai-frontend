import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STRATEGIES = [
  {id:'ema_breakout',name:'EMA Stack Breakout',category:'Momentum',icon:'\u{1F4C8}',difficulty:'Intermediate',winRate:'62%',avgRR:'2.8:1',bestIn:'Trending markets, low VIX',avoidIn:'Choppy/sideways, VIX > 25',color:'#10b981',
   setup:['Price above EMA20 > EMA50 > EMA200 (bullish stack)','RSI between 50-65 (not overbought)','Volume surge on breakout day (>1.5x average)','Clean consolidation above prior resistance'],
   entry:'Buy the first retest of EMA20 after breakout. Enter on close above yesterday high.',
   stop:'Below EMA50. Hard stop 1.5% below entry.',
   target:'T1: Previous swing high. T2: 2x ATR extension. Scale out 50% at T1.',
   options:'Buy ATM calls 30-45 DTE. Target 50-100% gain. IV rank < 50 preferred.',
   quiz:[{q:'What EMA order confirms a bullish stack?',a:'EMA20 > EMA50 > EMA200',wrong:['EMA200 > EMA50 > EMA20','EMA50 > EMA20 > EMA200']},{q:'Where do you set the stop loss?',a:'Below EMA50',wrong:['Below EMA20','Below entry price']}]},
  {id:'earnings_iv',name:'Pre-Earnings IV Crush',category:'Options',icon:'\u{1F525}',difficulty:'Advanced',winRate:'58%',avgRR:'2.1:1',bestIn:'High IV rank stocks before earnings',avoidIn:'Low IV rank, unpredictable earnings',color:'#f59e0b',
   setup:['IV Rank > 50 with earnings in 7-14 days','Stock has clear range (no recent breakout)','Historical post-earnings move < current implied move','Check premium buyer vs seller skew'],
   entry:'Sell iron condor 5-7 days before earnings. Strike at \u00B11\u03C3 expected move.',
   stop:'Close if position loses 2x premium collected.',
   target:'Close at 50% profit. Never hold through earnings.',
   options:'Iron condor or short strangle. Sell 30 DTE, close 7 DTE or at 50% profit.',
   quiz:[{q:'What IV Rank threshold triggers this strategy?',a:'IV Rank > 50',wrong:['IV Rank > 20','IV Rank > 80']},{q:'When should you close the position?',a:'Before earnings announcement',wrong:['After earnings','At expiration']}]},
  {id:'vix_regime',name:'VIX Regime Risk Management',category:'Macro',icon:'\u26A1',difficulty:'All Levels',winRate:'N/A — Framework',avgRR:'Varies',bestIn:'All market conditions',avoidIn:'Never avoid — always apply',color:'#a78bfa',
   setup:['VIX < 15: Greed — go directional, reduce hedge','VIX 15-20: Neutral — balanced, full size','VIX 20-25: Caution — reduce size 25-50%, add hedges','VIX 25-35: Fear — spreads only, 25% size','VIX > 35: Panic — cash or short gamma only'],
   entry:'Position size = Base Size \u00D7 VIX Multiplier.',
   stop:'Hard portfolio stop: -5% from peak triggers full risk-off for 48 hours.',
   target:'Stay in profitable positions but tighten stops in high VIX.',
   options:'High VIX = premium sellers paradise. Low VIX = cheap to buy protection.',
   quiz:[{q:'At VIX 28, what position size should you use?',a:'25% of normal size',wrong:['Full size','50% size']},{q:'What triggers full risk-off mode?',a:'-5% portfolio drawdown from peak',wrong:['-2% drawdown','-10% drawdown']}]},
  {id:'fibonacci',name:'Fibonacci Retracement Entry',category:'Technical',icon:'\u{1F522}',difficulty:'Intermediate',winRate:'55%',avgRR:'3.2:1',bestIn:'Trending markets after impulse moves',avoidIn:'Rangebound/sideways markets',color:'#60a5fa',
   setup:['Identify clear impulse move (>5% in <10 days)','Wait for pullback to 38.2%, 50%, or 61.8% fib','Look for candlestick reversal at fib zone','Volume decreases on pullback, increases on reversal'],
   entry:'Enter at fib level when reversal candle closes.',
   stop:'Below the next fib level. Never below 78.6%.',
   target:'T1: Previous high (100%). T2: 127.2% extension. T3: 161.8%.',
   options:'Buy calls at 50-61.8% fib retracement. 21-30 DTE.',
   quiz:[{q:'Which fib level invalidates the setup?',a:'Below 78.6%',wrong:['Below 61.8%','Below 100%']},{q:'Where is T2 target?',a:'127.2% extension',wrong:['100% (previous high)','200% extension']}]},
  {id:'sector_rotation',name:'Sector Rotation Momentum',category:'Macro',icon:'\u{1F5FA}',difficulty:'Intermediate',winRate:'59%',avgRR:'2.4:1',bestIn:'Trending macro environments',avoidIn:'High correlation, no sector divergence',color:'#f97316',
   setup:['Identify leading sector (top 3-month performer)','Confirm with relative strength vs SPY','Sector ETF at breakout','Macro catalyst supports sector thesis'],
   entry:'Buy leading sector ETF or top 2-3 stocks. Enter on pullback to 20MA.',
   stop:'Sector underperforms SPY for 2 consecutive weeks — exit.',
   target:'Hold 4-8 weeks. Exit when sector reverses below 50MA.',
   options:'Buy sector ETF calls 60-90 DTE.',
   quiz:[{q:'How long do you typically hold sector rotation trades?',a:'4-8 weeks',wrong:['1-2 days','6+ months']},{q:'What signals an exit?',a:'Sector underperforms SPY for 2 weeks',wrong:['One bad day','VIX spikes above 20']}]},
  {id:'sympathy',name:'Sympathy Move Play',category:'Momentum',icon:'\u{1F3AF}',difficulty:'Advanced',winRate:'48%',avgRR:'4.1:1',bestIn:'High momentum, sector news catalysts',avoidIn:'Low volume, broad market selloff',color:'#ef4444',
   setup:['Primary stock makes major move (+10%+) on catalyst','Identify 2-3 sector peers that have not moved','Peer has similar business, higher beta','Market is in risk-on mode (VIX declining)'],
   entry:'Buy sympathy play within first 30-60 min. Do not chase.',
   stop:'Below day VWAP. Tight stop.',
   target:'T1: 5-7% gain. T2: 10-15%. Exit by end of day.',
   options:'Same-day or next-day expiry calls (weeklies). High risk.',
   quiz:[{q:'When should you enter a sympathy play?',a:'Within first 30-60 minutes',wrong:['End of day','Next morning']},{q:'Where is the stop loss?',a:'Below VWAP',wrong:['Below entry -5%','Below open price']}]},
]

export default function Strategies() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('All')
  const [quizMode, setQuizMode] = useState(false)
  const [quizStrategy, setQuizStrategy] = useState(null)
  const [quizIdx, setQuizIdx] = useState(0)
  const [quizAnswer, setQuizAnswer] = useState(null)
  const [quizScore, setQuizScore] = useState({correct: 0, total: 0})
  const [userStats, setUserStats] = useState({})
  const [liveVIX, setLiveVIX] = useState(null)

  const cats = ['All','Momentum','Options','Macro','Technical']
  const filtered = STRATEGIES.filter(s => filter==='All'||s.category===filter)
  const active = selected ? STRATEGIES.find(s=>s.id===selected) : null
  const diffColor = d => d==='Advanced'?'#ef4444':d==='Intermediate'?'#f59e0b':'#10b981'

  useEffect(() => {
    loadUserStats()
    loadMarketContext()
  }, [])

  async function loadUserStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: trades } = await supabase.from('journal_entries').select('content').eq('user_id', user.id).eq('type', 'trade').order('created_at', { ascending: false }).limit(100)
      if (!trades) return
      const stats = {}
      trades.forEach(t => {
        try {
          const d = JSON.parse(t.content || '{}')
          if (d.strategy) {
            if (!stats[d.strategy]) stats[d.strategy] = { trades: 0, wins: 0 }
            stats[d.strategy].trades++
            if ((d.pnl || 0) > 0) stats[d.strategy].wins++
          }
        } catch(e) {}
      })
      setUserStats(stats)
    } catch(e) {}
  }

  async function loadMarketContext() {
    try {
      const r = await fetch('/api/market?action=context')
      if (r.ok) { const d = await r.json(); setLiveVIX(d.vix) }
    } catch(e) {}
  }

  function startQuiz(strategy) {
    setQuizMode(true)
    setQuizStrategy(strategy)
    setQuizIdx(0)
    setQuizAnswer(null)
    setQuizScore({correct: 0, total: 0})
  }

  function answerQuiz(answer, correct) {
    setQuizAnswer(answer)
    if (answer === correct) {
      setQuizScore(prev => ({correct: prev.correct + 1, total: prev.total + 1}))
    } else {
      setQuizScore(prev => ({...prev, total: prev.total + 1}))
    }
  }

  function nextQuestion() {
    if (quizStrategy && quizIdx < quizStrategy.quiz.length - 1) {
      setQuizIdx(quizIdx + 1)
      setQuizAnswer(null)
    } else {
      setQuizMode(false)
    }
  }

  // VIX regime indicator
  const vixRegime = liveVIX ? (liveVIX < 15 ? {label:'GREED',color:'#10b981'} : liveVIX < 20 ? {label:'NEUTRAL',color:'#60a5fa'} : liveVIX < 25 ? {label:'CAUTION',color:'#f59e0b'} : liveVIX < 35 ? {label:'FEAR',color:'#ef4444'} : {label:'PANIC',color:'#ef4444'}) : null

  const tab = a => ({padding:'5px 14px',background:a?'rgba(37,99,235,0.12)':'none',border:'1px solid '+(a?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.06)'),borderRadius:5,color:a?'#60a5fa':'#4a5c7a',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'})

  // Quiz overlay
  if (quizMode && quizStrategy && quizStrategy.quiz && quizStrategy.quiz[quizIdx]) {
    const q = quizStrategy.quiz[quizIdx]
    const options = [q.a, ...q.wrong].sort(() => Math.random() - 0.5)
    return (
      <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{maxWidth:500,width:'100%'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div style={{fontSize:12,color:'#4a5c7a',fontFamily:'"DM Mono",monospace'}}>Quiz: {quizStrategy.name} ({quizIdx+1}/{quizStrategy.quiz.length})</div>
            <div style={{fontSize:12,color:'#10b981',fontFamily:'"DM Mono",monospace'}}>{quizScore.correct}/{quizScore.total} correct</div>
          </div>
          <div style={{background:'#0d1420',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:'24px'}}>
            <div style={{fontSize:15,fontWeight:600,marginBottom:20,lineHeight:1.5}}>{q.q}</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {options.map((opt, i) => {
                const isCorrect = opt === q.a
                const isSelected = quizAnswer === opt
                const showResult = quizAnswer !== null
                let bg = 'rgba(255,255,255,0.03)'
                let border = 'rgba(255,255,255,0.06)'
                let color = '#8b9bb4'
                if (showResult && isCorrect) { bg = 'rgba(16,185,129,0.1)'; border = 'rgba(16,185,129,0.3)'; color = '#10b981' }
                if (showResult && isSelected && !isCorrect) { bg = 'rgba(239,68,68,0.1)'; border = 'rgba(239,68,68,0.3)'; color = '#ef4444' }
                return (
                  <button key={i} onClick={() => !quizAnswer && answerQuiz(opt, q.a)} disabled={!!quizAnswer} style={{padding:'12px 16px',background:bg,border:'1px solid '+border,borderRadius:8,color:color,fontSize:13,cursor:quizAnswer?'default':'pointer',textAlign:'left',fontFamily:'"DM Sans",sans-serif',transition:'all 0.15s'}}>
                    {opt}
                  </button>
                )
              })}
            </div>
            {quizAnswer && (
              <button onClick={nextQuestion} style={{marginTop:16,width:'100%',padding:'10px',background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.3)',borderRadius:8,color:'#60a5fa',fontSize:12,cursor:'pointer',fontWeight:600}}>
                {quizIdx < quizStrategy.quiz.length - 1 ? 'Next Question \u2192' : 'Finish Quiz \u2192 ' + quizScore.correct + '/' + (quizScore.total) + ' correct'}
              </button>
            )}
          </div>
          <button onClick={() => setQuizMode(false)} style={{marginTop:12,width:'100%',padding:'8px',background:'none',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,color:'#4a5c7a',fontSize:10,cursor:'pointer'}}>Exit Quiz</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{padding:'20px 24px',minHeight:'100vh',background:'#080c14',color:'#f0f6ff',fontFamily:'"DM Sans",sans-serif',display:'flex',gap:20}}>
      <div style={{width:active?320:undefined,flex:active?'0 0 320px':1}}>
        <div style={{marginBottom:16}}>
          <h1 style={{fontFamily:'"Syne",sans-serif',fontSize:22,fontWeight:800,margin:'0 0 2px'}}>Strategies</h1>
          <div style={{color:'#3d4e62',fontSize:11}}>6 proven frameworks · click to expand · quiz mode to learn</div>
        </div>

        {/* VIX Regime Banner */}
        {vixRegime && (
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,marginBottom:12}}>
            <span style={{fontSize:8,color:'#3d4e62',fontFamily:'"DM Mono",monospace',textTransform:'uppercase',letterSpacing:0.5}}>Current VIX regime</span>
            <span style={{fontFamily:'"DM Mono",monospace',fontSize:12,fontWeight:700,color:vixRegime.color}}>{liveVIX && liveVIX.toFixed(1)} — {vixRegime.label}</span>
          </div>
        )}

        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>{cats.map(c=><button key={c} style={tab(filter===c)} onClick={()=>setFilter(c)}>{c}</button>)}</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.map(s => {
            const uStats = userStats[s.id]
            return (
              <div key={s.id} onClick={()=>setSelected(selected===s.id?null:s.id)}
                style={{padding:'12px 16px',background:selected===s.id?'rgba(37,99,235,0.06)':'#0d1420',border:'1px solid '+(selected===s.id?'rgba(37,99,235,0.3)':'rgba(255,255,255,0.06)'),borderRadius:10,cursor:'pointer',transition:'all 0.15s'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:20}}>{s.icon}</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>{s.name}</div>
                      <div style={{display:'flex',gap:6,marginTop:2}}>
                        <span style={{color:s.color,fontSize:9,fontFamily:'"DM Mono",monospace'}}>{s.category}</span>
                        <span style={{color:diffColor(s.difficulty),fontSize:9,fontFamily:'"DM Mono",monospace'}}>{s.difficulty}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{color:s.color,fontFamily:'"DM Mono",monospace',fontSize:13,fontWeight:700}}>{s.winRate}</div>
                    <div style={{color:'#3d4e62',fontSize:9,fontFamily:'"DM Mono",monospace'}}>Win Rate</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:12,marginTop:8,fontSize:9,color:'#4a5c7a',fontFamily:'"DM Mono",monospace'}}>
                  <span>R/R: {s.avgRR}</span>
                  <span>Best: {s.bestIn}</span>
                </div>
                {/* User's personal stats with this strategy */}
                {uStats && uStats.trades > 0 && (
                  <div style={{marginTop:6,padding:'4px 8px',background:'rgba(124,58,237,0.05)',border:'1px solid rgba(124,58,237,0.15)',borderRadius:5,display:'inline-flex',gap:8,fontSize:9,fontFamily:'"DM Mono",monospace'}}>
                    <span style={{color:'#a78bfa'}}>Your stats:</span>
                    <span style={{color:'#8b9bb4'}}>{uStats.trades} trades</span>
                    <span style={{color:uStats.wins/uStats.trades >= 0.5 ? '#10b981' : '#ef4444'}}>{Math.round(uStats.wins/uStats.trades*100)}% win</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {active && (
        <div style={{flex:1,background:'#0d1420',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:24,overflowY:'auto',maxHeight:'calc(100vh - 60px)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
            <div>
              <div style={{fontSize:22,fontWeight:800,fontFamily:'"Syne",sans-serif',marginBottom:4}}>{active.icon} {active.name}</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <span style={{background:active.color+'15',border:'1px solid '+active.color+'40',borderRadius:5,padding:'2px 8px',color:active.color,fontSize:10,fontFamily:'"DM Mono",monospace'}}>{active.category}</span>
                <span style={{background:diffColor(active.difficulty)+'15',border:'1px solid '+diffColor(active.difficulty)+'40',borderRadius:5,padding:'2px 8px',color:diffColor(active.difficulty),fontSize:10,fontFamily:'"DM Mono",monospace'}}>{active.difficulty}</span>
              </div>
            </div>
            <div style={{display:'flex',gap:6}}>
              {active.quiz && <button onClick={() => startQuiz(active)} style={{padding:'6px 12px',background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.3)',borderRadius:6,color:'#a78bfa',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace',fontWeight:600}}>Quiz Mode</button>}
              <button onClick={() => navigate('/app/risk')} style={{padding:'6px 12px',background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:6,color:'#10b981',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>Risk Calc \u2192</button>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
            {[
              {label:'Win Rate',value:active.winRate,color:active.color},
              {label:'Risk:Reward',value:active.avgRR,color:'#8b9bb4'},
              {label:'Best In',value:active.bestIn.split(',')[0],color:'#60a5fa'},
              {label:'Avoid In',value:active.avoidIn.split(',')[0],color:'#ef4444'},
            ].map((m,i) => (
              <div key={i} style={{background:'#0a0e15',borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
                <div style={{fontSize:8,color:'#3d4e62',textTransform:'uppercase',letterSpacing:0.5,marginBottom:3}}>{m.label}</div>
                <div style={{fontSize:11,color:m.color,fontFamily:'"DM Mono",monospace',fontWeight:600}}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Playbook sections */}
          {[
            {title:'SETUP CONDITIONS',items:active.setup,color:'#60a5fa'},
            {title:'ENTRY',text:active.entry,color:'#10b981'},
            {title:'STOP LOSS',text:active.stop,color:'#ef4444'},
            {title:'TARGETS',text:active.target,color:'#f59e0b'},
            {title:'OPTIONS PLAY',text:active.options,color:'#a78bfa'},
          ].map((section,i) => (
            <div key={i} style={{marginBottom:14}}>
              <div style={{fontSize:9,color:section.color,fontFamily:'"DM Mono",monospace',fontWeight:700,letterSpacing:0.5,marginBottom:6}}>{section.title}</div>
              {section.items ? (
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {section.items.map((item,j) => (
                    <div key={j} style={{display:'flex',gap:8,fontSize:12,color:'#8b9bb4',lineHeight:1.6}}>
                      <span style={{color:section.color,flexShrink:0}}>\u2022</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{fontSize:12,color:'#8b9bb4',lineHeight:1.6}}>{section.text}</div>
              )}
            </div>
          ))}

          {/* Cross-links to other pages */}
          <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:14,marginTop:14,display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={() => navigate('/app/journal')} style={{padding:'6px 14px',background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.15)',borderRadius:6,color:'#60a5fa',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>Log a trade with this strategy \u2192</button>
            <button onClick={() => navigate('/app/predict')} style={{padding:'6px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:6,color:'#4a5c7a',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>Run Alpha Scan \u2192</button>
            {active.category === 'Options' && <button onClick={() => navigate('/app/earnings')} style={{padding:'6px 14px',background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.15)',borderRadius:6,color:'#f59e0b',fontSize:10,cursor:'pointer',fontFamily:'"DM Mono",monospace'}}>Earnings Calendar \u2192</button>}
          </div>
        </div>
      )}

      {/* Empty state for detail panel */}
      {!active && (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#3d4e62',flexDirection:'column',gap:8}}>
          <div style={{fontSize:36}}>{'\u{1F4DA}'}</div>
          <div style={{fontSize:13,fontWeight:600,color:'#f0f6ff'}}>Select a strategy to see the full playbook</div>
          <div style={{fontSize:11,color:'#4a5c7a'}}>Click any strategy, then use Quiz Mode to test your knowledge</div>
        </div>
      )}
    </div>
  )
}
