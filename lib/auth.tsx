import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { clearMediaCache } from './media';
import { setPrivateUnlocked } from './private-access';

const Ctx = createContext<{ session: Session | null; ready: boolean }>({ session: null, ready: false });
export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setReady(true); } })
      .catch(() => { if (active) { setSession(null); setReady(true); } });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      clearMediaCache();
      if (_e === 'SIGNED_OUT' || _e === 'SIGNED_IN') setPrivateUnlocked(false);
      if (active) { setSession(s); setReady(true); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return <Ctx.Provider value={{ session, ready }}>{children}</Ctx.Provider>;
}
