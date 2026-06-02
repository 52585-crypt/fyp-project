import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";

function getExpoHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost;

  if (!hostUri || typeof hostUri !== "string") return null;
  return hostUri.split(":")[0] || null;
}

function computeBaseUrl() {
  // Web (expo start --web): call backend on same host by default
  if (Platform.OS === "web") {
    const host =
      typeof window !== "undefined" && window.location?.hostname
        ? window.location.hostname
        : "localhost";
    return `http://${host}:4000`;
  }

  const expoHost = getExpoHost();
  if (expoHost) {
    return `http://${expoHost}:4000`;
  }

  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  return "http://localhost:4000";
}

export const API_BASE_URL = computeBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000
});

