/**
 * useWebSocket.js
 * Connects to FastAPI /ws endpoint for backend-pushed events.
 * Auto-reconnects on disconnect.
 *
 * Usage:
 *   useWebSocket(event => {
 *     if (event.type === 'signal') refetchSignals()
 *   })
 */

import { useEffect, useRef, useCallback } from 'react'

const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000')
  .replace('http://', 'ws://')
  .replace('https://', 'wss://') + '/ws'

export function useWebSocket(onMessage) {
  const wsRef      = useRef(null)
  const retryRef   = useRef(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    try {
      const ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
      }

      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type !== 'ping') onMessage(msg)
        } catch {}
      }

      ws.onclose = () => {
        // Reconnect after 3s if still mounted
        if (mountedRef.current) {
          retryRef.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => ws.close()

      wsRef.current = ws
    } catch {
      // Backend not running — retry silently
      if (mountedRef.current) {
        retryRef.current = setTimeout(connect, 5000)
      }
    }
  }, [onMessage])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (retryRef.current) clearTimeout(retryRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])
}
