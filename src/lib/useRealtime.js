/**
 * useRealtime.js
 * Central real-time subscription manager.
 * Replaces all setInterval polling with Supabase postgres_changes.
 *
 * Usage:
 *   const signals = useRealtimeTable('signals', { order: 'created_at', limit: 25 })
 *   const positions = useRealtimeTable('portfolio_positions')
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

/**
 * Subscribe to a Supabase table with real-time updates.
 * Initial fetch + live INSERT/UPDATE/DELETE handling.
 */
export function useRealtimeTable(table, {
  order       = 'created_at',
  ascending   = false,
  limit       = 100,
  filter      = null,   // { column, op, value } e.g. { column: 'score', op: 'gte', value: 70 }
  transform   = null,   // fn(rows) => rows  — post-process rows
  enabled     = true,
} = {}) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const channelRef            = useRef(null)

  const fetch = useCallback(async () => {
    try {
      let q = supabase.from(table).select('*').order(order, { ascending }).limit(limit)
      if (filter) q = q.filter(filter.column, filter.op, filter.value)
      const { data, error } = await q
      if (error) throw error
      setRows(transform ? transform(data || []) : (data || []))
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [table, order, ascending, limit, filter, transform])

  useEffect(() => {
    if (!enabled) return
    fetch()

    // Real-time subscription
    const channel = supabase.channel(`rt-${table}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, payload => {
        setRows(prev => {
          const next = [payload.new, ...prev]
          return transform ? transform(next.slice(0, limit)) : next.slice(0, limit)
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, payload => {
        setRows(prev => {
          const next = prev.map(r => r.id === payload.new.id ? payload.new : r)
          return transform ? transform(next) : next
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, payload => {
        setRows(prev => prev.filter(r => r.id !== payload.old.id))
      })
      .subscribe()

    channelRef.current = channel
    return () => { channel.unsubscribe() }
  }, [table, enabled, fetch])

  return { rows, loading, error, refetch: fetch }
}

/**
 * Subscribe to a single row by ID.
 */
export function useRealtimeRow(table, id) {
  const [row, setRow]         = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    supabase.from(table).select('*').eq('id', id).single()
      .then(({ data }) => { setRow(data); setLoading(false) })

    const channel = supabase.channel(`rt-row-${table}-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table,
        filter: `id=eq.${id}` }, p => setRow(p.new))
      .subscribe()

    return () => channel.unsubscribe()
  }, [table, id])

  return { row, loading }
}

/**
 * Broadcast channel for cross-tab/cross-client messaging.
 * Used to push "pipeline ran" events to all open browser tabs.
 */
export function useBroadcast(channelName, onMessage) {
  useEffect(() => {
    const channel = supabase.channel(channelName)
      .on('broadcast', { event: '*' }, payload => onMessage(payload))
      .subscribe()
    return () => channel.unsubscribe()
  }, [channelName])

  const send = useCallback((event, payload) => {
    supabase.channel(channelName).send({ type: 'broadcast', event, payload })
  }, [channelName])

  return send
}
