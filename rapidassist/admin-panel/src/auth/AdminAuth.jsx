import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { adminApi } from "../config/api";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    adminApi.get("/api/auth/me")
      .then((response) => {
        if (active && response.data?.user?.role === "admin") setAdmin(response.data.user);
      })
      .catch((error) => {
        if (active && error?.response?.status !== 401) setSessionError(error.message || "Unable to check your session.");
      })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [attempt]);

  const value = useMemo(() => ({
    admin,
    ready,
    sessionError,
    retrySession() {
      setReady(false); setSessionError(""); setAttempt((value) => value + 1);
    },
    async login(email, password) {
      const response = await adminApi.post("/api/auth/admin/login", { email, password });
      setAdmin(response.data.user);
      return response.data.user;
    },
    async logout() {
      await adminApi.post("/api/auth/logout");
      setAdmin(null);
    }
  }), [admin, ready, sessionError]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error("AdminAuthProvider is missing");
  return value;
}
