import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";

function getExpoHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    (Constants.manifest as any)?.debuggerHost;

  if (!hostUri || typeof hostUri !== "string") return null;
  return hostUri.split(":")[0] || null;
}

function computeBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
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
  timeout: 15000,
  withCredentials: true
});

api.interceptors.response.use(undefined, async (error) => {
  const config = error?.config;
  const method = String(config?.method || "get").toLowerCase();
  if (axios.isCancel(error) || !config || method !== "get" || error?.response ||
      error?.code !== "ERR_NETWORK" || (config.__networkRetries || 0) >= 1) {
    throw error;
  }
  config.__networkRetries = (config.__networkRetries || 0) + 1;
  await new Promise((resolve) => setTimeout(resolve, config.__networkRetries * 600));
  return api.request(config);
});

api.interceptors.response.use((response) => response, (error) => {
  if (!axios.isCancel(error)) error.message = getNetworkErrorMessage(error);
  return Promise.reject(error);
});

export function getNetworkErrorMessage(error: any): string {
  if (["ECONNABORTED", "ETIMEDOUT"].includes(error?.code)) {
    return "The request timed out. Check the current status before trying again.";
  }
  if (error?.response?.status >= 500) {
    return "Service temporarily unavailable. Please try again shortly.";
  }
  if (error?.response?.status === 429) return "Too many requests. Please wait a moment and try again.";
  const serverMessage = error?.response?.data?.message;
  if (typeof serverMessage === "string" && serverMessage) return serverMessage;
  if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
    return "Unable to connect. Check your internet connection and try again.";
  }
  if (error?.response) return "Request failed. Please try again.";
  return typeof error?.message === "string" ? error.message : "Request failed. Please try again.";
}
