"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { ApiError, ensureCsrfToken, logoutRequest, meRequest } from "@/lib/api";

/* ─── Types ───────────────────────────────────────────────────── */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string;
  signIn: (user: Omit<AuthUser, "initials">) => void;
  signOut: () => Promise<void>;
}

/* ─── Context ─────────────────────────────────────────────────── */
const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: "",
  signIn: () => {},
  signOut: async () => {},
});

/* ─── Provider ────────────────────────────────────────────────── */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([ensureCsrfToken(), meRequest()])
      .then(([, response]) => {
        if (!active) return;
        const initials = response.user.name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((word: string) => word[0].toUpperCase())
          .join("");
        setUser({ ...response.user, initials });
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          setUser(null);
          setError("");
        } else {
          setError("Authentication service is unavailable. Please try again.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const signIn = useCallback((u: Omit<AuthUser, "initials">) => {
    const initials = u.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join("");
    setUser({ ...u, initials });
    setError("");
  }, []);

  const signOut = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setError("");
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ─── Hook ────────────────────────────────────────────────────── */
export function useAuth() {
  return useContext(AuthContext);
}
