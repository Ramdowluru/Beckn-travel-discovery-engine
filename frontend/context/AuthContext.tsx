"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

/* ─── Types ───────────────────────────────────────────────────── */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  signIn: (user: Omit<AuthUser, "initials">) => void;
  signOut: () => void;
}

/* ─── Context ─────────────────────────────────────────────────── */
const AuthContext = createContext<AuthContextValue>({
  user: null,
  signIn: () => {},
  signOut: () => {},
});

/* ─── Provider ────────────────────────────────────────────────── */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const signIn = useCallback((u: Omit<AuthUser, "initials">) => {
    const initials = u.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join("");
    setUser({ ...u, initials });
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
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
