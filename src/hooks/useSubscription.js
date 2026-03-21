// useSubscription.js — Shared subscription/paywall hook
// Used by every page that needs to gate features
// Caches subscription state for 5 minutes, graceful fallback to free

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const cache = { data: null, ts: 0 }
const CACHE_TTL = 5 * 60 * 1000 // 5 min

export function useSubscription() {
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    // Return cached if fresh
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      setSubscription(cache.data)
      setLoading(false)
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setSubscription({ status: 'free', isPro: false }); setLoading(false); return }

      // Admins always get pro
      if (user.email === 'ankushtasildar2@gmail.com') {
        const sub = { status: 'active', isPro: true, plan: 'admin', isAdmin: true }
        cache.data = sub; cache.ts = Date.now()
        setSubscription(sub); setLoading(false); return
      }

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, plan, current_period_end, cancel_at_period_end')
        .eq('user_id', user.id)
        .single()

      const result = sub
        ? { ...sub, isPro: sub.status === 'active', isAdmin: false }
        : { status: 'free', isPro: false, isAdmin: false }

      cache.data = result; cache.ts = Date.now()
      setSubscription(result)
    } catch(e) {
      setSubscription({ status: 'free', isPro: false, isAdmin: false })
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const invalidate = () => { cache.ts = 0; load() }

  return { subscription, loading, isPro: subscription?.isPro || false, isAdmin: subscription?.isAdmin || false, invalidate }
}

// Free tier limits
export const FREE_LIMITS = {
  scansPerDay: 3,
  journalTrades: 10,
  alertsMax: 2,
}

// Check if user has exceeded free limit
export function checkLimit(type, count) {
  return count >= (FREE_LIMITS[type] || Infinity)
}
