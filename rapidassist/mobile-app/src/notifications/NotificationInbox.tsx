import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { AppShell, BottomNav, Card, PrimaryButton } from "../ui/components";
import { ui } from "../ui/system";
import { AppNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from "./notifications.api";
import { openNotification, useNotifications } from "./NotificationProvider";

export function NotificationInbox({ role }: { role: "user" | "provider" }) {
  const { token } = useAuth();
  const { refreshUnread } = useNotifications();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try { setItems((await listNotifications(token)).notifications); setError(""); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || "Unable to load notifications"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [token]);

  async function read(item: AppNotification) {
    if (!token || busy) return;
    try {
      setBusy(true); setError("");
      if (!item.readAt) {
        await markNotificationRead(token, item.id);
        setItems((current) => current.map((value) => value.id === item.id ? { ...value, readAt: new Date().toISOString() } : value));
        await refreshUnread();
      }
      openNotification(item.data);
    } catch (error: any) {
      setError(error?.message || "Unable to open notification. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function readAll() {
    if (!token || busy) return;
    try {
      setBusy(true); setError("");
      await markAllNotificationsRead(token);
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
      await refreshUnread();
    } catch (error: any) {
      setError(error?.message || "Unable to mark notifications as read. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <View style={{ flex: 1 }}>
    <AppShell title="Notifications" subtitle="Job, message, approval, and payment updates." right={
      <PrimaryButton title="Read all" variant="outline" disabled={busy || loading} onPress={() => void readAll()} />
    }>
      {error ? <><Text style={styles.error}>{error}</Text><PrimaryButton title="Refresh notifications" disabled={loading} variant="outline" onPress={() => void load()} /></> : null}
      {items.map((item) => <Pressable key={item.id} disabled={busy} onPress={() => void read(item)}>
        <Card style={!item.readAt ? { ...styles.card, ...styles.unread } : styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
          {!item.readAt ? <View style={styles.dot} /> : null}
        </Card>
      </Pressable>)}
      {!items.length && !error ? <Text style={styles.empty}>{loading ? "Loading notifications…" : "No notifications yet."}</Text> : null}
    </AppShell>
    <BottomNav role={role} active="Alerts" />
  </View>;
}

const styles = StyleSheet.create({
  card: { marginBottom: 10, flexDirection: "row", gap: 12 },
  unread: { borderColor: ui.colors.primary, backgroundColor: ui.colors.primarySoft },
  title: { color: ui.colors.text, fontSize: 14, fontWeight: "900" },
  body: { marginTop: 5, color: ui.colors.muted, fontSize: 12, lineHeight: 18 },
  time: { marginTop: 8, color: ui.colors.muted, fontSize: 10, fontWeight: "700" },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: ui.colors.primary },
  empty: { color: ui.colors.muted, textAlign: "center", marginTop: 30, fontWeight: "700" },
  error: { color: ui.colors.danger, marginBottom: 12, fontWeight: "700" }
});
