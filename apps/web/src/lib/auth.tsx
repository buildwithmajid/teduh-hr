'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from './api';
import type { Me } from './types';

type AuthState =
  | { status: 'loading'; me: null }
  | { status: 'anonymous'; me: null }
  | { status: 'authenticated'; me: Me };

interface AuthContextValue {
  status: AuthState['status'];
  me: Me | null;
  /** Dipanggil setelah login/MFA berhasil mengembalikan access token. */
  startSession: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', me: null });
  const queryClient = useQueryClient();
  const router = useRouter();

  const loadMe = useCallback(async () => {
    const me = await api.get<Me>('/auth/me');
    setState({ status: 'authenticated', me });
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    queryClient.clear();
    setState({ status: 'anonymous', me: null });
  }, [queryClient]);

  // Pulihkan sesi dari cookie refresh saat halaman dimuat.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await refreshSession();
      if (cancelled) return;
      if (!token) return setState({ status: 'anonymous', me: null });
      try {
        await loadMe();
      } catch {
        if (!cancelled) setState({ status: 'anonymous', me: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      clear();
      router.replace('/login?expired=1');
    });
    return () => setSessionExpiredHandler(null);
  }, [clear, router]);

  const startSession = useCallback(
    async (accessToken: string) => {
      setAccessToken(accessToken);
      queryClient.clear();
      await loadMe();
    },
    [loadMe, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clear();
      router.replace('/login');
    }
  }, [clear, router]);

  const value = useMemo<AuthContextValue>(() => {
    const perms = new Set(state.me?.permissions ?? []);
    return {
      status: state.status,
      me: state.me,
      startSession,
      logout,
      reloadMe: loadMe,
      can: (...required) => required.every((p) => perms.has(p)),
    };
  }, [state, startSession, logout, loadMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus di dalam AuthProvider');
  return ctx;
}

/** Hanya dipakai di dalam layout (app) yang sudah memastikan user login. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMe dipanggil sebelum user login');
  return me;
}
