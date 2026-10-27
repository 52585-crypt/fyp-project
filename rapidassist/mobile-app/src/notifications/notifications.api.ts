import { Platform } from "react-native";
import { api } from "../config/api";

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  readAt: string | null;
  createdAt: string;
};

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function listNotifications(token: string) {
  const response = await api.get<{ unread: number; notifications: AppNotification[] }>("/api/notifications", auth(token));
  return response.data;
}

export async function markNotificationRead(token: string, id: string) {
  await api.patch(`/api/notifications/${id}/read`, {}, auth(token));
}

export async function markAllNotificationsRead(token: string) {
  await api.patch("/api/notifications/read-all", {}, auth(token));
}

export async function registerDeviceToken(token: string, pushToken: string) {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return;
  await api.post("/api/notifications/device-tokens", { token: pushToken, platform: Platform.OS }, auth(token));
}
