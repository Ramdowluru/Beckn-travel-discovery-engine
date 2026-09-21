"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

/* ─── Types ───────────────────────────────────────────────────── */
export interface AuthUser {
  name: string;
  email: string;
  initials: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  signIn: (user: AuthUser) => void;
  signOut: () => void;
}

/* ─── Context ─────────────────────────────────────────────────── */
const AuthContext = createContext<AuthContextValue>({
  user: null,
  signIn: () => {},
  signOut: () => {},
});

const STORAGE_KEY = "tde_auth_user";

/* ─── Provider ────────────────────────────────────────────────── */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  /* Hydrate from localStorage on mount (client only) */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const signIn = useCallback((u: AuthUser) => {
    setUser(u);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ─── Hook ────────────────────────────────────────────────────── */
export function useAuth() {
  return useContext(AuthContext);
}
