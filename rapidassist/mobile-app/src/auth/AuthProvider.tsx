import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearToken, getToken, setToken } from "./auth.storage";
import type { SafeUser } from "./auth.types";
import { me } from "./auth.api";

type AuthState = {
  isLoading: boolean;
  token: string | null;
  user: SafeUser | null;
  setSession: (token: string, user: SafeUser) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<SafeUser | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const t = await getToken();
        if (!mounted) return;
        if (!t) {
          setIsLoading(false);
          return;
        }
        setTokenState(t);
        const data = await me(t);
        if (!mounted) return;
        setUser(data.user as SafeUser);
      } catch {
        await clearToken();
        if (!mounted) return;
        setTokenState(null);
        setUser(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      token,
      user,
      setSession: async (t, u) => {
        await setToken(t);
        setTokenState(t);
        setUser(u);
      },
      logout: async () => {
        await clearToken();
        setTokenState(null);
        setUser(null);
      }
    }),
    [isLoading, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

