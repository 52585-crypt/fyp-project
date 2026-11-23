import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { createSocket } from "../services/socket";
import { onReconnected } from "../services/networkManager";
import { notificationDestination } from "./notificationDestination";
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

export function openNotification(data: Record<string, unknown>) {
  router.push(notificationDestination(data));
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [unread, setUnread] = useState(0);
  const navigationKey = useRootNavigationState()?.key;
  const handledResponse = useRef<string | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!token) return setUnread(0);
    try { setUnread((await listNotifications(token)).unread); }
    catch (error) { console.warn("Unable to refresh notification count:", error); }
  }, [token]);

  useEffect(() => { void refreshUnread(); }, [refreshUnread]);

  useEffect(() => {
    return onReconnected(() => {
      void refreshUnread();
    });
  }, [refreshUnread]);

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
    return () => received.remove();
  }, [refreshUnread]);

  useEffect(() => {
    if (Platform.OS === "web" || !navigationKey) return;
    let active = true;
    function handleResponse(response: Notifications.NotificationResponse | null) {
      if (!active || !response) return;
      const request = response.notification.request;
      if (handledResponse.current === request.identifier) return;
      handledResponse.current = request.identifier;
      openNotification(request.content.data);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      void refreshUnread();
    }
    const listener = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then(handleResponse).catch(() => {});
    return () => { active = false; listener.remove(); };
  }, [navigationKey, refreshUnread]);

  const value = useMemo(() => ({ unread, refreshUnread }), [unread, refreshUnread]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
