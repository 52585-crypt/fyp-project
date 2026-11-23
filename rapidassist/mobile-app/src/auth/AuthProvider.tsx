import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearToken, getToken, setToken } from "./auth.storage";
import type { SafeUser } from "./auth.types";
import { me } from "./auth.api";
import { ActivityIndicator, Button, Text, View } from "react-native";
import { apiClient } from "../services/apiClient";
import { isExpiredCustomerSession } from "./sessionExpiry";

let onReconnectedSafe: (cb: () => void | Promise<void>) => () => void = () => () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nm = require("../services/networkManager");
  if (nm && typeof nm.onReconnected === "function") {
    onReconnectedSafe = nm.onReconnected;
  }
} catch {}

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

  const generation = useRef(0);
  const session = useRef<{ token: string; role: string; id: string } | null>(null);
  const storage = useRef<Promise<void>>(Promise.resolve());

  function writeSession(operation: () => Promise<void>) {
    const next = storage.current.then(operation);
    storage.current = next.catch(() => {});
    return next;
  }

  function applySession(token: string | null, user: SafeUser | null) {
    session.current = token && user ? { token, role: user.activeRole ?? user.role, id: user.id } : null;
    setTokenState(token);
    setUser(user);
  }

  useEffect(() => onReconnectedSafe(() => setRestoreAttempt((attempt) => attempt + 1)), []);

  useEffect(() => {
    const interceptor = apiClient.interceptors.response.use(undefined, (error) => {
      if (isExpiredCustomerSession(error, session.current)) {
        generation.current += 1;
        applySession(null, null);
        setRestoreError(null);
        setIsLoading(false);
        void writeSession(clearToken).catch(() => {});
      }
      return Promise.reject(error);
    });
    return () => apiClient.interceptors.response.eject(interceptor);
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = generation.current;
    const isCurrent = () => mounted && run === generation.current;
    setIsLoading(true);
    setRestoreError(null);
    void (async () => {
      try {
        await storage.current;
        if (!isCurrent()) return;
        const token = await getToken();
        if (!token || !isCurrent()) return;
        const { user } = await me(token);
        if (isCurrent()) applySession(token, user);
      } catch (error: any) {
        if (!isCurrent()) return;
        if (error?.response?.status === 401) {
          applySession(null, null);
          try {
            await writeSession(clearToken);
          } catch (storageError) {
            if (isCurrent()) setRestoreError(storageError instanceof Error ? storageError.message : "Unable to clear the expired session.");
          }
        } else {
          // Retain the stored token during network failures and server outages.
          setRestoreError(error?.message || "Unable to restore your session. Please try again.");
        }
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [restoreAttempt]);

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      token,
      user,
      setSession: async (token, user) => {
        const run = ++generation.current;
        try {
          await writeSession(() => setToken(token));
          if (run !== generation.current) return;
          applySession(token, user);
          setRestoreError(null);
        } finally {
          if (run === generation.current) setIsLoading(false);
        }
      },
      updateUser: (user) => {
        if (token && session.current?.token === token && session.current.id === user.id) applySession(token, user);
      },
      logout: async () => {
        const run = generation.current;
        await apiClient.post("/api/auth/logout");
        if (run !== generation.current) return;
        const endingRun = ++generation.current;
        try {
          await writeSession(clearToken);
        } finally {
          if (endingRun === generation.current) {
            applySession(null, null);
            setIsLoading(false);
          }
        }
      }
    }),
    [isLoading, token, user]
  );

  // Preserve user screens and state if user is already signed in
  const isBlocking = (isLoading || restoreError) && !user;

  return (
    <AuthContext.Provider value={value}>
      {isBlocking ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 }}>
          {isLoading ? (
            <ActivityIndicator size="large" />
          ) : (
            <>
              <Text accessibilityRole="alert" style={{ textAlign: "center" }}>
                {restoreError}
              </Text>
              <Button title="Retry connection" onPress={() => setRestoreAttempt((attempt) => attempt + 1)} />
            </>
          )}
        </View>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
