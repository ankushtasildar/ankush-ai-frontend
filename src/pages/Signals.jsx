import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'

const WATCHLIST = ['SPY','QQQ','AAPL','TSLA','NVDA','MSFT','AMZN','META','GOOGL','AMD']

export default function Signals() {
  const { user } = useAuth()
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    fetchQuotes()
    const id = setInterval(fetchQuotes, 30000)
    return () => clearInterval(id)
  }, [])

  async function fetchQuotes() {
    try {
      const r = await fetch('/api/quotes?symbols=' + WATCHLIST.join(','))
      if (r.ok) { setQuotes(await r.json()); setLastUpdate(new Date()) }
    } catch(e) { console.error('Quotes error:', e) }
    finally { setLoading(false) }
  }

  const filtered = filter === 'ALL' ? quotes : quotes.filter(q => q.signal === filter)

  return (
    <div style={{ padding:24, fontFamily:'"DM Mono",monospace', minHeight:'100vh' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
        <div>
          <h1 style={{ color:'#e2e8f0',fontSize:20,margin:0 }}>⚡ Live Signals</h1>
          <div style={{ color:'#4a5c7a',fontSize:11,marginTop:4 }}>
            <span style={{ display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#10b981',marginRight:6,animation:'pulse 2s infinite' }} />
            {lastUpdate ? 'Updated ' + lastUpdate.toLocaleTimeString() : 'Loading...'} · Auto-refresh 30s
          </div>
        </div>
        <button onClick={fetchQuotes} style={{ background:'#1e2d3d',border:'none',color:'#8b9fc0',padding:'7px 14px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit' }}>
          ↻ Refresh
        </button>
      </div>

      <div style={{ display:'flex',gap:8,marginBottom:20 }}>
        {['ALL','BUY','SELL','HOLD'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding:'6px 14px',borderRadius:6,border:'1px solid',fontSize:11,cursor:'pointer',fontFamily:'inherit',background:filter===f?'#1e40af':'transparent',color:filter===f?'#93c5fd':'#4a5c7a',borderColor:filter===f?'#1e40af':'#1e2d3d' }}>{f}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:300,color:'#4a5c7a',fontSize:13 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:28,marginBottom:12 }}>⚡</div>
            <div>Fetching live market data...</div>
          </div>
        </div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12 }}>
          {filtered.map(q => (
            <div key={q.symbol} style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderLeft:'3px solid '+q.signalColor,borderRadius:10,padding:16 }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8 }}>
                <div>
                  <div style={{ color:'#e2e8f0',fontSize:15,fontWeight:700 }}>{q.symbol}</div>
                  <div style={{ color:'#4a5c7a',fontSize:11 }}>{q.name}</div>
                </div>
                <span style={{ padding:'3px 8px',borderRadius:4,fontSize:11,fontWeight:700,color:q.signalColor,background:q.signalColor+'22',border:'1px solid '+q.signalColor+'44' }}>{q.signal}</span>
              </div>
              <div style={{ color:'#60a5fa',fontSize:20,fontWeight:700,marginBottom:6 }}>${q.price?.toFixed(2)}</div>
              <div style={{ color:q.change>=0?'#10b981':'#ef4444',fontSize:12,marginBottom:8 }}>
                {q.change>=0?'+':''}{q.change?.toFixed(2)} ({q.changePct>=0?'+':''}{q.changePct?.toFixed(2)}%)
              </div>
              <div style={{ color:'#4a5c7a',fontSize:11 }}>
                Vol: {q.volume?(q.volume/1e6).toFixed(1)+'M':'—'} · {q.reason}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
