import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/** Light tactile feedback on Android/iOS; no-op on web. Never throws. */
export function tapFeedback() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function successFeedback() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
