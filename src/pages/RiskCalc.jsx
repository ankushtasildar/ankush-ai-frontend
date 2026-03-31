import { useState, useMemo } from 'react'

const fmt = (n, dec=2) => n == null || isNaN(n) ? 'Ã¢ÂÂ' : Number(n).toLocaleString('en-US', {minimumFractionDigits:dec, maximumFractionDigits:dec})
const fmtDollar = n => isNaN(n) || n == null ? '$Ã¢ÂÂ' : '$' + fmt(Math.abs(n))

export default function RiskCalc() {
  const [mode, setMode] = useState('stock') // stock | options | portfolio
  const [accountSize, setAccountSize] = useState(25000)
  const [riskPct, setRiskPct] = useState(1)
  const [entryPrice, setEntryPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [contractCost, setContractCost] = useState('')
  const [delta, setDelta] = useState('')
  const [winRate, setWinRate] = useState(55) // for Kelly
  const [positions, setPositions] = useState([]) // portfolio risk view

  const calc = useMemo(() => {
    const entry = parseFloat(entryPrice)
    const stop = parseFloat(stopPrice)
    const target = parseFloat(targetPrice)
    const account = parseFloat(accountSize)
    const risk = parseFloat(riskPct) / 100
    
    if (!entry || !stop || !account) return null

    const dollarRisk = account * risk
    const riskPerShare = Math.abs(entry - stop)
    const shares = riskPerShare > 0 ? Math.floor(dollarRisk / riskPerShare) : 0
    const totalInvested = shares * entry
    const totalRisk = shares * riskPerShare
    const rrRatio = target ? Math.abs(target - entry) / riskPerShare : null
    
    // Expected value
    const wr = winRate / 100
    const ev = rrRatio ? ((rrRatio * wr) - (1 - wr)).toFixed(3) : null
    
    // Kelly criterion
    const kelly = rrRatio ? ((wr - (1 - wr) / rrRatio)).toFixed(4) : null
    const halfKelly = kelly ? (parseFloat(kelly) / 2 * 100).toFixed(1) : null
    
    // Options mode
    let optContracts = null, optRisk = null, optTarget = null
    if (mode === 'options' && contractCost) {
      const cc = parseFloat(contractCost)
      optContracts = Math.floor(dollarRisk / cc)
      optRisk = optContracts * cc
      const d = parseFloat(delta) || 0.4
      if (target && optContracts > 0) {
        const underlyingMove = target - entry
        const optionMove = underlyingMove * d * 100
        optTarget = optContracts * optionMove
      }
    }

    return {
      dollarRisk, riskPerShare, shares, totalInvested, totalRisk,
      rrRatio, ev, kelly, halfKelly,
      optContracts, optRisk, optTarget,
      pctOfAccount: (totalInvested / account * 100),
      maxLoss: -(totalRisk),
      maxGain: target ? shares * Math.abs(target - entry) : null,
    riskGrade: riskPct <= 1 && rr >= 3 ? 'A+' : riskPct <= 1 && rr >= 2 ? 'A' : riskPct <= 2 && rr >= 2 ? 'B+' : riskPct <= 2 && rr >= 1.5 ? 'B' : riskPct <= 3 ? 'C' : riskPct <= 5 ? 'D' : 'F',
    riskMeterPct: Math.min(100, Math.max(0, (1 - Math.min(riskPct, 5) / 5) * 100)),
    riskMeterColor: riskPct <= 1 ? '#10b981' : riskPct <= 2 ? '#f59e0b' : '#ef4444'
    }
  }, [entryPrice, stopPrice, targetPrice, accountSize, riskPct, mode, contractCost, delta, winRate])

  const inputStyle = { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f6ff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { color: '#4a5c7a', fontSize: 11, marginBottom: 6, display: 'block' }
  const resultStyle = (color='#f0f6ff') => ({ color, fontFamily: '"DM Mono",monospace', fontSize: 16, fontWeight: 700 })

  const tabStyle = (t) => ({ padding: '6px 14px', background: mode === t ? 'rgba(37,99,235,0.12)' : 'none', border: '1px solid ' + (mode === t ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 6, color: mode === t ? '#60a5fa' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' })

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 3px' }}>Ã¢ÂÂ Risk Calculator</h1>
        <div style={{ color: '#3d4e62', fontSize: 11 }}>Position sizing ÃÂ· R/R ratio ÃÂ· Kelly criterion ÃÂ· Expected value</div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[['stock','Stock/ETF'], ['options','Options'], ['portfolio','Portfolio View']].map(([t,l]) => (
          <button key={t} style={tabStyle(t)} onClick={() => setMode(t)}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, maxWidth: 900 }}>
        {/* Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          
          {/* Account */}
          <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 12 }}>ACCOUNT SETTINGS</div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Account Size ($)</label>
              <input type="number" value={accountSize} onChange={e => setAccountSize(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Risk Per Trade ({riskPct}% = {fmtDollar(accountSize * riskPct / 100)})</label>
              <input type="range" min="0.25" max="5" step="0.25" value={riskPct} onChange={e => setRiskPct(e.target.value)} style={{ width: '100%' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3d4e62', fontSize: 9, marginTop: 4 }}>
                <span>0.25%</span><span style={{ color: '#10b981' }}>1% conservative</span><span>5%</span>
              </div>
            </div>
          </div>

          {/* Trade levels */}
          <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 12 }}>TRADE LEVELS</div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Entry Price ($)</label>
              <input type="number" step="0.01" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="e.g. 150.00" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Stop Loss ($)</label>
              <input type="number" step="0.01" value={stopPrice} onChange={e => setStopPrice(e.target.value)} placeholder="e.g. 145.00" style={{ ...inputStyle, borderColor: stopPrice ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)' }} />
            </div>
            <div>
              <label style={labelStyle}>Target Price ($ Ã¢ÂÂ optional)</label>
              <input type="number" step="0.01" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="e.g. 165.00" style={{ ...inputStyle, borderColor: targetPrice ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)' }} />
            </div>
          </div>

          {/* Options inputs */}
          {mode === 'options' && (
            <div style={{ background: '#0d1420', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 16 }}>
              <div style={{ color: '#a5b4fc', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 12 }}>OPTIONS PARAMETERS</div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Contract Cost ($)</label>
                <input type="number" step="0.01" value={contractCost} onChange={e => setContractCost(e.target.value)} placeholder="e.g. 320.00" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Delta (0.1 Ã¢ÂÂ 1.0)</label>
                <input type="number" step="0.01" min="0.1" max="1" value={delta} onChange={e => setDelta(e.target.value)} placeholder="e.g. 0.40" style={inputStyle} />
              </div>
            </div>
          )}

          {/* Kelly win rate */}
          <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
            <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 12 }}>KELLY PARAMETERS</div>
            <label style={labelStyle}>Historical Win Rate ({winRate}%)</label>
            <input type="range" min="30" max="80" step="5" value={winRate} onChange={e => setWinRate(parseInt(e.target.value))} style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3d4e62', fontSize: 9, marginTop: 4 }}>
              <span>30% losing</span><span style={{ color: '#f59e0b' }}>55% edge</span><span>80% elite</span>
            </div>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!calc ? (
            <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 32, textAlign: 'center', color: '#3d4e62' }}>
              Enter entry and stop loss prices to calculate position size
            </div>
          ) : (
            <>
              {/* Main results */}
              <div style={{ background: '#0d1420', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 12, padding: 16 }}>
                <div style={{ color: '#60a5fa', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 14 }}>POSITION SIZING</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Shares to Buy</div>
                    <div style={resultStyle('#f0f6ff')}>{calc.shares.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Total Invested</div>
                    <div style={resultStyle()}>{fmtDollar(calc.totalInvested)}</div>
                    <div style={{ color: '#3d4e62', fontSize: 10 }}>{calc.pctOfAccount.toFixed(1)}% of account</div>
                  </div>
                  <div>
                    <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Max Risk</div>
                    <div style={resultStyle('#ef4444')}>{fmtDollar(calc.maxLoss)}</div>
                    <div style={{ color: '#3d4e62', fontSize: 10 }}>{riskPct}% of account</div>
                  </div>
                </div>
                {calc.maxGain != null && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Max Gain</div>
                      <div style={resultStyle('#10b981')}>{fmtDollar(calc.maxGain)}</div>
                    </div>
                    <div>
                      <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>R/R Ratio</div>
                      <div style={resultStyle(calc.rrRatio >= 2 ? '#10b981' : calc.rrRatio >= 1 ? '#f59e0b' : '#ef4444')}>{calc.rrRatio?.toFixed(2)}:1</div>
                    </div>
                    <div>
                      <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Risk/Share</div>
                      <div style={resultStyle()}>{fmtDollar(calc.riskPerShare)}</div>

        {/* Risk Grade + Compliance Meter */}
        {calc.entry > 0 && calc.stop > 0 && (
          <div style={{marginTop:12,padding:'12px 14px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div>
                <div style={{fontSize:8,color:'#3d4e62',textTransform:'uppercase',letterSpacing:0.5}}>RISK GRADE</div>
                <div style={{fontSize:28,fontWeight:800,fontFamily:'"DM Mono",monospace',color:calc.riskGrade.startsWith('A')?'#10b981':calc.riskGrade.startsWith('B')?'#60a5fa':calc.riskGrade==='C'?'#f59e0b':'#ef4444'}}>{calc.riskGrade}</div>
              </div>
              <div style={{flex:1,marginLeft:16}}>
                <div style={{fontSize:8,color:'#3d4e62',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>RISK COMPLIANCE</div>
                <div style={{height:8,background:'rgba(255,255,255,0.04)',borderRadius:4,overflow:'hidden'}}>
                  <div style={{width:calc.riskMeterPct+'%',height:'100%',background:calc.riskMeterColor,borderRadius:4,transition:'width 0.4s ease'}} />
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
                  <span style={{fontSize:8,color:'#3d4e62'}}>High Risk</span>
                  <span style={{fontSize:8,color:calc.riskMeterColor,fontWeight:600}}>{Math.round(calc.riskMeterPct)}%</span>
                  <span style={{fontSize:8,color:'#3d4e62'}}>Low Risk</span>
                </div>
              </div>
            </div>
            <div style={{fontSize:10,color:'#4a5c7a',lineHeight:1.5}}>
              {calc.riskGrade.startsWith('A') ? 'Excellent risk management. Conservative sizing with strong R:R.' : calc.riskGrade.startsWith('B') ? 'Good setup. Consider tightening stop for better grade.' : calc.riskGrade === 'C' ? 'Acceptable but borderline. Watch position size.' : 'Warning: High risk. Reduce position size or widen R:R.'}
            </div>
          </div>
        )}

                    </div>
                  </div>
                )}
              </div>

              {/* Kelly + EV */}
              {calc.kelly !== null && (
                <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#3d4e62', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 14 }}>KELLY CRITERION & EXPECTED VALUE</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Full Kelly %</div>
                      <div style={resultStyle(parseFloat(calc.kelly) > 0 ? '#f59e0b' : '#ef4444')}>{(parseFloat(calc.kelly) * 100).toFixed(1)}%</div>
                      <div style={{ color: '#3d4e62', fontSize: 9 }}>of account</div>
                    </div>
                    <div>
                      <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Half-Kelly (Safe)</div>
                      <div style={resultStyle('#10b981')}>{parseFloat(calc.halfKelly) > 0 ? calc.halfKelly + '%' : 'Negative edge'}</div>
                      <div style={{ color: '#3d4e62', fontSize: 9 }}>recommended</div>
                    </div>
                    <div>
                      <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Expected Value</div>
                      <div style={resultStyle(parseFloat(calc.ev) > 0 ? '#10b981' : '#ef4444')}>{parseFloat(calc.ev) > 0 ? '+' : ''}{calc.ev}R</div>
                      <div style={{ color: '#3d4e62', fontSize: 9 }}>{parseFloat(calc.ev) > 0 ? 'Positive edge' : 'Negative edge'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Options results */}
              {mode === 'options' && calc.optContracts !== null && (
                <div style={{ background: '#0d1420', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#a5b4fc', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 14 }}>OPTIONS POSITION</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Contracts</div>
                      <div style={resultStyle('#a5b4fc')}>{calc.optContracts}</div>
                    </div>
                    <div>
                      <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Total Premium</div>
                      <div style={resultStyle('#ef4444')}>{fmtDollar(calc.optRisk)}</div>
                    </div>
                    {calc.optTarget && (
                      <div>
                        <div style={{ color: '#4a5c7a', fontSize: 10, marginBottom: 4 }}>Est. Profit at Target</div>
                        <div style={resultStyle('#10b981')}>{fmtDollar(calc.optTarget)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Guidance */}
              <div style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.12)', borderRadius: 12, padding: 14 }}>
                <div style={{ color: '#60a5fa', fontSize: 9, fontFamily: '"DM Mono",monospace', letterSpacing: '.06em', marginBottom: 8 }}>AI RISK GUIDANCE</div>
                <div style={{ color: '#8b9fc0', fontSize: 11, lineHeight: 1.7 }}>
                  {calc.rrRatio < 1 && <div>Ã¢ÂÂ Ã¯Â¸Â R/R ratio below 1:1 Ã¢ÂÂ this trade is not worth taking. Adjust your target or stop.</div>}
                  {calc.rrRatio >= 1 && calc.rrRatio < 1.5 && <div>Ã°ÂÂÂ¡ R/R of {calc.rrRatio?.toFixed(1)}:1 is borderline. Minimum for consistent profitability is 1.5:1.</div>}
                  {calc.rrRatio >= 2 && <div>Ã¢ÂÂ R/R of {calc.rrRatio?.toFixed(1)}:1 is solid. You can be right less than 35% of the time and still be profitable.</div>}
                  {parseFloat(calc.ev) < 0 && <div>Ã¢ÂÂ Ã¯Â¸Â Expected value is negative at this win rate Ã¢ÂÂ skip this trade or improve your entry.</div>}
                  {parseFloat(calc.ev) > 0.2 && <div>Ã¢ÂÂ Strong positive expected value. This is worth trading if your edge is real.</div>}
                  {calc.pctOfAccount > 20 && <div>Ã¢ÂÂ Ã¯Â¸Â Position size is {calc.pctOfAccount.toFixed(0)}% of account Ã¢ÂÂ concentration risk. Consider scaling down.</div>}
                  {parseFloat(calc.halfKelly) > parseFloat(riskPct) && <div>Ã°ÂÂÂ¡ Kelly suggests you could risk up to {calc.halfKelly}% per trade with this win rate and R/R.</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
