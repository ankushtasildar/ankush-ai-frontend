import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function CommandCenter() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const chatRef = useRef(null)

  // Trade state from URL params (passed from DT Dashboard "I'M IN" click)
  const [trade, setTrade] = useState(null)
  const [active, setActive] = useState(false)
  const [messages, setMessages] = useState([])
  const [polling, setPolling] = useState(false)
  const [latestData, setLatestData] = useState(null)

  // Initialize from URL params
  useEffect(function() {
    var entry = parseFloat(searchParams.get('entry') || '0')
    var dir = searchParams.get('direction') || ''
    var stop = parseFloat(searchParams.get('stop') || '0')
    var t1 = parseFloat(searchParams.get('target1') || '0')
    var t2 = parseFloat(searchParams.get('target2') || '0')
    if (entry && dir) {
      setTrade({ entry: entry, direction: dir.toUpperCase(), stop: stop || null, target1: t1 || null, target2: t2 || null, enteredAt: new Date().toISOString() })
      setActive(true)
      setMessages([{ type: 'system', text: 'Trade registered. ' + dir.toUpperCase() + ' from $' + entry.toFixed(2) + '. Command Center active.', time: new Date() }])
    }
  }, [])

  // Poll for updates when active
  useEffect(function() {
    if (!active || !trade) return
    setPolling(true)
    var interval = setInterval(fetchUpdate, 15000)
    fetchUpdate() // immediate first call
    return function() { clearInterval(interval); setPolling(false) }
  }, [active, trade])

  // Auto-scroll chat
  useEffect(function() {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  async function fetchUpdate() {
    if (!trade) return
    try {
      var params = new URLSearchParams({
        action: 'update', entry: String(trade.entry), direction: trade.direction,
        enteredAt: trade.enteredAt
      })
      if (trade.stop) params.append('stop', String(trade.stop))
      if (trade.target1) params.append('target1', String(trade.target1))
      if (trade.target2) params.append('target2', String(trade.target2))
      var r = await fetch('/api/command-center?' + params.toString())
      if (r.ok) {
        var d = await r.json()
        setLatestData(d)
        if (d.commentary) {
          setMessages(function(prev) { return prev.concat([{ type: 'ai', text: d.commentary, time: new Date(), pnl: d.pnl, price: d.price }]) })
        }
        if (d.actions && d.actions.length > 0) {
          d.actions.forEach(function(a) {
            setMessages(function(prev) { return prev.concat([{ type: 'action', text: a.reason, actionType: a.type, urgency: a.urgency, price: a.price, time: new Date() }]) })
          })
        }
      }
    } catch(e) {}
  }

  function exitTrade() {
    setActive(false)
    setPolling(false)
    var pnl = latestData ? latestData.pnl : 0
    setMessages(function(prev) { return prev.concat([{ type: 'system', text: 'Trade closed. Final P&L: ' + (pnl >= 0 ? '+' : '') + '$' + (pnl || 0).toFixed(2), time: new Date() }]) })
  }

  function moveStop(newStop) {
    setTrade(function(prev) { return prev ? Object.assign({}, prev, {stop: newStop}) : prev })
    setMessages(function(prev) { return prev.concat([{ type: 'user', text: 'Stop moved to $' + newStop.toFixed(2), time: new Date() }]) })
  }

  // Not in a trade — show entry screen
  if (!trade) {
    return (
      <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u{1F3AF}'}</div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Command Center</h1>
          <p style={{ color: '#4a5c7a', fontSize: 12, lineHeight: 1.6, marginBottom: 20 }}>
            Click "I'M IN" on a Day Trade Engine alert to activate the Command Center. Your AI co-pilot will watch the trade with you in real-time.
          </p>
          <button onClick={function(){ navigate('/app/daytrade') }} style={{ padding: '12px 24px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, color: '#60a5fa', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Go to DT Engine</button>
        </div>
      </div>
    )
  }

  var pnl = latestData ? latestData.pnl : 0
  var pnlPct = latestData ? latestData.pnlPct : 0
  var price = latestData ? latestData.price : trade.entry
  var elapsed = latestData ? latestData.elapsed : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      {/* Top bar — trade info */}
      <div style={{ padding: '10px 16px', background: '#0a0e15', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 9, fontFamily: '"DM Mono",monospace', padding: '3px 8px', borderRadius: 4, background: trade.direction === 'BULLISH' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: trade.direction === 'BULLISH' ? '#10b981' : '#ef4444', fontWeight: 700 }}>{trade.direction}</span>
          <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 13, fontWeight: 700 }}>QQQ</span>
          <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, color: '#4a5c7a' }}>Entry: ${trade.entry.toFixed(2)}</span>
          {trade.stop && <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, color: '#ef4444' }}>Stop: ${trade.stop.toFixed(2)}</span>}
          {trade.target1 && <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, color: '#10b981' }}>T1: ${trade.target1.toFixed(2)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 16, fontWeight: 800, color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span>
          <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 10, color: '#3d4e62' }}>{elapsed}m</span>
          <button onClick={exitTrade} style={{ padding: '5px 14px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#ef4444', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>EXIT TRADE</button>
        </div>
      </div>

      {/* Main content — split view */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel — indicators */}
        <div style={{ width: 280, borderRight: '1px solid rgba(255,255,255,0.06)', padding: '12px', overflowY: 'auto', flexShrink: 0 }}>
          {/* Price */}
          <div style={{ textAlign: 'center', marginBottom: 12, padding: '8px', background: '#0a0e15', borderRadius: 8 }}>
            <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase' }}>Current Price</div>
            <div style={{ fontSize: 22, fontFamily: '"DM Mono",monospace', fontWeight: 800 }}>${price.toFixed(2)}</div>
            {polling && <div style={{ fontSize: 8, color: '#10b981' }}>{'\u25CF'} Live — updating every 15s</div>}
          </div>

          {/* Indicators */}
          {latestData && latestData.indicators && (
            <div>
              {latestData.indicators.macd && (
                <div style={{ marginBottom: 8, padding: '6px 8px', background: '#0c1018', borderRadius: 6, fontSize: 9, fontFamily: '"DM Mono",monospace' }}>
                  <div style={{ color: '#60a5fa', fontWeight: 700, marginBottom: 3 }}>MACD 5m</div>
                  <div style={{ color: latestData.indicators.macd.hist > 0 ? '#10b981' : '#ef4444' }}>Hist: {latestData.indicators.macd.hist}</div>
                  <div style={{ color: '#4a5c7a' }}>Accel: {latestData.indicators.macd.accel}</div>
                  {latestData.indicators.macd.cross !== 'none' && <div style={{ color: '#f59e0b' }}>{latestData.indicators.macd.cross}</div>}
                </div>
              )}
              {latestData.indicators.adx && (
                <div style={{ marginBottom: 8, padding: '6px 8px', background: '#0c1018', borderRadius: 6, fontSize: 9, fontFamily: '"DM Mono",monospace' }}>
                  <div style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 3 }}>ADX 5m</div>
                  <div>ADX: {latestData.indicators.adx.adx} {latestData.indicators.adx.trending ? 'TRENDING' : 'ranging'}</div>
                  <div style={{ color: latestData.indicators.adx.dir === 'bull' ? '#10b981' : '#ef4444' }}>{latestData.indicators.adx.dir}</div>
                </div>
              )}
              {latestData.indicators.squeeze && (
                <div style={{ marginBottom: 8, padding: '6px 8px', background: '#0c1018', borderRadius: 6, fontSize: 9, fontFamily: '"DM Mono",monospace' }}>
                  <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: 3 }}>SQUEEZE</div>
                  <div style={{ color: latestData.indicators.squeeze.fired ? '#ef4444' : latestData.indicators.squeeze.on ? '#f59e0b' : '#3d4e62' }}>
                    {latestData.indicators.squeeze.fired ? 'FIRED ' + latestData.indicators.squeeze.dir : latestData.indicators.squeeze.on ? 'ON (building)' : 'OFF'}
                  </div>
                </div>
              )}
              {latestData.indicators.vwap && (
                <div style={{ marginBottom: 8, padding: '6px 8px', background: '#0c1018', borderRadius: 6, fontSize: 9, fontFamily: '"DM Mono",monospace' }}>
                  <div style={{ color: '#60a5fa', fontWeight: 700, marginBottom: 3 }}>VWAP</div>
                  <div>${latestData.indicators.vwap.vwap} ({latestData.indicators.vwap.priceVsVwap})</div>
                </div>
              )}
            </div>
          )}

          {/* Confluence */}
          {latestData && latestData.confluence && (
            <div style={{ padding: '8px', background: '#0a0e15', borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', marginBottom: 3 }}>Confluence</div>
              <div style={{ fontSize: 16, fontFamily: '"DM Mono",monospace', fontWeight: 800, color: latestData.confluence.bias === 'BULLISH' ? '#10b981' : latestData.confluence.bias === 'BEARISH' ? '#ef4444' : '#4a5c7a' }}>
                {latestData.confluence.confluencePct}% {latestData.confluence.bias}
              </div>
              <div style={{ fontSize: 8, color: '#4a5c7a' }}>{latestData.confluence.strength}</div>
            </div>
          )}

          {/* Strat */}
          {latestData && latestData.strat && (
            <div style={{ padding: '6px 8px', background: '#0c1018', borderRadius: 6, fontSize: 9, fontFamily: '"DM Mono",monospace' }}>
              <div style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 3 }}>STRAT</div>
              {latestData.strat.sss50 && <div>SSS50: {latestData.strat.sss50.state}</div>}
              {latestData.strat.ftfc && <div>FTFC: {latestData.strat.ftfc.ftfc}</div>}
            </div>
          )}
        </div>

        {/* Right panel — AI chat feed */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {messages.map(function(msg, i) {
              var bgColor = msg.type === 'ai' ? '#0c1018' : msg.type === 'action' ? (msg.urgency === 'critical' ? 'rgba(239,68,68,0.08)' : msg.urgency === 'warning' ? 'rgba(245,158,11,0.06)' : msg.urgency === 'positive' ? 'rgba(16,185,129,0.06)' : 'rgba(59,130,246,0.06)') : msg.type === 'system' ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.03)'
              var borderColor = msg.type === 'action' ? (msg.urgency === 'critical' ? 'rgba(239,68,68,0.2)' : msg.urgency === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)') : 'rgba(255,255,255,0.04)'
              return (
                <div key={i} style={{ marginBottom: 8, padding: '10px 14px', background: bgColor, border: '1px solid ' + borderColor, borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: msg.type === 'ai' ? '#60a5fa' : msg.type === 'action' ? '#f59e0b' : msg.type === 'system' ? '#a78bfa' : '#4a5c7a', fontFamily: '"DM Mono",monospace' }}>
                      {msg.type === 'ai' ? 'AnkushAI' : msg.type === 'action' ? (msg.actionType || 'ACTION') : msg.type === 'system' ? 'SYSTEM' : 'YOU'}
                    </span>
                    <span style={{ fontSize: 8, color: '#3d4e62' }}>{msg.time ? msg.time.toLocaleTimeString() : ''}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#8b9bb4', lineHeight: 1.6 }}>{msg.text}</div>
                  {msg.price && <div style={{ fontSize: 9, color: '#3d4e62', marginTop: 3, fontFamily: '"DM Mono",monospace' }}>@ ${msg.price.toFixed(2)}{msg.pnl != null ? ' | P&L: ' + (msg.pnl >= 0 ? '+' : '') + '$' + msg.pnl.toFixed(2) : ''}</div>}
                  {msg.type === 'action' && msg.actionType === 'MOVE_STOP' && msg.price && (
                    <button onClick={function(){ moveStop(msg.price) }} style={{ marginTop: 6, padding: '4px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, color: '#f59e0b', fontSize: 9, cursor: 'pointer', fontWeight: 600 }}>Move Stop to ${msg.price.toFixed(2)}</button>
                  )}
                </div>
              )
            })}
            {polling && messages.length > 0 && (
              <div style={{ textAlign: 'center', padding: 8, color: '#3d4e62', fontSize: 9 }}>Updating in 15s...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
