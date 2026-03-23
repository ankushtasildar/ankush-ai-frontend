
          <StatCard label="Validation Rate" value={stats.validationRate+'%'} sub={stats.validated+' valid / '+stats.invalidated+' invalid'} color={stats.validationRate>=60?'#10b981':stats.validationRate>=50?'#f59e0b':'#ef4444'} />
          
          <StatCard label="Bull Hit Rate" value={stats.bullValidationRate!==null?stats.bullValidationRate+'%':'—'} sub="bullish thesis accuracy" color="#10b981" />
          <StatCard label="Bear Hit Rate" value={stats.bearValidationRate!==null?stats.bearValidationRate+'%':'—'} sub="bearish thesis accuracy" color="#ef4444" />
          <StatCard label="Completed" value={stats.completed} sub={`of ${stats.total} runs`} />
        </div>
      )}
      
      {/* Filters */}
      <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <input value={filter.symbol} onChange={e=>setFilter(f=>({...f,symbol:e.target.value.toUpperCase()}))}
          placeholder="Filter symbol..." style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',color:'var(--text-primary)',fontSize:12,width:120}} />
        <select value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value}))}
          style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',color:'var(--text-primary)',fontSize:12}}>
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
        <select value={filter.validated} onChange={e=>setFilter(f=>({...f,validated:e.target.value}))}
          style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',color:'var(--text-primary)',fontSize:12}}>
          <option value="">All outcomes</option>
          <option value="true">✅ Validated only</option>
          <option value="false">❌ Invalidated only</option>
        </select>
        <button onClick={()=>{setFilter({symbol:'',status:'',validated:''});setPage(0)}}
          style={{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',color:'var(--text-muted)',fontSize:12,cursor:'pointer'}}>
          Clear
        </button>
      </div>
      
      {/* Table */}
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,0.02)'}}>
              {['Date','Symbol','Price','Thesis Dir','Mkt Bias','Thesis','Setup','Target','Stop','1d','5d','10d','20d','Result'].map(h=>(
                <th key={h} style={{padding:'10px 10px',fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',textAlign:'left'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{padding:'40px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Loading training runs...</td></tr>
            ) : runs.length === 0 ? (
              <tr><td colSpan={8} style={{padding:'40px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                No training runs yet. Click "Run Single Training" to start the ML engine.
              </td></tr>
            ) : (
              runs.map(run => <RunRow key={run.run_id||run.id} run={run} onClick={()=>setSelected(run)} />)
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {runs.length === PAGE_SIZE && (
        <div style={{display:'flex',justifyContent:'center',gap:12,marginTop:16}}>
          {page > 0 && <button onClick={()=>setPage(p=>p-1)} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 16px',color:'var(--text-primary)',cursor:'pointer',fontSize:12}}>← Previous</button>}
          <span style={{padding:'7px 12px',color:'var(--text-muted)',fontSize:12}}>Page {page+1}</span>
          <button onClick={()=>setPage(p=>p+1)} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 16px',color:'var(--text-primary)',cursor:'pointer',fontSize:12}}>Next →</button>
        </div>
      )}
      
      {/* Detail modal */}
      {selected && <RunDetail run={selected} onClose={()=>setSelected(null)} />}
    </div>
  )
}
