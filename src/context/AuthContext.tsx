import React, { createContext, useCallback, useContext, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import type { UserProfile } from '../types.ts';

interface AuthContextValue {
  token: string | null;
  user: UserProfile | null;
  setSession: (token: string, user: UserProfile) => void;
  refreshProfile: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);

  const setSession = useCallback((nextToken: string, nextUser: UserProfile) => {
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/me', { token });
      setUser(res.user);
    } catch {
      setToken(null);
      setUser(null);
    }
  }, [token]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, setSession, refreshProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
