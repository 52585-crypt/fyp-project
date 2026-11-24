import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { adminApi, SESSION_EXPIRED_EVENT } from "../config/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [status, setStatus] = useState("checking"); // checking | authenticated | anonymous

  useEffect(() => {
    let cancelled = false;
    adminApi
      .get("/api/admin/auth/me")
      .then((res) => {
        if (cancelled) return;
        setAdmin(res.data.admin);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setAdmin(null);
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onExpired() {
      setAdmin(null);
      setStatus("anonymous");
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (phone, password) => {
    const res = await adminApi.post("/api/admin/auth/login", { phone, password });
    setAdmin(res.data.admin);
    setStatus("authenticated");
    return res.data.admin;
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminApi.post("/api/admin/auth/logout");
    } finally {
      setAdmin(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(() => ({ admin, status, login, logout }), [admin, status, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
