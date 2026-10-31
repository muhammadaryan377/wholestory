import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { clearMediaCache } from './media';
import { setPrivateUnlocked } from './private-access';
import { AppState, Platform } from 'react-native';

const Ctx = createContext<{ session: Session | null; ready: boolean }>({ session: null, ready: false });
export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    let userId: string | null = null;
    supabase.auth.getSession().then(({ data }) => { if (active && !authEventSeen) { userId = data.session?.user.id ?? null; setSession(data.session); setReady(true); } })
      .catch(() => { if (active && !authEventSeen) { setSession(null); setReady(true); } });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      authEventSeen = true;
      clearMediaCache();
      if (_e === 'SIGNED_OUT' || userId !== (s?.user.id ?? null)) setPrivateUnlocked(false);
      userId = s?.user.id ?? null;
      if (active) { setSession(s); setReady(true); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const update = (state: string) => { if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh(); };
    update(AppState.currentState ?? 'active');
    const sub = AppState.addEventListener('change', update);
    return () => { sub.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);
  return <Ctx.Provider value={{ session, ready }}>{children}</Ctx.Provider>;
}
