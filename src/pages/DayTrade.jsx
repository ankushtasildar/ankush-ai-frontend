
      {/* Detected Patterns */}
      {scan && scan.patterns && (scan.patterns.candlestick.length > 0 || scan.patterns.chart.length > 0) && (
        <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 10, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Pattern Detection ({scan.patterns.total} found)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {scan.patterns.candlestick.map(function(p, i) { return (
              <div key={'c'+i} style={{ background: p.direction === 'bullish' ? 'rgba(16,185,129,0.08)' : p.direction === 'bearish' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (p.direction === 'bullish' ? 'rgba(16,185,129,0.2)' : p.direction === 'bearish' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'), borderRadius: 6, padding: '4px 8px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: p.direction === 'bullish' ? '#10b981' : p.direction === 'bearish' ? '#ef4444' : '#8892a4' }}>{p.pattern}</span>
                <span style={{ fontSize: 9, color: '#4a5c7a', marginLeft: 4 }}>{p.signal}</span>
              </div>
            ) })}
            {scan.patterns.chart.map(function(p, i) { return (
              <div key={'h'+i} style={{ background: p.direction === 'bullish' ? 'rgba(16,185,129,0.08)' : p.direction === 'bearish' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: '1px solid ' + (p.direction === 'bullish' ? 'rgba(16,185,129,0.2)' : p.direction === 'bearish' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'), borderRadius: 6, padding: '4px 8px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: p.direction === 'bullish' ? '#10b981' : p.direction === 'bearish' ? '#ef4444' : '#f59e0b' }}>{p.pattern}</span>
                <span style={{ fontSize: 9, color: '#4a5c7a', marginLeft: 4 }}>{p.signal}</span>
              </div>
            ) })}
          </div>
        </div>
      )}

      import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function DayTrade() {
  var navigate = useNavigate()
  var [scan, setScan] = useState(null)
  var [loading, setLoading] = useState(true)
  var [scanCount, setScanCount] = useState(0)
  var [lastScanTime, setLastScanTime] = useState(null)
  var [scanLog, setScanLog] = useState([])
  var [marketScan, setMarketScan] = useState(null)
  var [deepAlert, setDeepAlert] = useState(null);
  var intervalRef = useRef(null)
  var mktRef = useRef(null)
  var logRef = useRef([])

  function addLog(msg, type) {
    var entry = { time: new Date().toLocaleTimeString(), msg: msg, type: type || 'info' }
    setScanLog(function(prev) {
      var next = [entry].concat(prev).slice(0, 12)
      logRef.current = next
      return next
    })
  }

  function generateInsight(d) {
    var sym = d.symbol || 'QQQ'
    var px = d.price ? '$' + d.price.toFixed(2) : ''
    var conf = d.confluence ? d.confluence.confluencePct : 0
    var bias = d.confluence ? d.confluence.bias : 'NEUTRAL'
    var vw = d.indicators && d.indicators.vwap ? d.indicators.vwap : null
    var sq5 = d.indicators && d.indicators.squeeze_5m ? d.indicators.squeeze_5m : null
    var sq1 = d.indicators && d.indicators.squeeze_1m ? d.indicators.squeeze_1m : null
    var sss = d.strat && d.strat.sss50 ? d.strat.sss50 : null
    var ftfc = d.strat && d.strat.ftfc ? d.strat.ftfc : null
    var combo = d.strat && d.strat.combo ? d.strat.combo : null
    var gap = d.structure && d.structure.gap ? d.structure.gap : null
    var lvls = d.structure && d.structure.levels ? d.structure.levels : null
    var ham = d.strat && d.strat.hammer ? d.strat.hammer : null
    var macd5 = d.indicators && d.indicators.macd_5m ? d.indicators.macd_5m : null
    var adx5 = d.indicators && d.indicators.adx_5m ? d.indicators.adx_5m : null
    var vf = d.volumeFlow || null

    var pool = []

    // Alert
    if (d.alert) {
      pool.push({ p: 10, msg: sym + ' ALERT: ' + d.alert.direction + ' ' + conf + '%, Grade ' + d.alert.grade + '. Entry $' + d.alert.entry + ' Stop $' + d.alert.stop + ' Target $' + d.alert.target1, type: 'alert' })
    }
    // Squeeze
    if (sq5 && sq5.fired) pool.push({ p: 9, msg: sym + ' ' + px + ': 5M SQUEEZE FIRED ' + (sq5.dir || '') + '. Expansion underway, watching for follow-through', type: 'alert' })
    if (sq1 && sq1.fired) pool.push({ p: 8, msg: sym + ' ' + px + ': 1M squeeze fired ' + (sq1.dir || '') + '. Micro-expansion in progress', type: 'warn' })
    if (sq5 && sq5.on && !sq5.fired) pool.push({ p: 5, msg: sym + ' ' + px + ': 5M squeeze coiling. BBands inside Keltner -- expansion imminent', type: 'warn' })
    // SSS50
    if (sss && sss.state === 'ACTIVE') pool.push({ p: 9, msg: sym + ' ' + px + ': SSS50 ACTIVE -- Failed bar crossed 50% at $' + (sss.midpoint || '') + '. Outside bar forming ' + (sss.direction || ''), type: 'alert' })
    if (sss && sss.state === 'STANDBY') pool.push({ p: 6, msg: sym + ' ' + px + ': SSS50 standby -- watching 50% level at $' + (sss.midpoint || ''), type: 'warn' })
    if (sss && sss.state === 'COMPLETE') pool.push({ p: 7, msg: sym + ' ' + px + ': SSS50 complete -- outside bar confirmed ' + (sss.direction || ''), type: 'alert' })
    // FTFC
    if (ftfc && ftfc.ftfc === 'BULLISH') pool.push({ p: 7, msg: sym + ': FTFC BULLISH -- all ' + (ftfc.count ? ftfc.count.total : '') + ' timeframes green. Strong directional conviction', type: 'alert' })
    if (ftfc && ftfc.ftfc === 'BEARISH') pool.push({ p: 7, msg: sym + ': FTFC BEARISH -- all timeframes red. Bears fully in control', type: 'alert' })
    if (ftfc && ftfc.ftfc === 'MIXED' && ftfc.bullPct >= 65) pool.push({ p: 4, msg: sym + ': ' + ftfc.bullPct + '% of timeframes bullish. Almost at full continuity -- watching ' + (ftfc.count ? ftfc.count.bear : '') + ' TF to flip', type: 'info' })
    if (ftfc && ftfc.ftfc === 'MIXED' && ftfc.bearPct >= 65) pool.push({ p: 4, msg: sym + ': ' + ftfc.bearPct + '% of timeframes bearish. Approaching full continuity', type: 'info' })
    // VWAP
    if (vw && d.price) {
      if (Math.abs(d.price - vw.vwap) < 0.50) pool.push({ p: 6, msg: sym + ' ' + px + ': Testing VWAP at $' + vw.vwap + '. Decision point -- break above = bullish, reject = bearish', type: 'warn' })
      else if (d.price > vw.upper1) pool.push({ p: 5, msg: sym + ' ' + px + ': Extended above VWAP +1 sigma ($' + vw.upper1 + '). Stretched -- watch for mean reversion to $' + vw.vwap, type: 'info' })
      else if (d.price < vw.lower1) pool.push({ p: 5, msg: sym + ' ' + px + ': Below VWAP -1 sigma ($' + vw.lower1 + '). Oversold intraday -- potential bounce toward $' + vw.vwap, type: 'info' })
    }
    // Key levels
    if (lvls && lvls.nearSupport) pool.push({ p: 6, msg: sym + ' ' + px + ': Approaching support at $' + lvls.nearestSupport + '. Watching for bounce or breakdown', type: 'warn' })
    if (lvls && lvls.nearResistance) pool.push({ p: 6, msg: sym + ' ' + px + ': Testing resistance at $' + lvls.nearestResistance + '. Watching for breakout or rejection', type: 'warn' })
    // Gap
    if (gap && gap.dir === 'gap_up' && gap.pct > 0.3) pool.push({ p: 4, msg: sym + ': Gapped up +' + gap.pct + '%. Fill target $' + gap.fillTarget + ' -- 70% of gaps fill same day', type: 'info' })
    if (gap && gap.dir === 'gap_down' && gap.pct < -0.3) pool.push({ p: 4, msg: sym + ': Gapped down ' + gap.pct + '%. Potential reversal into gap fill at $' + gap.fillTarget, type: 'info' })
    // Strat combo
    if (combo && combo.combo === '2-1-2') pool.push({ p: 5, msg: sym + ' ' + px + ': Strat 2-1-2 ' + (combo.direction || '') + ' -- ' + (combo.description || 'pause then continuation'), type: 'info' })
    if (combo && combo.combo === '3-1-2') pool.push({ p: 6, msg: sym + ' ' + px + ': Strat 3-1-2 ' + (combo.direction || '') + ' -- expansion-consolidation breakout', type: 'warn' })
    if (combo && combo.combo === '1-2') pool.push({ p: 5, msg: sym + ' ' + px + ': Strat 1-2 inside breakout ' + (combo.direction || ''), type: 'info' })
    // MACD
    if (macd5 && macd5.cross === 'bull_cross') pool.push({ p: 7, msg: sym + ' ' + px + ': 5M MACD bullish crossover. Momentum shifting up', type: 'alert' })
    if (macd5 && macd5.cross === 'bear_cross') pool.push({ p: 7, msg: sym + ' ' + px + ': 5M MACD bearish crossover. Momentum shifting down', type: 'alert' })
    if (macd5 && macd5.div === 'bull_div') pool.push({ p: 8, msg: sym + ' ' + px + ': Bullish divergence on 5M. Price lower but MACD turning up -- reversal signal', type: 'alert' })
    if (macd5 && macd5.div === 'bear_div') pool.push({ p: 8, msg: sym + ' ' + px + ': Bearish divergence on 5M. Price higher but MACD weakening -- exhaustion', type: 'warn' })
    // Hammer/Shooter
    if (ham && ham.type === 'hammer') pool.push({ p: 6, msg: sym + ' ' + px + ': Hammer candle ' + (ham.inForce ? '(IN-FORCE)' : '') + ' -- buyers defended the low', type: 'warn' })
    if (ham && ham.type === 'shooter') pool.push({ p: 6, msg: sym + ' ' + px + ': Shooting star ' + (ham.inForce ? '(IN-FORCE)' : '') + ' -- sellers rejected the high', type: 'warn' })
    // Volume flow
    if (vf && vf.buyPct >= 75) pool.push({ p: 4, msg: sym + ': Heavy buying (' + vf.buyPct + '% buy vol). Institutional accumulation possible', type: 'info' })
    if (vf && vf.sellPct >= 75) pool.push({ p: 4, msg: sym + ': Heavy selling (' + vf.sellPct + '% sell vol). Distribution underway', type: 'info' })
    // ADX
    if (adx5 && adx5.strong) pool.push({ p: 5, msg: sym + ': ADX ' + adx5.adx + ' -- strong ' + (adx5.dir || '') + ' trend. Favor trend-following entries', type: 'info' })
    if (adx5 && !adx5.trending) pool.push({ p: 2, msg: sym + ': ADX ' + adx5.adx + ' -- ranging, no trend. Mean reversion setups preferred', type: 'info' })

    // Fallback
    if (pool.length === 0) {
      pool.push({ p: 1, msg: sym + ' ' + px + ': ' + conf + '% ' + bias + '. Consolidating -- no clear edge yet', type: 'info' })
    }

    // Sort by priority, pick one not recently said
    pool.sort(function(a, b) { return b.p - a.p })
    var recent = logRef.current.slice(0, 4).map(function(e) { return e.msg.substring(0, 35) })
    for (var i = 0; i < pool.length; i++) {
      var dup = false
      for (var j = 0; j < recent.length; j++) {
        if (recent[j] === pool[i].msg.substring(0, 35)) { dup = true; break }
      }
      if (!dup) return pool[i]
    }
    return pool[0]
  }

  async function runMarketScan() {
    try {
      var r = await fetch('/api/market-scanner?action=scan')
      if (!r.ok) return
      var d = await r.json()
      setMarketScan(d)
          // P1: Auto deep-scan top opportunity through V3 engine
          if (data && data.opportunities && data.opportunities.length > 0) {
            var topSym = data.opportunities[0].symbol;
            fetch('/api/day-trade-engine?action=predict&symbol=' + topSym)
              .then(function(r2) { return r2.json(); })
              .then(function(v3) { setDeepAlert(v3); })
              .catch(function() { setDeepAlert(null); });
          }
      if (d.opportunities && d.opportunities.length > 0) {
        var top = d.opportunities[0]
        addLog('MARKET: ' + d.scanned + ' tickers scanned. Top: ' + top.symbol + ' ' + (top.change > 0 ? '+' : '') + top.change + '% (Score ' + top.score + ') -- ' + (top.signals && top.signals[0] ? top.signals[0] : ''), 'market')
      }
    } catch (e) {}
  }

  async function runScan() {
    try {
      var r = await fetch('/api/day-trade-engine?action=predict')
      if (!r.ok) { addLog('Scan failed: HTTP ' + r.status, 'error'); return }
      var d = await r.json()
      if (d.error) { addLog('Engine: ' + d.error, 'error'); return }
      setScan(d)
      setScanCount(function(c) { return c + 1 })
      setLastScanTime(new Date())
      setLoading(false)
      var insight = generateInsight(d)
      addLog(insight.msg, insight.type)
    } catch (e) { addLog('Error: ' + e.message, 'error') }
  }

  useEffect(function() {
    addLog('Scanner initialized -- active market surveillance across 40 tickers', 'info')
    runScan()
    runMarketScan()
    intervalRef.current = setInterval(runScan, 15000)
    mktRef.current = setInterval(runMarketScan, 60000)
    return function() { clearInterval(intervalRef.current); clearInterval(mktRef.current) }
  }, [])

  var price = scan ? scan.price : null
  var confPct = scan && scan.confluence ? scan.confluence.confluencePct : null
  var confBias = scan && scan.confluence ? scan.confluence.bias : null
  var ftfcStatus = scan && scan.strat && scan.strat.ftfc ? scan.strat.ftfc.ftfc : null
  var gapPct = scan && scan.structure && scan.structure.gap ? scan.structure.gap.pct : null
  var alert = scan ? scan.alert : null
  var options = scan ? scan.options : null
  var levels = scan && scan.structure ? scan.structure.levels : null
  var vwapData = scan && scan.indicators ? scan.indicators.vwap : null
  var priceSource = scan ? scan.priceSource : null
  var volumeFlow = scan ? scan.volumeFlow : null
  var ptf = scan ? scan.perTimeframe || {} : {}

  var S = function(s) { return Object.assign({ fontFamily: '"DM Mono",monospace', fontSize: 10, color: '#4a5c7a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }, s || {}) }
  var scannerColor = alert ? '#10b981' : confPct >= 40 ? '#f59e0b' : '#3b82f6'
  var scannerStatus = alert ? 'OPPORTUNITY FOUND' : confPct >= 40 ? 'ANALYZING SETUP' : 'ACTIVELY SCANNING'

  var logColor = function(type) { return type === 'alert' ? '#10b981' : type === 'warn' ? '#f59e0b' : type === 'market' ? '#a78bfa' : type === 'error' ? '#ef4444' : '#4a5c7a' }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, color: '#f0f6ff', margin: 0 }}>Day Trade Engine</h1>
          <div style={{ fontSize: 11, color: '#4a5c7a' }}>V3 Prediction Engine -- SSS50 + FTFC + VWAP + 5-layer confluence</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: scannerColor, boxShadow: '0 0 8px ' + scannerColor, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, color: scannerColor, fontWeight: 700, fontFamily: '"DM Mono",monospace' }}>{scannerStatus}</span>
          <span style={{ fontSize: 9, color: '#3d4e62' }}>#{scanCount}</span>
        </div>
      </div>

      <style>{'@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }'}</style>

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'QQQ Price', value: price ? '$' + price.toFixed(2) : '--', color: '#f0f6ff', sub: priceSource },
          { label: 'Confluence', value: confPct != null ? confPct + '% ' + (confBias || '') : '--', color: confBias === 'BULLISH' ? '#10b981' : confBias === 'BEARISH' ? '#ef4444' : '#f59e0b' },
          { label: 'FTFC', value: ftfcStatus || '--', color: ftfcStatus === 'BULLISH' ? '#10b981' : ftfcStatus === 'BEARISH' ? '#ef4444' : '#4a5c7a' },
          { label: 'Gap', value: gapPct != null ? (gapPct > 0 ? '+' : '') + gapPct.toFixed(2) + '%' : '--', color: '#4a5c7a' },
          { label: 'Volume Flow', value: volumeFlow ? volumeFlow.bias + ' (' + volumeFlow.buyPct + '/' + volumeFlow.sellPct + ')' : '--', color: volumeFlow && volumeFlow.bias === 'buying' ? '#10b981' : '#4a5c7a' }
        ].map(function(m, i) { return (
          <div key={i} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
            <div style={S()}>{m.label}</div>
            <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 16, fontWeight: 800, color: m.color }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: 8, color: '#2a3441', marginTop: 2 }}>{m.sub}</div>}
          </div>
        ) })}
      </div>

      {/* Key Levels + VWAP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={S({ color: '#10b981' })}>Key Levels</div>
          {levels ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, fontSize: 10, fontFamily: '"DM Mono",monospace' }}>
              {levels.pivot && <div>Pivot: ${levels.pivot}</div>}
              {levels.r1 && <div style={{ color: '#ef4444' }}>R1: ${levels.r1}</div>}
              {levels.s1 && <div style={{ color: '#10b981' }}>S1: ${levels.s1}</div>}
              {levels.r2 && <div style={{ color: '#ef4444' }}>R2: ${levels.r2}</div>}
              {levels.s2 && <div style={{ color: '#10b981' }}>S2: ${levels.s2}</div>}
              {levels.nearestSupport && <div style={{ color: '#10b981' }}>Support: ${levels.nearestSupport}</div>}
              {levels.nearestResistance && <div style={{ color: '#ef4444' }}>Resist: ${levels.nearestResistance}</div>}
            </div>
          ) : <div style={{ fontSize: 10, color: '#3d4e62' }}>Loading levels...</div>}
        </div>
        <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={S({ color: '#a78bfa' })}>VWAP</div>
          {vwapData ? (
            <div style={{ fontSize: 10, fontFamily: '"DM Mono",monospace' }}>
              <div>VWAP: ${vwapData.vwap} ({vwapData.priceVsVwap})</div>
              <div style={{ color: '#ef4444' }}>Upper 1s: ${vwapData.upper1} | 2s: ${vwapData.upper2}</div>
              <div style={{ color: '#10b981' }}>Lower 1s: ${vwapData.lower1} | 2s: ${vwapData.lower2}</div>
            </div>
          ) : <div style={{ fontSize: 10, color: '#3d4e62' }}>Loading VWAP...</div>}
        </div>
      </div>

      {/* ALERT CARD */}
      {alert && (
        <div style={{ marginBottom: 16, padding: '16px 20px', background: alert.direction === 'BULLISH' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: '2px solid ' + (alert.direction === 'BULLISH' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'), borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: alert.direction === 'BULLISH' ? '#10b981' : '#ef4444' }}>{alert.direction} ALERT</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f0f6ff' }}>{alert.confluencePct}%</span>
              <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 4, color: '#a78bfa' }}>Grade {alert.grade}</span>
            </div>
            <button onClick={function() { navigate('/app/command-center?entry=' + alert.entry + '&direction=' + alert.direction) }} style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#ef4444,#a78bfa)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 800 }}>{"I'M IN"}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, fontSize: 10, fontFamily: '"DM Mono",monospace', marginBottom: options ? 10 : 0 }}>
            {[{ l: 'ENTRY', v: '$' + alert.entry }, { l: 'STOP', v: '$' + alert.stop, c: '#ef4444' }, { l: 'TARGET', v: '$' + alert.target1 + ' (' + alert.target1_rr + ':1)', c: '#10b981' }, { l: 'TIME', v: alert.timeframe }, { l: 'RISK', v: '$' + alert.risk + ' (' + alert.riskPct + '%)' }].map(function(f, i) { return (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}>
                <div style={{ color: f.c || '#4a5c7a', fontSize: 8 }}>{f.l}</div>
                <div style={{ fontWeight: 700, color: f.c || '#f0f6ff' }}>{f.v}</div>
              </div>
            ) })}
          </div>
          {options && options.primary && (
            <div style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={S({ color: '#a78bfa', marginBottom: 6 })}>Recommended Contract</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, fontFamily: '"DM Mono",monospace' }}>
                <div>
                  <div style={{ color: '#f0f6ff', fontWeight: 700 }}>{options.primary.displayName}</div>
                  <div style={{ color: '#4a5c7a', fontSize: 9 }}>Delta {options.primary.delta} | Est. ${options.primary.estPremium} | {options.primary.contracts} ct</div>
                  <div style={{ color: '#f59e0b', fontSize: 9 }}>Max Risk: {options.primary.maxRisk} | {options.strategy}</div>
                </div>
                <div>
                  <div style={{ color: '#6b7a90', fontSize: 9 }}>Aggressive:</div>
                  <div style={{ color: '#f0f6ff', fontSize: 10 }}>{options.aggressive.displayName}</div>
                  <div style={{ color: '#4a5c7a', fontSize: 9 }}>Delta {options.aggressive.delta} | Est. ${options.aggressive.estPremium}</div>
                </div>
              </div>
              {options.note && <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 4 }}>{options.note}</div>}
            </div>
          )}
        </div>
      )}

      {/* Intelligent Scanner Activity Log */}
      <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={S({ color: '#3b82f6', marginBottom: 0 })}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', marginRight: 6, animation: 'pulse 1s infinite' }} />
            Live Intelligence Feed
          </div>
          <span style={{ fontSize: 9, color: '#2a3441' }}>15s scan | 60s market | {lastScanTime ? lastScanTime.toLocaleTimeString() : '--'}</span>
        </div>
        <div style={{ maxHeight: 160, overflow: 'auto' }}>
          {scanLog.map(function(entry, i) { return (
            <div key={i} style={{ fontSize: 10, fontFamily: '"DM Mono",monospace', color: logColor(entry.type), padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.02)', lineHeight: 1.4 }}>
              <span style={{ color: '#2a3441', marginRight: 8 }}>{entry.time}</span>
              {entry.msg}
            </div>
          ) })}
        </div>
      </div>

      {/* Market-wide opportunities */}
      {marketScan && marketScan.opportunities && marketScan.opportunities.length > 0 && (
        <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={S({ color: '#f59e0b', marginBottom: 0 })}>Market Opportunities ({marketScan.qualified} of {marketScan.scanned} qualified)</div>
            <span style={{ fontSize: 9, color: '#2a3441' }}>{marketScan.totalTimeMs}ms</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>

        {/* P1: V3 Deep Scan Alert for top opportunity */}
        {deepAlert && deepAlert.alert && (
          <div style={{background: deepAlert.alert.direction === "BULLISH" ? "#0f3d0f" : "#3d0f0f", borderRadius: 12, padding: "16px 20px", marginBottom: 16, border: "1px solid " + (deepAlert.alert.direction === "BULLISH" ? "#1a6b1a" : "#6b1a1a")}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8}}>
              <span style={{fontWeight: 700, fontSize: 16, color: deepAlert.alert.direction === "BULLISH" ? "#4ade80" : "#f87171"}}>{deepAlert.alert.direction === "BULLISH" ? "BULL" : "BEAR"} ALERT: {deepAlert.symbol}</span>
              <span style={{background: deepAlert.alert.grade === "A+" || deepAlert.alert.grade === "A" ? "#166534" : "#854d0e", color: "#fff", padding: "2px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600}}>Grade {deepAlert.alert.grade} | {deepAlert.alert.confluencePct}%</span>
            </div>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 13}}>
              <div><span style={{color: "#9ca3af"}}>Entry</span><br/><span style={{color: "#fff", fontWeight: 600}}>${deepAlert.alert.entry}</span></div>
              <div><span style={{color: "#9ca3af"}}>Stop</span><br/><span style={{color: "#f87171", fontWeight: 600}}>${deepAlert.alert.stop}</span></div>
              <div><span style={{color: "#9ca3af"}}>Target</span><br/><span style={{color: "#4ade80", fontWeight: 600}}>${deepAlert.alert.target1}</span></div>
              <div><span style={{color: "#9ca3af"}}>R:R</span><br/><span style={{color: "#fbbf24", fontWeight: 600}}>{deepAlert.alert.target1_rr}:1</span></div>
            </div>
            <div style={{marginTop: 8, fontSize: 11, color: "#9ca3af"}}>{deepAlert.alert.timeframe} | {deepAlert.alert.reasons && deepAlert.alert.reasons.slice(0, 3).join(" | ")}</div>
          </div>
        )}

            {marketScan.opportunities.slice(0, 8).map(function(opp) { return (
              <div key={opp.symbol} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid ' + (opp.direction === 'BULLISH' ? 'rgba(16,185,129,0.2)' : opp.direction === 'BEARISH' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'), borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, fontWeight: 800, color: '#f0f6ff' }}>{opp.symbol}</span>
                  <span style={{ fontSize: 9, color: opp.change > 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{opp.change > 0 ? '+' : ''}{opp.change}%</span>
                </div>
                <div style={{ fontSize: 10, color: '#4a5c7a', fontFamily: '"DM Mono",monospace' }}>${opp.price}</div>
                <div style={{ fontSize: 8, color: opp.score >= 60 ? '#10b981' : '#f59e0b', marginTop: 2 }}>Score {opp.score} {opp.direction}</div>
                <div style={{ fontSize: 8, color: '#3d4e62', marginTop: 1 }}>{opp.signals && opp.signals[0] ? opp.signals[0] : ''}</div>
              </div>
            ) })}
          </div>
        </div>
      )}

      {/* Per-timeframe */}
      <div style={S({ marginBottom: 6 })}>Per-Timeframe Analysis</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 16 }}>
        {['1m', '5m', '15m', '1h', 'D'].map(function(tf) {
          var tfData = ptf[tf] || {}
          var bars = scan && scan.bars ? scan.bars[tf] : 0
          return (
            <div key={tf} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 13, fontWeight: 800 }}>{tf.toUpperCase()}</span>
                <span style={{ fontSize: 9, color: '#3d4e62' }}>{bars} bars</span>
              </div>
              <div style={{ fontSize: 9, color: '#4a5c7a', fontFamily: '"DM Mono",monospace' }}>
                <div>{tfData.ema || 'unknown'}</div>
                <div>MACD: {tfData.macd ? tfData.macd.hist : '--'}</div>
                <div>ADX: {tfData.adx ? tfData.adx.adx : '--'}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Strat cards */}
      {scan && scan.strat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {scan.strat.sss50 && <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}><div style={S({ color: '#f59e0b' })}>SSS50 State</div><div style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, fontWeight: 700, color: scan.strat.sss50.state === 'ACTIVE' ? '#10b981' : '#4a5c7a' }}>{scan.strat.sss50.state}</div><div style={{ fontSize: 9, color: '#3d4e62' }}>{scan.strat.sss50.reason || ''}</div></div>}
          {scan.strat.ftfc && <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}><div style={S({ color: '#a78bfa' })}>FTFC</div><div style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, fontWeight: 700, color: scan.strat.ftfc.ftfc === 'BULLISH' ? '#10b981' : scan.strat.ftfc.ftfc === 'BEARISH' ? '#ef4444' : '#4a5c7a' }}>{scan.strat.ftfc.ftfc}</div><div style={{ fontSize: 9, color: '#3d4e62' }}>{scan.strat.ftfc.bullPct}% bull / {scan.strat.ftfc.bearPct}% bear</div></div>}
          {scan.strat.combo && <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}><div style={S({ color: '#60a5fa' })}>Strat Combo</div><div style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, fontWeight: 700 }}>{scan.strat.combo.combo || '--'}</div><div style={{ fontSize: 9, color: '#3d4e62' }}>{scan.strat.combo.description || ''}</div></div>}
        </div>
      )}

      {/* Cross-links */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[{ label: 'Log Trade', route: '/app/journal', c: '#60a5fa' }, { label: 'Risk Calc', route: '/app/risk', c: '#ef4444' }, { label: 'Strategies', route: '/app/strategies', c: '#a78bfa' }, { label: 'Command Center', route: '/app/command-center', c: '#10b981' }].map(function(l) { return (
          <button key={l.label} onClick={function() { navigate(l.route) }} style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid ' + l.c + '33', borderRadius: 8, color: l.c, fontSize: 11, cursor: 'pointer' }}>{l.label}</button>
        ) })}
      </div>
      <div style={{ fontSize: 10, color: '#2a3441' }}>Source: {scan ? scan.dataSource : '--'} | Price: {priceSource || '--'} | Scans: {scanCount}</div>
    </div>
  )
}
