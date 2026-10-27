import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { createSocket } from "../services/socket";
import { listNotifications, registerDeviceToken } from "./notifications.api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

const NotificationContext = createContext({ unread: 0, refreshUnread: async () => {} });

export function openNotification(data: Record<string, any>) {
  const requestId = typeof data?.requestId === "string" ? data.requestId : undefined;
  const route = String(data?.route || "");
  if (route.includes("/(provider)/requests") && requestId) router.push({ pathname: "/(provider)/requests/[requestId]", params: { requestId } });
  else if (route.includes("/(provider)/chat") && requestId) router.push({ pathname: "/(provider)/chat/[requestId]", params: { requestId } });
  else if (route.includes("/(user)/chat") && requestId) router.push({ pathname: "/(user)/chat/[requestId]", params: { requestId } });
  else if (route.includes("/(provider)/payment") && requestId) router.push({ pathname: "/(provider)/payment/[requestId]", params: { requestId } });
  else if (route.includes("/(user)/payment") && requestId) router.push({ pathname: "/(user)/payment/[requestId]", params: { requestId } });
  else if (route.includes("/(provider)")) router.push("/(provider)/jobs");
  else router.push("/(user)/tracking");
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!token) return setUnread(0);
    try { setUnread((await listNotifications(token)).unread); }
    catch (error) { console.warn("Unable to refresh notification count:", error); }
  }, [token]);

  useEffect(() => { void refreshUnread(); }, [refreshUnread]);

  useEffect(() => {
    if (!token) return;
    const socket = createSocket(token);
    socket.on("connect", () => void refreshUnread());
    socket.on("notification:created", () => setUnread((value) => value + 1));
    socket.connect();
    return () => { socket.disconnect(); };
  }, [token, refreshUnread]);

  useEffect(() => {
    if (!token || Platform.OS === "web") return;
    let active = true;
    (async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("jobs", {
          name: "RapidAssist jobs",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250]
        });
      }
      const current = await Notifications.getPermissionsAsync();
      const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
      if (!permission.granted || !active) return;
      const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;
      const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (active) await registerDeviceToken(token, pushToken);
    })().catch((error) => console.warn("Unable to register push notifications:", error));
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => void refreshUnread());
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      openNotification(event.notification.request.content.data as Record<string, any>);
      void refreshUnread();
    });
    return () => { received.remove(); response.remove(); };
  }, [refreshUnread]);

  const value = useMemo(() => ({ unread, refreshUnread }), [unread, refreshUnread]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
