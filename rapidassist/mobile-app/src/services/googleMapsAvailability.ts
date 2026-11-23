import Constants from "expo-constants";
import { Platform } from "react-native";

export function isGoogleMapConfigured() {
  if (Platform.OS === "web") return Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY?.trim());
  return Platform.OS === "android" && Boolean(Constants.expoConfig?.extra?.googleMapsAndroidConfigured);
}
