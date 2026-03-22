import { useState, useEffect, useRef } from 'react'

// Jordan: Scan radar animation - fires when scan completes
export function ScanRadar({ scanning, lastScan }) {
  const [pulses, setPulses] = useState([])
  const timerRef = useRef(null)

  useEffect(() => {
    if (!scanning) return
    // Generate radar sweep pulses
    const id = setInterval(() => {
      setPulses(p => [...p.slice(-3), Date.now()])
    }, 600)
    return () => clearInterval(id)
  }, [scanning])

  if (!scanning && !lastScan) return null

  return (
    <div style={{position:'relative',width:48,height:48,flexShrink:0}}>
      {/* Radar base */}
      <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'1px solid rgba(59,130,246,0.3)',background:'rgba(8,12,20,0.9)'}}>
        {/* Rotating sweep */}
        {scanning && (
          <div style={{
            position:'absolute',inset:2,borderRadius:'50%',
            background:'conic-gradient(from 0deg, transparent 70%, rgba(59,130,246,0.6) 100%)',
            animation:'spin 1.5s linear infinite'
          }}/>
        )}
        {/* Center dot */}
        <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:4,height:4,borderRadius:'50%',background:scanning?'#3b82f6':'#10b981'}}/>
        {/* Pulse rings */}
        {!scanning && lastScan && pulses.slice(-1).map(p => (
          <div key={p} style={{
            position:'absolute',inset:0,borderRadius:'50%',
            border:'2px solid rgba(16,185,129,0.6)',
            animation:'ping 1s ease-out forwards'
          }}/>
        ))}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ping { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(1.8); opacity: 0; } }
      `}</style>
    </div>
  )
}

// Jordan: Win streak counter
export function WinStreak({ outcomes }) {
  if (!outcomes || outcomes.length === 0) return null
  let streak = 0
  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (outcomes[i].outcome === 'target_hit') streak++
    else break
  }
  if (streak < 2) return null
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)',borderRadius:20}}>
      <span style={{fontSize:14}}>*</span>
      <span style={{color:'#f59e0b',fontWeight:700,fontSize:12}}>{streak}-WIN STREAK</span>
    </div>
  )
}

// Jordan: Trade logged confetti micro-animation
export function TradeLoggedToast({ visible, symbol }) {
  if (!visible) return null
  return (
    <div style={{
      position:'fixed',bottom:24,right:24,zIndex:9999,
      background:'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.08))',
      border:'1px solid rgba(16,185,129,0.4)',borderRadius:12,
      padding:'12px 20px',display:'flex',alignItems:'center',gap:10,
      animation:'slideIn 0.3s ease-out',backdropFilter:'blur(12px)'
    }}>
      <span style={{fontSize:18}}>*</span>
      <div>
        <div style={{color:'#10b981',fontWeight:700,fontSize:13}}>Trade Logged</div>
        <div style={{color:'#4a5c7a',fontSize:11}}>{symbol} added to journal</div>
      </div>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  )
}

// Jordan: Signal strength meter for setup cards
export function SignalMeter({ confidence, bias }) {
  const bars = Math.round((confidence || 5) / 2)
  const color = bias === 'bullish' ? '#10b981' : '#ef4444'
  return (
    <div style={{display:'flex',gap:2,alignItems:'flex-end',height:14}}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{
          width:3, borderRadius:1,
          height: 4 + i * 2,
          background: i <= bars ? color : 'rgba(255,255,255,0.1)',
          transition:'background 0.3s'
        }}/>
      ))}
    </div>
  )
}