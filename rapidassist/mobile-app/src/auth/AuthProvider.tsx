import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearToken, getToken, setToken } from "./auth.storage";
import type { SafeUser } from "./auth.types";
import { me } from "./auth.api";
import { ActivityIndicator, Button, Text, View } from "react-native";
import { apiClient } from "../services/apiClient";

type AuthState = {
  isLoading: boolean;
  token: string | null;
  user: SafeUser | null;
  setSession: (token: string, user: SafeUser) => Promise<void>;
  updateUser: (user: SafeUser) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setRestoreError(null);
    (async () => {
      try {
        const t = await getToken();
        if (!mounted) return;
        if (!t) {
          setIsLoading(false);
          return;
        }
        const data = await me(t);
        if (!mounted) return;
        setTokenState(t);
        setUser(data.user as SafeUser);
      } catch (error: any) {
        if (!mounted) return;
        if (error?.response?.status === 401) {
          try {
            await clearToken();
            if (!mounted) return;
            setTokenState(null);
            setUser(null);
          } catch (storageError: any) {
            if (mounted) setRestoreError(storageError.message);
          }
        } else {
          // Retain the stored token during network failures and server outages.
          setRestoreError(error?.message || "Unable to restore your session. Please try again.");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [restoreAttempt]);

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
      updateUser: (u) => setUser(u),
      logout: async () => {
        await apiClient.post("/api/auth/logout");
        await clearToken();
        setTokenState(null);
        setUser(null);
      }
    }),
    [isLoading, token, user]
  );

  return <AuthContext.Provider value={value}>
    {isLoading || restoreError ? <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 }}>
      {isLoading ? <ActivityIndicator size="large" /> : <>
        <Text accessibilityRole="alert" style={{ textAlign: "center" }}>{restoreError}</Text>
        <Button title="Retry connection" onPress={() => setRestoreAttempt((attempt) => attempt + 1)} />
      </>}
    </View> : children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
