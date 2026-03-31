import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Course catalog — AI will personalize order based on user data
const COURSES = [
  { id: 'risk_101', title: 'Risk Management Fundamentals', category: 'Core', difficulty: 'Beginner', lessons: 8, icon: '\u{1F6E1}', color: '#10b981', description: 'Position sizing, stop losses, and the Kelly Criterion', prereq: null,
    cards: [
      { q: 'What is the maximum recommended risk per trade for beginners?', a: '1-2% of total account', wrong: ['5-10% of account', '25% of account'] },
      { q: 'What does the Kelly Criterion calculate?', a: 'Optimal position size based on win rate and R:R', wrong: ['When to enter a trade', 'Which stock to buy'] },
      { q: 'If your account is $25,000 and risk is 1%, max loss per trade is:', a: '$250', wrong: ['$2,500', '$25'] },
      { q: 'A stop loss should be placed based on:', a: 'Technical levels (support, structure)', wrong: ['A fixed dollar amount always', 'Wherever feels comfortable'] },
      { q: 'What is R:R ratio?', a: 'Reward divided by Risk (target profit / stop loss distance)', wrong: ['Revenue to Returns', 'Rate of Return'] },
    ]},
  { id: 'options_101', title: 'Options Trading Basics', category: 'Options', difficulty: 'Beginner', lessons: 10, icon: '\u{1F4CA}', color: '#60a5fa', description: 'Calls, puts, Greeks, and basic strategies', prereq: 'risk_101',
    cards: [
      { q: 'A call option gives the right to:', a: 'Buy shares at the strike price', wrong: ['Sell shares at the strike price', 'Hold shares indefinitely'] },
      { q: 'What does Delta measure?', a: 'How much the option price moves per $1 stock move', wrong: ['Time decay per day', 'Volatility sensitivity'] },
      { q: 'Theta represents:', a: 'Daily time decay (how much value the option loses per day)', wrong: ['Directional exposure', 'Volatility exposure'] },
      { q: 'IV Crush happens when:', a: 'Implied volatility drops sharply (usually after earnings)', wrong: ['Stock price crashes', 'Volume dries up'] },
      { q: 'An iron condor profits when:', a: 'Stock stays within a range (low volatility)', wrong: ['Stock moves sharply in one direction', 'Volume increases significantly'] },
    ]},
  { id: 'ta_101', title: 'Technical Analysis Foundations', category: 'Technical', difficulty: 'Beginner', lessons: 12, icon: '\u{1F4C8}', color: '#f59e0b', description: 'Support/resistance, trends, candlesticks, and volume', prereq: null,
    cards: [
      { q: 'A hammer candlestick at support suggests:', a: 'Potential bullish reversal', wrong: ['Bearish continuation', 'No significance'] },
      { q: 'Volume should confirm price by:', a: 'Increasing on breakouts, decreasing on pullbacks', wrong: ['Always being constant', 'Decreasing on breakouts'] },
      { q: 'The 200-day moving average is considered:', a: 'A long-term trend indicator (institutional benchmark)', wrong: ['A day trading signal', 'Irrelevant to most traders'] },
      { q: 'A breakout is more reliable when:', a: 'Accompanied by high volume and closes above resistance', wrong: ['It happens on low volume', 'The price barely crosses the level'] },
      { q: 'Divergence between price and RSI suggests:', a: 'Potential trend reversal (momentum weakening)', wrong: ['Trend continuation', 'Nothing meaningful'] },
    ]},
  { id: 'psychology_101', title: 'Trading Psychology', category: 'Psychology', difficulty: 'Beginner', lessons: 6, icon: '\u{1F9E0}', color: '#a78bfa', description: 'Discipline, FOMO, revenge trading, and emotional control', prereq: null,
    cards: [
      { q: 'Revenge trading happens when:', a: 'You take impulsive trades to recover losses', wrong: ['You carefully plan your next trade', 'You take a break after a loss'] },
      { q: 'The best response after 3 consecutive losses is:', a: 'Stop trading, review journal, identify pattern', wrong: ['Double position size to recover', 'Switch to a different strategy immediately'] },
      { q: 'FOMO leads to:', a: 'Chasing entries at bad prices with poor risk management', wrong: ['Better trade selection', 'Higher win rates'] },
      { q: 'A trading plan should be written:', a: 'Before the market opens, with specific rules', wrong: ['During a trade when you need guidance', 'Only for losing trades'] },
      { q: 'Tilt is best described as:', a: 'Emotional state where discipline breaks down', wrong: ['A winning streak', 'A technical chart pattern'] },
    ]},
  { id: 'the_strat', title: 'The Strat Methodology', category: 'Advanced', difficulty: 'Intermediate', lessons: 8, icon: '\u26A1', color: '#ef4444', description: 'Rob Smith\'s The Strat: FTFC, combos, and actionable signals', prereq: 'ta_101',
    cards: [
      { q: 'In The Strat, a "1" bar means:', a: 'Inside bar (high lower, low higher than previous)', wrong: ['Directional bar up', 'Outside bar'] },
      { q: 'A 2-1-2 combo signals:', a: 'Reversal (directional, pause, then opposite direction)', wrong: ['Continuation', 'No signal'] },
      { q: 'FTFC stands for:', a: 'Full Timeframe Continuity (all timeframes aligned)', wrong: ['First Trade For Confirmation', 'Fibonacci Trend Following Chart'] },
      { q: 'A "3" bar in The Strat means:', a: 'Outside bar (takes out both previous high and low)', wrong: ['Three consecutive green candles', 'Third retest of support'] },
      { q: 'The best Strat setups have:', a: 'FTFC alignment across daily, hourly, and 5-min', wrong: ['Only daily timeframe signal', 'Conflicting timeframe signals'] },
    ]},
  { id: 'earnings_plays', title: 'Earnings Season Strategies', category: 'Options', difficulty: 'Advanced', lessons: 7, icon: '\u{1F4B0}', color: '#f97316', description: 'IV crush, straddles, calendar spreads, and post-earnings plays', prereq: 'options_101',
    cards: [
      { q: 'The best time to sell premium before earnings is:', a: '5-7 days before, when IV is high but not peaking', wrong: ['The day of earnings', '30 days before'] },
      { q: 'After earnings, IV typically:', a: 'Drops sharply (IV crush)', wrong: ['Increases further', 'Stays the same'] },
      { q: 'A calendar spread before earnings profits from:', a: 'Front-month IV crush while back-month retains value', wrong: ['Stock moving significantly', 'Both months crushing equally'] },
      { q: 'Post-earnings drift refers to:', a: 'Stock continuing to move in the earnings reaction direction for days/weeks', wrong: ['Stock always reverting to pre-earnings price', 'IV recovering after crush'] },
    ]},
]

const CATEGORIES = ['All', 'Core', 'Technical', 'Options', 'Psychology', 'Advanced']

export default function Learn() {
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [filter, setFilter] = useState('All')
  const [quizActive, setQuizActive] = useState(false)
  const [quizIdx, setQuizIdx] = useState(0)
  const [quizAnswer, setQuizAnswer] = useState(null)
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 })
  const [progress, setProgress] = useState({})
  const [userWeaknesses, setUserWeaknesses] = useState([])
  const [streakDays, setStreakDays] = useState(0)

  useEffect(() => { loadProgress(); analyzeWeaknesses() }, [])

  async function loadProgress() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('journal_entries').select('content').eq('user_id', user.id).eq('type', 'learning_progress')
      if (data && data.length > 0) {
        try { setProgress(JSON.parse(data[0].content || '{}')) } catch(e) {}
      }
    } catch(e) {}
  }

  async function saveProgress(courseId, score, total) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const updated = { ...progress, [courseId]: { score, total, lastAttempt: new Date().toISOString(), attempts: (progress[courseId]?.attempts || 0) + 1, bestScore: Math.max(score, progress[courseId]?.bestScore || 0) } }
      setProgress(updated)
      await supabase.from('journal_entries').upsert({ user_id: user.id, type: 'learning_progress', symbol: 'learning', content: JSON.stringify(updated), created_at: new Date().toISOString() }, { onConflict: 'user_id,type' })
    } catch(e) {}
  }

  async function analyzeWeaknesses() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: trades } = await supabase.from('journal_entries').select('content').eq('user_id', user.id).eq('type', 'trade').order('created_at', { ascending: false }).limit(50)
      if (!trades || trades.length < 3) return
      const weaknesses = []
      let riskViolations = 0, noStopCount = 0, emotionalCount = 0
      trades.forEach(t => {
        try {
          const d = JSON.parse(t.content || '{}')
          if (d.riskPct && parseFloat(d.riskPct) > 3) riskViolations++
          if (!d.stop && !d.stopLoss) noStopCount++
          if (d.emotion && (d.emotion.includes('fomo') || d.emotion.includes('revenge') || d.emotion.includes('tilt'))) emotionalCount++
        } catch(e) {}
      })
      if (riskViolations > trades.length * 0.3) weaknesses.push({ course: 'risk_101', reason: 'You risk over 3% on ' + Math.round(riskViolations/trades.length*100) + '% of trades' })
      if (noStopCount > trades.length * 0.4) weaknesses.push({ course: 'risk_101', reason: Math.round(noStopCount/trades.length*100) + '% of trades have no stop loss logged' })
      if (emotionalCount > 2) weaknesses.push({ course: 'psychology_101', reason: emotionalCount + ' trades tagged with emotional triggers' })
      setUserWeaknesses(weaknesses)
    } catch(e) {}
  }

  function startQuiz(course) {
    setSelectedCourse(course)
    setQuizActive(true)
    setQuizIdx(0)
    setQuizAnswer(null)
    setQuizScore({ correct: 0, total: 0 })
  }

  function answerQuiz(answer, correct) {
    setQuizAnswer(answer)
    if (answer === correct) setQuizScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
    else setQuizScore(prev => ({ ...prev, total: prev.total + 1 }))
  }

  function nextQuestion() {
    if (selectedCourse && quizIdx < selectedCourse.cards.length - 1) {
      setQuizIdx(quizIdx + 1)
      setQuizAnswer(null)
    } else {
      saveProgress(selectedCourse.id, quizScore.correct + (quizAnswer === selectedCourse.cards[quizIdx].a ? 1 : 0), quizScore.total + 1)
      setQuizActive(false)
    }
  }

  const filtered = COURSES.filter(c => filter === 'All' || c.category === filter)
  const completedCount = Object.keys(progress).filter(k => progress[k].bestScore >= 3).length
  const totalCards = COURSES.reduce((s, c) => s + c.cards.length, 0)

  const tab = a => ({ padding: '5px 14px', background: a ? 'rgba(124,58,237,0.12)' : 'none', border: '1px solid ' + (a ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 5, color: a ? '#a78bfa' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' })

  // Quiz view
  if (quizActive && selectedCourse && selectedCourse.cards[quizIdx]) {
    const card = selectedCourse.cards[quizIdx]
    const options = [card.a, ...card.wrong].sort(() => Math.random() - 0.5)
    return (
      <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 520, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#4a5c7a', fontFamily: '"DM Mono",monospace' }}>{selectedCourse.icon} {selectedCourse.title} ({quizIdx + 1}/{selectedCourse.cards.length})</div>
            <div style={{ fontSize: 12, color: '#10b981', fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>{quizScore.correct}/{quizScore.total}</div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ width: ((quizIdx + 1) / selectedCourse.cards.length * 100) + '%', height: '100%', background: selectedCourse.color, transition: 'width 0.3s ease' }} />
          </div>

          <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, lineHeight: 1.6 }}>{card.q}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {options.map((opt, i) => {
                const isCorrect = opt === card.a
                const isSelected = quizAnswer === opt
                const showResult = quizAnswer !== null
                let bg = 'rgba(255,255,255,0.03)', border = 'rgba(255,255,255,0.06)', color = '#8b9bb4'
                if (showResult && isCorrect) { bg = 'rgba(16,185,129,0.1)'; border = 'rgba(16,185,129,0.3)'; color = '#10b981' }
                if (showResult && isSelected && !isCorrect) { bg = 'rgba(239,68,68,0.1)'; border = 'rgba(239,68,68,0.3)'; color = '#ef4444' }
                return (
                  <button key={i} onClick={() => !quizAnswer && answerQuiz(opt, card.a)} disabled={!!quizAnswer}
                    style={{ padding: '14px 18px', background: bg, border: '1px solid ' + border, borderRadius: 10, color: color, fontSize: 13, cursor: quizAnswer ? 'default' : 'pointer', textAlign: 'left', fontFamily: '"DM Sans",sans-serif', transition: 'all 0.15s', lineHeight: 1.4 }}>
                    {opt}
                  </button>
                )
              })}
            </div>
            {quizAnswer && (
              <button onClick={nextQuestion} style={{ marginTop: 20, width: '100%', padding: '12px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 10, color: '#a78bfa', fontSize: 13, cursor: 'pointer', fontWeight: 600, fontFamily: '"DM Sans",sans-serif' }}>
                {quizIdx < selectedCourse.cards.length - 1 ? 'Next Question \u2192' : 'Finish \u2014 ' + (quizScore.correct + (quizAnswer === card.a ? 1 : 0)) + '/' + (quizScore.total + 1) + ' correct'}
              </button>
            )}
          </div>
          <button onClick={() => setQuizActive(false)} style={{ marginTop: 12, width: '100%', padding: '8px', background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: '#4a5c7a', fontSize: 10, cursor: 'pointer' }}>Exit to Learning Center</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 2px' }}>Learning Center</h1>
        <div style={{ color: '#3d4e62', fontSize: 11 }}>AI-curated courses \u00B7 Quizlet-style flashcards \u00B7 Personalized to your trading</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Courses', value: COURSES.length, color: '#a78bfa' },
          { label: 'Completed', value: completedCount, color: '#10b981' },
          { label: 'Flashcards', value: totalCards, color: '#60a5fa' },
          { label: 'Streak', value: streakDays + 'd', color: '#f59e0b' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontFamily: '"DM Mono",monospace', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* AI Recommendations based on weaknesses */}
      {userWeaknesses.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10 }}>
          <div style={{ fontSize: 9, color: '#ef4444', fontFamily: '"DM Mono",monospace', fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>AI RECOMMENDED FOR YOU</div>
          {userWeaknesses.map((w, i) => {
            const course = COURSES.find(c => c.id === w.course)
            return course ? (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{course.icon} {course.title}</span>
                  <span style={{ fontSize: 10, color: '#6b7a90', marginLeft: 8 }}>{w.reason}</span>
                </div>
                <button onClick={() => startQuiz(course)} style={{ padding: '4px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 5, color: '#ef4444', fontSize: 9, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>Start</button>
              </div>
            ) : null
          })}
        </div>
      )}

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => <button key={c} style={tab(filter === c)} onClick={() => setFilter(c)}>{c}</button>)}
      </div>

      {/* Course grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {filtered.map(course => {
          const prog = progress[course.id]
          const mastered = prog && prog.bestScore >= Math.ceil(course.cards.length * 0.8)
          return (
            <div key={course.id} style={{ background: '#0c1018', border: '1px solid ' + (mastered ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 12, padding: '14px 16px', transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22 }}>{course.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{course.title}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      <span style={{ color: course.color, fontSize: 9, fontFamily: '"DM Mono",monospace' }}>{course.category}</span>
                      <span style={{ color: course.difficulty === 'Advanced' || course.difficulty === 'Intermediate' ? '#f59e0b' : '#10b981', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>{course.difficulty}</span>
                    </div>
                  </div>
                </div>
                {mastered && <span style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4, padding: '1px 6px', color: '#10b981', fontSize: 8, fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>MASTERED</span>}
              </div>

              <div style={{ fontSize: 11, color: '#6b7a90', lineHeight: 1.5, marginBottom: 10 }}>{course.description}</div>

              {/* Progress bar */}
              {prog && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#3d4e62', marginBottom: 3 }}>
                    <span>Best: {prog.bestScore}/{course.cards.length}</span>
                    <span>{prog.attempts} attempt{prog.attempts !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: (prog.bestScore / course.cards.length * 100) + '%', height: '100%', background: mastered ? '#10b981' : course.color, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => startQuiz(course)} style={{ flex: 1, padding: '8px 0', background: 'rgba(' + (course.color === '#10b981' ? '16,185,129' : course.color === '#60a5fa' ? '96,165,250' : course.color === '#f59e0b' ? '245,158,11' : course.color === '#a78bfa' ? '167,139,250' : course.color === '#ef4444' ? '239,68,68' : '249,115,22') + ',0.08)', border: '1px solid ' + course.color + '30', borderRadius: 6, color: course.color, fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace', fontWeight: 600 }}>
                  {prog ? 'Retake Quiz' : 'Start Quiz'}
                </button>
                <button style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, color: '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' }}>
                  {course.cards.length} cards
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Coming Soon: Coaching Marketplace */}
      <div style={{ marginTop: 24, padding: '16px 20px', background: 'rgba(124,58,237,0.03)', border: '1px solid rgba(124,58,237,0.12)', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>{'\u{1F393}'}</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Coaching Marketplace</span>
          <span style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 4, padding: '1px 6px', color: '#a78bfa', fontSize: 8, fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>COMING SOON</span>
        </div>
        <div style={{ fontSize: 11, color: '#6b7a90', lineHeight: 1.6 }}>
          Hire expert trading coaches. Learn their strategies in private Discord-style channels. Coaches post alerts, lessons, and trade ideas. AI learns from every interaction to make your experience smarter.
        </div>
      </div>
    </div>
  )
}
