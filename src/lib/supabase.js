import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || 'https://cyjotqirydjilovbslvw.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5am90cWlyeWRqaWxvdmJzbHZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMjc2OTksImV4cCI6MjA4ODcwMzY5OX0.OLZeWP1tKYqP_OnETxdeugAN4ob5bVt_upKhWqCc9Uc'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'implicit',
    detectSessionInUrl: true,
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  realtime: { params: { eventsPerSecond: 10 } }
})

export const db = {
  signals: {
    list: (limit = 50) =>
      supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(limit),
    subscribe: (cb) =>
      supabase.channel('signals').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, cb).subscribe()
  },
  portfolio: {
    list: () => supabase.from('portfolio_positions').select('*').order('created_at', { ascending: false }),
  },
}
