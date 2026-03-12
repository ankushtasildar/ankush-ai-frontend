import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || 'https://cyjotqirydjilovbslvw.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5am90cWlyeWRqaWxvdmJzbHZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMjc2OTksImV4cCI6MjA4ODcwMzY5OX0.OLZeWP1tKYqP_OnETxdeugAN4ob5bVt_upKhWqCc9Uc'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
})

// Legacy direct DB helpers (used by broker sync fallback)
export const db = {
  signals: {
    list: (limit = 50) =>
      supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(limit),
    subscribe: (cb) =>
      supabase.channel('signals').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, cb).subscribe()
  },
  portfolio: {
    list: () => supabase.from('portfolio_positions').select('*'),
    upsert: (pos) => supabase.from('portfolio_positions').upsert(pos, { onConflict: 'symbol' }),
    delete: (symbol) => supabase.from('portfolio_positions').delete().eq('symbol', symbol)
  },
  journal: {
    list: (limit = 100) =>
      supabase.from('journal_entries').select('*').order('created_at', { ascending: false }).limit(limit),
    insert: (entry) => supabase.from('journal_entries').insert(entry)
  },
  events: {
    list: (types, limit = 200) => {
      let q = supabase.from('events').select('*').order('created_at', { ascending: false }).limit(limit)
      if (types?.length) q = q.in('event_type', types)
      return q
    }
  },
  recaps: {
    list: (limit = 30) =>
      supabase.from('daily_recaps').select('*').order('recap_date', { ascending: false }).limit(limit)
  },
  macro: {
    upcoming: () =>
      supabase.from('macro_events').select('*').gte('event_date', new Date().toISOString().split('T')[0]).order('event_date').limit(20)
  }
}
