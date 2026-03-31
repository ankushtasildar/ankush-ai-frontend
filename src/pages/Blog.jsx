import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

function ArticleCard({ article, onRead }) {
  const tagColors = { trading: '#10b981', psychology: '#a78bfa', options: '#f59e0b', analysis: '#60a5fa', strategy: '#ef4444', education: '#f97316' }
  return (
    <div onClick={() => onRead(article.slug)} style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {(article.tags || []).slice(0, 3).map((tag, i) => (
          <span key={i} style={{ background: (tagColors[tag] || '#4a5c7a') + '12', border: '1px solid ' + (tagColors[tag] || '#4a5c7a') + '30', borderRadius: 4, padding: '1px 8px', color: tagColors[tag] || '#4a5c7a', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>{tag}</span>
        ))}
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.4 }}>{article.title}</h2>
      <p style={{ fontSize: 12, color: '#6b7a90', lineHeight: 1.6, margin: '0 0 10px' }}>{article.description}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#3d4e62', fontFamily: '"DM Mono",monospace' }}>{article.author} \u00B7 {article.date}</div>
        <div style={{ fontSize: 10, color: '#4a5c7a', fontFamily: '"DM Mono",monospace' }}>{article.readTime}</div>
      </div>
    </div>
  )
}

function ArticleView({ article, onBack }) {
  const formatContent = (content) => {
    if (!content) return null
    return content.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 8px', color: '#f0f6ff' }}>{line.replace('## ', '')}</h2>
      if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 6px', color: '#8b9bb4' }}>{line.replace('### ', '')}</h3>
      if (line.startsWith('- ')) return <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 13, color: '#8b9bb4', lineHeight: 1.7 }}><span style={{ color: '#60a5fa', flexShrink: 0 }}>{'\u2022'}</span><span>{line.replace('- ', '')}</span></div>
      if (!line.trim()) return <div key={i} style={{ height: 8 }} />
      return <p key={i} style={{ fontSize: 13, color: '#8b9bb4', lineHeight: 1.8, margin: '0 0 8px' }}>{line}</p>
    })
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <button onClick={onBack} style={{ padding: '6px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, color: '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace', marginBottom: 16 }}>{'\u2190'} Back to articles</button>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {(article.tags || []).map((tag, i) => (
          <span key={i} style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 4, padding: '2px 8px', color: '#60a5fa', fontSize: 9, fontFamily: '"DM Mono",monospace' }}>{tag}</span>
        ))}
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: '"Syne",sans-serif', margin: '0 0 8px', lineHeight: 1.3 }}>{article.title}</h1>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#4a5c7a', fontFamily: '"DM Mono",monospace', marginBottom: 20 }}>
        <span>{article.author}</span>
        <span>{article.date}</span>
        <span>{article.readTime}</span>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
        {formatContent(article.content || article.description)}
      </div>
    </div>
  )
}

export default function Blog() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSlug, setSelectedSlug] = useState(searchParams.get('article') || null)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [filter, setFilter] = useState('All')

  useEffect(() => { loadArticles() }, [])
  useEffect(() => { if (selectedSlug) loadArticle(selectedSlug) }, [selectedSlug])

  async function loadArticles() {
    setLoading(true)
    try {
      const r = await fetch('/api/blog?action=list')
      if (r.ok) { const d = await r.json(); setArticles(d.articles || d.posts || []) }
    } catch(e) {}
    setLoading(false)
  }

  async function loadArticle(slug) {
    try {
      const r = await fetch('/api/blog?action=read&slug=' + slug)
      if (r.ok) { const d = await r.json(); setSelectedArticle(d) }
      else { const found = articles.find(a => a.slug === slug); if (found) setSelectedArticle(found) }
    } catch(e) { const found = articles.find(a => a.slug === slug); if (found) setSelectedArticle(found) }
  }

  const allTags = [...new Set(articles.flatMap(a => a.tags || []))]
  const tags = ['All', ...allTags]
  const filtered = filter === 'All' ? articles : articles.filter(a => (a.tags || []).includes(filter))

  const tab = (active) => ({ padding: '5px 12px', background: active ? 'rgba(59,130,246,0.12)' : 'none', border: '1px solid ' + (active ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 5, color: active ? '#60a5fa' : '#4a5c7a', fontSize: 10, cursor: 'pointer', fontFamily: '"DM Mono",monospace' })

  // Article detail view
  if (selectedArticle) {
    return (
      <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
        <ArticleView article={selectedArticle} onBack={() => { setSelectedSlug(null); setSelectedArticle(null) }} />
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#080c14', color: '#f0f6ff', fontFamily: '"DM Sans",sans-serif' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: '"Syne",sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 2px' }}>Trading Intelligence Blog</h1>
        <div style={{ color: '#3d4e62', fontSize: 11 }}>Research, strategies, and market insights from the AnkushAI team</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Articles', value: articles.length, color: '#60a5fa' },
          { label: 'Topics', value: allTags.length, color: '#a78bfa' },
          { label: 'Latest', value: articles.length > 0 ? articles[0].date : '--', color: '#10b981' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: '#3d4e62', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontFamily: '"DM Mono",monospace', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tag filter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {tags.map(t => <button key={t} style={tab(filter === t)} onClick={() => setFilter(t)}>{t}</button>)}
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#3d4e62', fontSize: 12 }}>Loading articles...</div>}

      {/* Article grid */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#3d4e62' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{'\u{1F4DD}'}</div>
          <div style={{ fontSize: 13 }}>No articles yet in this category</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {filtered.map(article => (
            <ArticleCard key={article.slug} article={article} onRead={slug => { setSelectedSlug(slug); loadArticle(slug) }} />
          ))}
        </div>
      )}

      {/* CTA to Learning Center */}
      <div style={{ marginTop: 24, padding: '14px 18px', background: 'rgba(124,58,237,0.03)', border: '1px solid rgba(124,58,237,0.12)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Want to learn more?</div>
          <div style={{ fontSize: 11, color: '#6b7a90' }}>Take interactive quizzes in our Learning Center</div>
        </div>
        <button onClick={() => navigate('/app/learn')} style={{ padding: '8px 16px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, color: '#a78bfa', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Learning Center {'\u2192'}</button>
      </div>
    </div>
  )
}
