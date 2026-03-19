import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Journal() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    symbol: '', direction: 'LONG', entry_price: '', exit_price: '',
    quantity: '', pnl: '', setup: '', notes: '', emotion: 'neutral', date: new Date().toISOString().split('T')[0]
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadEntries()
  }, [user])

  async function loadEntries() {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(100)
    if (!error && data) setEntries(data)
    setLoading(false)
  }

  async function saveEntry(e) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    const pnl = form.pnl || ((parseFloat(form.exit_price) - parseFloat(form.entry_price)) * parseFloat(form.quantity) * (form.direction === 'LONG' ? 1 : -1)).toFixed(2)
    const { error } = await supabase.from('journal_entries').insert({
      user_id: user.id, ...form, pnl: parseFloat(pnl) || 0
    })
    if (!error) {
      setForm({ symbol:'',direction:'LONG',entry_price:'',exit_price:'',quantity:'',pnl:'',setup:'',notes:'',emotion:'neutral',date:new Date().toISOString().split('T')[0] })
      setShowForm(false)
      loadEntries()
    }
    setSaving(false)
  }

  const totalPnl = entries.reduce((sum, e) => sum + (e.pnl || 0), 0)
  const winners = entries.filter(e => e.pnl > 0).length
  const winRate = entries.length ? ((winners / entries.length) * 100).toFixed(1) : '0'
  const avgPnl = entries.length ? (totalPnl / entries.length).toFixed(2) : '0'

  const s = {
    page: { padding: '24px', fontFamily: '"DM Mono", monospace' },
    header: { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 },
    h1: { color:'#e2e8f0',fontSize:20,margin:0 },
    btn: { background:'#2563eb',color:'white',border:'none',borderRadius:8,padding:'8px 16px',fontSize:12,cursor:'pointer' },
    stats: { display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24 },
    statCard: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,padding:'16px' },
    statLabel: { color:'#4a5c7a',fontSize:11,marginBottom:6 },
    statVal: (pos) => ({ color: pos === undefined ? '#e2e8f0' : pos >= 0 ? '#10b981' : '#ef4444', fontSize:20, fontWeight:700 }),
    table: { width:'100%',borderCollapse:'collapse' },
    th: { color:'#4a5c7a',fontSize:11,padding:'8px 12px',textAlign:'left',borderBottom:'1px solid #1e2d3d' },
    td: { color:'#8b9fc0',fontSize:12,padding:'10px 12px',borderBottom:'1px solid #0d1520' },
    pnlCell: (v) => ({ color: v >= 0 ? '#10b981' : '#ef4444', fontWeight:600, fontSize:12, padding:'10px 12px', borderBottom:'1px solid #0d1520' }),
    form: { background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:12,padding:24,marginBottom:24 },
    input: { background:'#141b24',border:'1px solid #1e2d3d',borderRadius:6,padding:'8px 10px',color:'#e2e8f0',fontSize:12,fontFamily:'"DM Mono",monospace',width:'100%',boxSizing:'border-box' },
    label: { color:'#4a5c7a',fontSize:11,marginBottom:4,display:'block' },
    grid: { display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:12 },
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.h1}>📓 Trading Journal</h1>
        <button style={s.btn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Entry'}
        </button>
      </div>

      <div style={s.stats}>
        {[
          { label: 'Total P&L', val: '$' + totalPnl.toFixed(2), pos: totalPnl },
          { label: 'Win Rate', val: winRate + '%', pos: parseFloat(winRate) - 50 },
          { label: 'Avg P&L', val: '$' + avgPnl, pos: parseFloat(avgPnl) },
          { label: 'Total Trades', val: entries.length, pos: undefined },
        ].map(({ label, val, pos }) => (
          <div key={label} style={s.statCard}>
            <div style={s.statLabel}>{label}</div>
            <div style={s.statVal(pos)}>{val}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={saveEntry} style={s.form}>
          <h3 style={{ color:'#e2e8f0',margin:'0 0 16px',fontSize:14 }}>Log Trade</h3>
          <div style={s.grid}>
            {[['Symbol','symbol','text'],['Entry Price','entry_price','number'],['Exit Price','exit_price','number'],['Quantity','quantity','number'],['P&L (auto)','pnl','number'],['Date','date','date']].map(([label,key,type]) => (
              <div key={key}>
                <label style={s.label}>{label}</label>
                <input style={s.input} type={type} step="any" value={form[key]} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} placeholder={label} />
              </div>
            ))}
          </div>
          <div style={{ ...s.grid, gridTemplateColumns:'repeat(2,1fr)' }}>
            <div>
              <label style={s.label}>Direction</label>
              <select style={s.input} value={form.direction} onChange={e => setForm(f => ({...f,direction:e.target.value}))}>
                <option>LONG</option><option>SHORT</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Emotion</label>
              <select style={s.input} value={form.emotion} onChange={e => setForm(f => ({...f,emotion:e.target.value}))}>
                <option value="neutral">Neutral</option><option value="confident">Confident</option><option value="fearful">Fearful</option><option value="greedy">Greedy</option><option value="fomo">FOMO</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={s.label}>Setup / Strategy</label>
            <input style={s.input} value={form.setup} onChange={e => setForm(f => ({...f,setup:e.target.value}))} placeholder="e.g. Breakout, Mean Reversion..." />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={s.label}>Notes</label>
            <textarea style={{...s.input,height:64,resize:'vertical'}} value={form.notes} onChange={e => setForm(f => ({...f,notes:e.target.value}))} placeholder="What did you learn?" />
          </div>
          <button type="submit" disabled={saving} style={{...s.btn,opacity:saving?0.6:1}}>
            {saving ? 'Saving...' : 'Save Trade'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ color:'#4a5c7a',fontSize:13,textAlign:'center',padding:40 }}>Loading journal...</div>
      ) : entries.length === 0 ? (
        <div style={{ color:'#4a5c7a',fontSize:13,textAlign:'center',padding:60 }}>
          <div style={{ fontSize:32,marginBottom:12 }}>📓</div>
          <div>No trades logged yet.</div>
          <div style={{ marginTop:8,fontSize:12 }}>Click + New Entry to log your first trade.</div>
        </div>
      ) : (
        <div style={{ background:'#0d1117',border:'1px solid #1e2d3d',borderRadius:10,overflow:'hidden' }}>
          <table style={s.table}>
            <thead>
              <tr>{['Date','Symbol','Dir','Entry','Exit','Qty','P&L','Setup','Emotion'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ background:'transparent' }}>
                  <td style={s.td}>{e.date}</td>
                  <td style={{ ...s.td, color:'#60a5fa', fontWeight:600 }}>{e.symbol}</td>
                  <td style={{ ...s.td, color: e.direction === 'LONG' ? '#10b981' : '#ef4444' }}>{e.direction}</td>
                  <td style={s.td}>{e.entry_price}</td>
                  <td style={s.td}>{e.exit_price}</td>
                  <td style={s.td}>{e.quantity}</td>
                  <td style={s.pnlCell(e.pnl)}>{e.pnl >= 0 ? '+' : ''}{e.pnl?.toFixed(2)}</td>
                  <td style={s.td}>{e.setup || '—'}</td>
                  <td style={s.td}>{e.emotion || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
