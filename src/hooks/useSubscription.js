import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export function useSubscription() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    // Load profile + subscription
    Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('subscriptions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single(),
    ]).then(([{ data: p }, { data: s }]) => {
      setProfile(p); setSubscription(s); setLoading(false);
    });
    // Real-time profile sync
    const ch = supabase.channel('profile:' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.' + user.id },
        ({ new: data }) => setProfile(data))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user])

  // Check if user has active paid access
  const isPro = !!(
    profile?.plan === 'pro' ||
    profile?.subscription_status === 'active' ||
    profile?.subscription_status === 'access_code' ||
    (subscription?.status === 'active' && subscription?.plan === 'pro')
  );

  const isStarter = !!(
    profile?.plan === 'starter' ||
    (subscription?.status === 'active' && subscription?.plan === 'starter')
  );

  async function startCheckout(plan) {
    if (!user) { window.location.href = '/#pricing'; return; }
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, userId: user.id, email: user.email }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Could not start checkout: ' + err.message);
    }
  }

  async function redeemAccessCode(code) {
    if (!user) return { error: 'Not logged in' };
    const { data, error } = await supabase
      .from('access_codes')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .eq('is_active', true)
      .single();
    if (error || !data) return { error: 'Invalid or already used access code' };
    // Mark code used
    await supabase.from('access_codes').update({
      is_active: false, used_by: user.email, used_at: new Date().toISOString()
    }).eq('id', data.id);
    // Upgrade profile
    const { error: updateError } = await supabase.from('profiles').update({
      plan: 'pro', access_code: data.code,
      subscription_status: 'access_code', updated_at: new Date().toISOString()
    }).eq('id', user.id);
    if (updateError) return { error: updateError.message };
    setProfile(prev => ({ ...prev, plan: 'pro', subscription_status: 'access_code' }));
    return { success: true };
  }

  return { profile, subscription, loading, isPro, isStarter, startCheckout, redeemAccessCode };
}
