import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { listNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "./notifications.api";
import { openNotification, useNotifications } from "./NotificationProvider";

export function useNotificationInbox() {
  const { token } = useAuth();
  const { refreshUnread } = useNotifications();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return setItems([]);
    try { setItems((await listNotifications(token)).notifications); setError(null); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || "Unable to load notifications"); }
  }, [token]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function open(item: AppNotification) {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!item.readAt) {
        await markNotificationRead(token, item.id);
        setItems((c) => c?.map((v) => (v.id === item.id ? { ...v, readAt: new Date().toISOString() } : v)) ?? c);
        await refreshUnread();
      }
      openNotification(item.data);
    } catch (e: any) { setError(e?.message || "Unable to open notification. Please try again."); } finally { setBusy(false); }
  }

  async function readAll() {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await markAllNotificationsRead(token);
      setItems((c) => c?.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })) ?? c);
      await refreshUnread();
    } catch (e: any) { setError(e?.message || "Unable to mark notifications as read. Please try again."); } finally { setBusy(false); }
  }

  return { items, error, busy, loading: items === null && !error, reload: load, open, readAll, unreadCount: items?.filter((i) => !i.readAt).length ?? 0 };
}
