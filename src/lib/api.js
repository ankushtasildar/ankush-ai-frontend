// API client — talks to FastAPI backend
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json()
}
export const api = {
  health: () => req('/api/health'),
  signals: { list: (limit = 50) => req(`/api/signals?limit=${limit}`), run: (symbols) => req(`/api/signals/run${symbols ? `?symbols=${symbols}` : ''}`, { method: 'POST' }) },
  portfolio: { list: () => req('/api/portfolio'), add: (pos) => req('/api/portfolio', { method: 'POST', body: JSON.stringify(pos) }), remove: (symbol) => req(`/api/portfolio/${symbol}`, { method: 'DELETE' }) },
  journal: { list: (limit = 100) => req(`/api/journal?limit=${limit}`), add: (entry) => req('/api/journal', { method: 'POST', body: JSON.stringify(entry) }), patterns: () => req('/api/journal/patterns') },
  sentiment: { get: (symbols) => req(`/api/sentiment${symbols ? `?symbols=${symbols}` : ''}`) },
  quotes: { one: (symbol) => req(`/api/quotes/${symbol}`), batch: (symbols) => req(`/api/quotes?symbols=${symbols.join(',')}`) },
  charts: { history: (symbol, days = 90) => req(`/api/charts/${symbol}?days=${days}`) },
  calendar: { list: () => req('/api/calendar'), refresh: () => req('/api/calendar/refresh', { method: 'POST' }) },
  recaps: (limit = 30) => req(`/api/recaps?limit=${limit}`),
  thesis: (symbol, profile = 'swing_tech_30_90dte') => req('/api/thesis', { method: 'POST', body: JSON.stringify({ symbol, profile }) }),
  backtest: { run: (start, end, min_score = 0) => req(`/api/backtest/run?start=${start}&end=${end}&min_score=${min_score}`, { method: 'POST' }), results: () => req('/api/backtest/results') },
  events: { list: (types, limit = 200) => req(`/api/events?limit=${limit}${types ? `&types=${types}` : ''}`) },
}