/**
 * useMarket — Shared real-time price context for AnkushAI
 *
 * Single price feed shared across all pages.
 * One /api/quotes call every 30s, all components subscribe.
 *
 * Usage:
 *   const { quotes, getQuote, session, loading, lastUpdate } = useMarket()
 *   const spy = getQuote('SPY')  // → { price, changePct, ... }
 */

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'

const DEFAULT_SYMBOLS = ['SPY','QQQ','AAPL','NVDA','TSLA','MSFT','META','AMZN','AMD','GOOGL']

const MarketContext = createContext(null)

export function MarketProvider({ children, symbols = DEFAULT_SYMBOLS }) {
  const [quotes,     setQuotes]     = useState({})
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [session,    setSession]    = useState('closed')
  const timerRef = useRef(null)

  const fetchQuotes = useCallback(async () => {
    try {
      const r = await fetch('/api/quotes?symbols=' + symbols.join(','))
      if (!r.ok) { setError('Data unavailable'); return }
      const data = await r.json()
      if (data.error) { setError(data.message || 'Error'); return }
      if (!Array.isArray(data)) return
      const map = {}
      data.forEach(q => { map[q.symbol] = q })
      setQuotes(map)
      setError(null)
      setLastUpdate(new Date())
      setSession(data[0]?.session || 'closed')
      setLoading(false)
    } catch(e) {
      setError(e.message)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQuotes()
    timerRef.current = setInterval(fetchQuotes, 30000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchQuotes])

  const getQuote = useCallback((symbol) => quotes[symbol?.toUpperCase()] || null, [quotes])

  return (
    <MarketContext.Provider value={{ quotes, getQuote, session, loading, error, lastUpdate, refresh: fetchQuotes }}>
      {children}
    </MarketContext.Provider>
  )
}

export function useMarket() {
  const ctx = useContext(MarketContext)
  return ctx || { quotes:{}, getQuote:()=>null, session:'closed', loading:false, error:null, lastUpdate:null, refresh:()=>{} }
}

export function useQuote(symbol) {
  const { getQuote, loading } = useMarket()
  return { quote: symbol ? getQuote(symbol) : null, loading }
}
