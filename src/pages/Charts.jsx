import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const TFS = [
  { label: '1D', ts: 'minute', m: 1, days: 1, lim: 390 },
  { label: '5D', ts: 'minute', m: 5, days: 5, lim: 390 },
  { label: '1M', ts: 'hour', m: 1, days: 30, lim: 720 },
  { label: '3M', ts: 'day', m: 1, days: 90, lim: 90 },
  { label: '6M', ts: 'day', m: 1, days: 180, lim: 180 },
  { label: '1Y', ts: 'day', m: 1, days: 365, lim: 365 },
]

// ── Indicator math ──────────────────────────────────────────────────────────
function calcSMA(closes, period) {
  return closes.map((_, i) =>
    i < period - 1 ? null : closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period
  )
}
function calcEMA(closes, period) {
  const k = 2 / (period + 1)
  const result = Array(closes.length).fill(null)
  const start = closes.findIndex((_, i) => i >= period - 1)
  if (start < 0) return result
  result[start] = closes.slice(0, start + 1).reduce((a, b) => a + b) / (start + 1)
  for (let i = start + 1; i < closes.length; i++) result[i] = closes[i] * k + result[i - 1] * (1 - k)
  return result
}
function calcRSI(closes, period = 14) {
  const result = Array(closes.length).fill(null)
  if (closes.length < period + 1) return result
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses -= d
  }
  let avgGain = gains / period, avgLoss = losses / period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}
function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(closes, fast)
  const emaSlow = calcEMA(closes, slow)
  const macdLine = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  )
  const validMacd = macdLine.filter(v => v != null)
  const signalLine = Array(macdLine.length).fill(null)
  const firstValidIdx = macdLine.findIndex(v => v != null)
  if (firstValidIdx < 0 || validMacd.length < signal) return { macdLine, signalLine, histogram: macdLine.map(() => null) }
  const sigEMA = calcEMA(validMacd, signal)
  let vi = 0
  for (let i = firstValidIdx; i < macdLine.length; i++) {
    if (sigEMA[vi] != null) signalLine[i] = sigEMA[vi]
    vi++
  }
  const histogram = macdLine.map((v, i) =>
    v != null && signalLine[i] != null ? v - signalLine[i] : null
  )
  return { macdLine, signalLine, histogram }
}
function calcBollinger(closes, period = 20, mult = 2) {
  const sma = calcSMA(closes, period)
  return closes.map((_, i) => {
    if (sma[i] == null) return { upper: null, middle: null, lower: null }
    const slice = closes.slice(i - period + 1, i + 1)
    const std = Math.sqrt(slice.reduce((a, v) => a + Math.pow(v - sma[i], 2), 0) / period)
    return { upper: sma[i] + mult * std, middle: sma[i], lower: sma[i] - mult * std }
  })
}

// ── Mini canvas chart components ─────────────────────────────────────────────
function IndicatorPanel({ label, data, color = '#60a5fa', height = 80, type = 'line', overbought, oversold, zeroline }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !data?.length) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth, H = height
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const valid = data.filter(v => v != null && !isNaN(v))
    if (!valid.length) return
    const min = Math.min(...valid), max = Math.max(...valid)
    const range = max - min || 1
    const pad = { t: 6, b: 6, l: 50, r: 8 }
    const w = W - pad.l - pad.r, h = H - pad.t - pad.b
    const x = i => pad.l + (i / (data.length - 1)) * w
    const y = v => pad.t + h - ((v - min) / range) * h

    // Background
    ctx.fillStyle = 'rgba(13,20,32,0.5)'
    ctx.fillRect(0, 0, W, H)

    // Gridlines + levels
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    if (overbought != null) {
      ctx.beginPath(); ctx.moveTo(pad.l, y(overbought)); ctx.lineTo(W - pad.r, y(overbought)); ctx.strokeStyle = 'rgba(239,68,68,0.25)'; ctx.stroke()
      ctx.fillStyle = 'rgba(239,68,68,0.5)'; ctx.font = '9px DM Mono, monospace'; ctx.fillText(overbought, 2, y(overbought) + 3)
    }
    if (oversold != null) {
      ctx.beginPath(); ctx.moveTo(pad.l, y(oversold)); ctx.lineTo(W - pad.r, y(oversold)); ctx.strokeStyle = 'rgba(16,185,129,0.25)'; ctx.stroke()
      ctx.fillStyle = 'rgba(16,185,129,0.5)'; ctx.font = '9px DM Mono, monospace'; ctx.fillText(oversold, 2, y(oversold) + 3)
    }
    if (zeroline) {
      const zy = y(0)
      if (zy > pad.t && zy < H - pad.b) {
        ctx.beginPath(); ctx.moveTo(pad.l, zy); ctx.lineTo(W - pad.r, zy); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([])
      }
    }

    // Draw data
    if (type === 'histogram') {
      data.forEach((v, i) => {
        if (v == null) return
        const barX = x(i), barW = Math.max(1, w / data.length - 1)
        const barY = v >= 0 ? y(v) : y(0), barH = Math.abs(y(v) - y(0))
        ctx.fillStyle = v >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'
        ctx.fillRect(barX - barW / 2, barY, barW, barH || 1)
      })
    } else {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5
      let started = false
      data.forEach((v, i) => {
        if (v == null) { started = false; return }
        if (!started) { ctx.moveTo(x(i), y(v)); started = true } else ctx.lineTo(x(i), y(v))
      })
      ctx.stroke()
    }

    // Label + current value
    const last = [...data].reverse().find(v => v != null)
    ctx.fillStyle = '#4a5c7a'; ctx.font = 'bold 9px DM Mono, monospace'
    ctx.fillText(label, pad.l + 4, 14)
    if (last != null) {
      const valColor = overbought && last > overbought ? '#ef4444' : oversold && last < oversold ? '#10b981' : color
      ctx.fillStyle = valColor; ctx.font = 'bold 10px DM Mono, monospace'
      ctx.fillText(last.toFixed(2), W - pad.r - 40, 14)
    }
  }, [data, height, type, overbought, oversold, zeroline, color, label])

  return <canvas ref={ref} style={{ width: '100%', height, display: 'block', borderTop: '1px solid rgba(255,255,255,0.06)' }} />
}

// ── Main Charts page ──────────────────────────────────────────────────────────
export default function Charts() {
  const [symbol, setSymbol] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('symbol') || 'SPY'
  })
  const [input, setInput] = useState(symbol)
  const [tf, setTf] = useState('3M')
  const [bars, setBars] = useState([])
  const [loading, setLoading] = useState(false)
  const [quote, setQuote] = useState(null)
  const [indicators, setIndicators] = useState({ ema20: true, ema50: true, ema200: false, bb: false, volume: true, rsi: true, macd: false })
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const chartRef = useRef(null)
  const chartInstance = useRef(null)
  const seriesRef = useRef({})

  // Fetch OHLCV data
  const fetchBars = useCallback(async (sym, tfLabel) => {
    setLoading(true)
    setBars([])
    const tfObj = TFS.find(t => t.label === tfLabel) || TFS[3]
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = session ? { 'Authorization': 'Bearer ' + session.access_token } : {}
      const r = await fetch(`/api/market?action=history&symbol=${sym}&timespan=${tfObj.ts}&multiplier=${tfObj.m}&days=${tfObj.days}&limit=${tfObj.lim}`, { headers })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const d = await r.json()
      const rawBars = d.bars || d.results || []
      if (rawBars.length > 0) {
        setBars(rawBars)
        setQuote({ symbol: sym, price: rawBars[rawBars.length - 1].c, change: rawBars[rawBars.length - 1].c - rawBars[rawBars.length - 2]?.c || 0 })
      }
    } catch (e) {
      console.error('Chart fetch error:', e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchBars(symbol, tf) }, [symbol, tf])

  // Build lightweight-charts
  useEffect(() => {
    if (!chartRef.current || bars.length === 0) return
    if (typeof window.LightweightCharts === 'undefined') return

    // Clean up previous
    if (chartInstance.current) { try { chartInstance.current.remove() } catch(e) {} }
    chartInstance.current = null; seriesRef.current = {}

    const chart = window.LightweightCharts.createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 420,
      layout: { background: { color: '#080c14' }, textColor: '#4a5c7a' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true },
    })
    chartInstance.current = chart

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    })
    const candleData = bars.map(b => ({
      time: Math.floor((b.t || b.timestamp) / 1000),
      open: b.o, high: b.h, low: b.l, close: b.c
    })).filter(b => b.open && b.close).sort((a, b) => a.time - b.time)
    candleSeries.setData(candleData)
    seriesRef.current.candle = candleSeries

    const closes = candleData.map(b => b.close)
    const times = candleData.map(b => b.time)
    const toSeries = (arr) => arr.map((v, i) => v != null ? { time: times[i], value: v } : null).filter(Boolean)

    // Volume
    if (indicators.volume) {
      const volSeries = chart.addHistogramSeries({ color: 'rgba(96,165,250,0.3)', priceFormat: { type: 'volume' }, priceScaleId: 'vol', scaleMargins: { top: 0.85, bottom: 0 } })
      volSeries.setData(bars.map((b, i) => ({
        time: times[i],
        value: b.v || b.volume || 0,
        color: b.c >= b.o ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'
      })).filter(b => b.time))
    }

    // EMAs
    if (indicators.ema20) {
      const ema20 = chart.addLineSeries({ color: '#60a5fa', lineWidth: 1, priceLineVisible: false })
      ema20.setData(toSeries(calcEMA(closes, 20)))
    }
    if (indicators.ema50) {
      const ema50 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false })
      ema50.setData(toSeries(calcEMA(closes, 50)))
    }
    if (indicators.ema200) {
      const ema200 = chart.addLineSeries({ color: '#a78bfa', lineWidth: 1, priceLineVisible: false })
      ema200.setData(toSeries(calcEMA(closes, 200)))
    }

    // Bollinger Bands
    if (indicators.bb) {
      const bb = calcBollinger(closes)
      const upper = chart.addLineSeries({ color: 'rgba(99,102,241,0.5)', lineWidth: 1, priceLineVisible: false })
      const lower = chart.addLineSeries({ color: 'rgba(99,102,241,0.5)', lineWidth: 1, priceLineVisible: false })
      upper.setData(toSeries(bb.map(b => b.upper)))
      lower.setData(toSeries(bb.map(b => b.lower)))
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (chartRef.current && chartInstance.current) {
        chartInstance.current.applyOptions({ width: chartRef.current.clientWidth })
      }
    })
    ro.observe(chartRef.current)
    return () => ro.disconnect()
  }, [bars, indicators])

  // Computed indicator data for canvas panels
  const closes = bars.map(b => b.c)
  const rsiData = closes.length >= 15 ? calcRSI(closes) : []
  const macdData = closes.length >= 30 ? calcMACD(closes) : { macdLine: [], signalLine: [], histogram: [] }

  async function runAnalysis() {
    setAnalyzing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`/api/analysis?type=single&symbol=${symbol}`, {
        headers: session ? { 'Authorization': 'Bearer ' + session.access_token } : {}
      })
      if (r.ok) { const d = await r.json(); setAnalysis(d) }
    } catch (e) { console.error(e) }
    setAnalyzing(false)
  }

  const btnStyle = (active) => ({
    padding: '4px 10px', background: active ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? 'rgba(37,99,235,0.4)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 5, color: active ? '#60a5fa' : '#4a5c7a',
    fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono", monospace',
  })
  const toggle = (key) => setIndicators(p => ({ ...p, [key]: !p[key] }))

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans", sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 2px' }}>Charts</h1>
          {quote && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 22, fontWeight: 700 }}>${quote.price?.toFixed(2)}</span>
              <span style={{ color: quote.change >= 0 ? '#10b981' : '#ef4444', fontSize: 13, fontFamily: '"DM Mono",monospace' }}>
                {quote.change >= 0 ? '+' : ''}{quote.change?.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Symbol search */}
        <form onSubmit={e => { e.preventDefault(); setSymbol(input.toUpperCase().trim()) }} style={{ display: 'flex', gap: 6 }}>
          <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
            style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f6ff', fontSize: 14, fontFamily: '"DM Mono",monospace', width: 110, outline: 'none' }}
            placeholder="SYMBOL" />
          <button type="submit" style={{ padding: '8px 16px', background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8, color: '#60a5fa', fontSize: 12, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>Go</button>
        </form>
      </div>

      {/* Timeframe + Indicator toggles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {TFS.map(t => (
          <button key={t.label} style={btnStyle(tf === t.label)} onClick={() => setTf(t.label)}>{t.label}</button>
        ))}
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
        {[['EMA20','ema20'],['EMA50','ema50'],['EMA200','ema200'],['BB','bb'],['Vol','volume'],['RSI','rsi'],['MACD','macd']].map(([lbl,key]) => (
          <button key={key} style={btnStyle(indicators[key])} onClick={() => toggle(key)}>{lbl}</button>
        ))}
        <button onClick={runAnalysis} disabled={analyzing} style={{ ...btnStyle(false), marginLeft: 'auto', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)' }}>
          {analyzing ? '⟳ Analyzing...' : '⚡ AI Analysis'}
        </button>
      </div>

      {/* Main chart */}
      <div style={{ background: '#080c14', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 0 }}>
        {loading && (
          <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3d4e62', fontFamily: '"DM Mono",monospace', fontSize: 12 }}>
            Loading {symbol}...
          </div>
        )}
        <div ref={chartRef} style={{ width: '100%', display: loading ? 'none' : 'block' }} />

        {/* RSI panel */}
        {indicators.rsi && rsiData.length > 0 && (
          <IndicatorPanel label="RSI(14)" data={rsiData} color="#a78bfa" height={80} overbought={70} oversold={30} />
        )}

        {/* MACD panels */}
        {indicators.macd && macdData.macdLine.length > 0 && (
          <>
            <div style={{ position: 'relative' }}>
              <IndicatorPanel label="MACD" data={macdData.macdLine} color="#60a5fa" height={70} zeroline />
              {/* Signal line drawn on same panel — overlay with second canvas is complex so we show separately */}
            </div>
            <IndicatorPanel label="Signal" data={macdData.signalLine} color="#f59e0b" height={40} zeroline />
            <IndicatorPanel label="Histogram" data={macdData.histogram} color="#10b981" height={60} type="histogram" zeroline />
          </>
        )}
      </div>

      {/* Current indicator readings */}
      {(indicators.rsi || indicators.macd) && closes.length > 0 && (
        <div style={{ display: 'flex', gap: 16, padding: '10px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {indicators.rsi && rsiData.length > 0 && (() => {
            const rsiVal = [...rsiData].reverse().find(v => v != null)
            return rsiVal && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>RSI(14)</span>
                <span style={{ fontFamily: '"DM Mono",monospace', fontWeight: 700, fontSize: 14, color: rsiVal > 70 ? '#ef4444' : rsiVal < 30 ? '#10b981' : '#a78bfa' }}>{rsiVal.toFixed(1)}</span>
                <span style={{ fontSize: 9, color: rsiVal > 70 ? '#ef4444' : rsiVal < 30 ? '#10b981' : '#4a5c7a' }}>{rsiVal > 70 ? 'OVERBOUGHT' : rsiVal < 30 ? 'OVERSOLD' : 'NEUTRAL'}</span>
              </div>
            )
          })()}
          {indicators.macd && macdData.histogram.length > 0 && (() => {
            const hist = [...macdData.histogram].reverse().find(v => v != null)
            const macdVal = [...macdData.macdLine].reverse().find(v => v != null)
            return hist != null && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>MACD</span>
                <span style={{ fontFamily: '"DM Mono",monospace', fontWeight: 700, fontSize: 14, color: hist >= 0 ? '#10b981' : '#ef4444' }}>{macdVal?.toFixed(3)}</span>
                <span style={{ fontSize: 9, color: hist >= 0 ? '#10b981' : '#ef4444' }}>{hist >= 0 ? 'BULLISH' : 'BEARISH'}</span>
              </div>
            )
          })()}
          {(() => {
            const ema20 = calcEMA(closes, 20)
            const ema50 = calcEMA(closes, 50)
            const e20 = [...ema20].reverse().find(v => v != null)
            const e50 = [...ema50].reverse().find(v => v != null)
            const last = closes[closes.length - 1]
            if (!e20 || !e50 || !last) return null
            const trend = last > e20 && e20 > e50 ? 'BULLISH STACK' : last < e20 && e20 < e50 ? 'BEARISH STACK' : 'MIXED'
            return (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>EMA TREND</span>
                <span style={{ fontSize: 10, fontFamily: '"DM Mono",monospace', color: trend.includes('BULL') ? '#10b981' : trend.includes('BEAR') ? '#ef4444' : '#f59e0b' }}>{trend}</span>
              </div>
            )
          })()}
        </div>
      )}

      {/* AI Analysis panel */}
      {analysis && (
        <div style={{ marginTop: 10, padding: '14px 16px', background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, color: '#60a5fa', fontWeight: 700 }}>⚡ AI Analysis — {symbol}</span>
            <button onClick={() => setAnalysis(null)} style={{ background: 'none', border: 'none', color: '#3d4e62', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          <div style={{ color: '#9ab', fontSize: 12, lineHeight: 1.7 }}>
            {analysis.analysis || analysis.summary || JSON.stringify(analysis).substring(0, 400)}
          </div>
        </div>
      )}
    </div>
  )
}
