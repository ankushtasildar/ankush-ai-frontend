import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[Ankush AI] Boundary caught:', error, info?.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const { error, info } = this.state
    const stack = info?.componentStack?.trim().split('\n').slice(0, 4).join('\n')
    return (
      <div style={{ minHeight: this.props.page ? '60vh' : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--red)', borderLeft: '3px solid var(--red)', borderRadius: 'var(--radius)', padding: '24px 28px', maxWidth: 560, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>⚠</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--red)', textTransform: 'uppercase' }}>
              {this.props.label || 'Component Error'}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.6 }}>
            {error?.message || 'An unexpected error occurred.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 11, padding: '5px 14px' }} onClick={() => this.setState({ hasError: false, error: null, info: null })}>↻ Retry</button>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 14px' }} onClick={() => window.location.reload()}>⟳ Reload App</button>
          </div>
        </div>
      </div>
    )
  }
}
