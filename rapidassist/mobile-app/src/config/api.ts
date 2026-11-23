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
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (__DEV__) {
    if (configuredUrl) return configuredUrl;
    const localPort = process.env.EXPO_PUBLIC_DEV_API_PORT?.trim() || "4000";
    if (!/^\d+$/.test(localPort) || Number(localPort) < 1 || Number(localPort) > 65535) {
      throw new Error("EXPO_PUBLIC_DEV_API_PORT must be an integer between 1 and 65535.");
    }
    // Expo Web development defaults to the backend on the same host.
    if (Platform.OS === "web") {
      const host =
        typeof window !== "undefined" && window.location?.hostname
          ? window.location.hostname
          : "localhost";
      return `http://${host}:${localPort}`;
    }

    const expoHost = getExpoHost();
    const host = expoHost || (Platform.OS === "android" ? "10.0.2.2" : "localhost");
    return `http://${host}:${localPort}`;
  }

  if (!configuredUrl || !/^https:\/\//i.test(configuredUrl)) {
    throw new Error("EXPO_PUBLIC_API_URL must be configured as an HTTPS API origin for release builds.");
  }
  return configuredUrl;
}

export const API_BASE_URL = computeBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true
});

// Network failure reporter hook (connected to networkManager)
let networkFailureReporter: (() => void) | null = null;

export function setNetworkFailureReporter(fn: (() => void) | null) {
  networkFailureReporter = fn;
}

export function reportNetworkFailure() {
  if (networkFailureReporter) {
    try {
      networkFailureReporter();
    } catch {}
  }
}

// Request deduplication for concurrent identical idempotent requests
const inFlightRequests = new Map<string, Promise<any>>();
let requestSeq = 0;
const latestCompletedSeq = new Map<string, number>();

function getDeduplicationKey(url: string, config?: any): string | null {
  const method = String(config?.method || "get").toLowerCase();
  if (method !== "get" && method !== "head") return null;
  if (config?.skipDedupe || (config?.__networkRetries || 0) > 0) return null;
  const params = config?.params ? JSON.stringify(config.params) : "";
  const auth = config?.headers?.Authorization || "";
  return `${method}:${url}:${params}:${auth}`;
}

const originalGet = api.get.bind(api);
api.get = function deduplicatedGet(url: string, config?: any): Promise<any> {
  const key = getDeduplicationKey(url, config);
  if (key && inFlightRequests.has(key)) {
    return inFlightRequests.get(key)!;
  }
  const promise = originalGet(url, config).finally(() => {
    if (key) inFlightRequests.delete(key);
  });
  if (key) inFlightRequests.set(key, promise);
  return promise;
};

const originalRequest = api.request.bind(api);
api.request = function deduplicatedRequest(configOrUrl: any, maybeConfig?: any): Promise<any> {
  const config = typeof configOrUrl === "string" ? { ...maybeConfig, url: configOrUrl } : (configOrUrl || {});
  const url = config.url || "";
  const key = getDeduplicationKey(url, config);

  if (key && inFlightRequests.has(key)) {
    return inFlightRequests.get(key)!;
  }

  const promise = (originalRequest as any)(configOrUrl, maybeConfig).finally(() => {
    if (key) {
      inFlightRequests.delete(key);
    }
  });

  if (key) {
    inFlightRequests.set(key, promise);
  }

  return promise;
};

// Request sequencing for stale response detection
api.interceptors.request.use((config: any) => {
  config.__seq = ++requestSeq;
  config.__timestamp = Date.now();
  return config;
});

// Response interceptor: retry with exponential backoff for idempotent requests
api.interceptors.response.use(undefined, async (error) => {
  const config = error?.config;
  if (!config || axios.isCancel(error)) {
    throw error;
  }

  const method = String(config?.method || "get").toLowerCase();
  const isIdempotent =
    ["get", "head", "options"].includes(method) ||
    (Boolean(config.__idempotent) && Boolean(config.headers?.["Idempotency-Key"] || config.headers?.["idempotency-key"]));

  // Rule: Do not automatically retry non-idempotent mutation requests
  if (!isIdempotent) {
    if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
      reportNetworkFailure();
    }
    throw error;
  }

  const isNetwork = error?.code === "ERR_NETWORK" || error?.message === "Network Error";
  const isTimeout = error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT";
  const status = error?.response?.status;
  const isServerOutage = status === 502 || status === 503 || status === 504;

  if (!isNetwork && !isTimeout && !isServerOutage) {
    throw error;
  }

  const maxRetries = typeof config.maxRetries === "number" ? config.maxRetries : 1;
  const currentRetries = config.__networkRetries || 0;

  if (currentRetries >= maxRetries) {
    if (isNetwork) {
      reportNetworkFailure();
    }
    throw error;
  }

  config.__networkRetries = currentRetries + 1;

  // Exponential backoff calculation: baseDelay * 2^(retry - 1)
  const baseDelay = typeof config.retryDelay === "number" ? config.retryDelay : 600;
  const backoff = baseDelay * Math.pow(2, currentRetries);
  const jitter = typeof config.retryJitter === "number" ? Math.floor(Math.random() * config.retryJitter) : 0;
  const delay = Math.min(config.maxRetryDelay || 5000, backoff + jitter);

  await new Promise((resolve) => setTimeout(resolve, delay));
  return api.request(config);
});

// Stale response detection & error message normalization
api.interceptors.response.use(
  (response) => {
    const config = response?.config as any;
    if (config?.url) {
      const key = `${config.method || "get"}:${config.baseURL || ""}:${config.url}`;
      const lastSeq = latestCompletedSeq.get(key) || 0;
      if (config.__seq && config.__seq < lastSeq) {
        (response as any).__isStale = true;
      } else if (config.__seq) {
        latestCompletedSeq.set(key, config.__seq);
      }
    }
    return response;
  },
  (error) => {
    if (!axios.isCancel(error)) {
      error.message = getNetworkErrorMessage(error);
    }
    return Promise.reject(error);
  }
);

export function getNetworkErrorMessage(error: any): string {
  if (
    ["ECONNABORTED", "ETIMEDOUT"].includes(error?.code) ||
    (typeof error?.message === "string" && error.message.toLowerCase().includes("timed out"))
  ) {
    return "The request timed out. Check the current status before trying again.";
  }
  if (error?.response?.status >= 500) {
    switch (error.response.data?.code) {
      case "GOOGLE_AUTH_NOT_CONFIGURED":
        return "Google sign-in is not configured on this server. Use phone sign-in or contact support.";
      case "GOOGLE_VERIFICATION_UNAVAILABLE":
        return "Google sign-in cannot be verified right now. Try again shortly.";
      case "AUTH_SESSION_UNAVAILABLE":
        return "Your sign-in session could not be created. Try again shortly.";
      case "DATABASE_UNAVAILABLE":
        return "The database is temporarily unavailable. Please try again shortly.";
      case "VERIFICATION_CREDENTIALS_UNAVAILABLE":
        return "Mechanic verification is temporarily unavailable. Please try again shortly.";
      case "VERIFICATION_AI_UNAVAILABLE":
        return "Face verification is temporarily unavailable. Please try again shortly.";
      case "VERIFICATION_STORAGE_UNAVAILABLE":
        return "Verification photo storage is temporarily unavailable. Please try again shortly.";
    }
    if (error.config?.url === "/api/auth/google") {
      return "The sign-in server is temporarily unavailable. Please try again shortly.";
    }
    return "Service temporarily unavailable. Please try again shortly.";
  }
  if (error?.response?.status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }
  const serverMessage = error?.response?.data?.message;
  if (typeof serverMessage === "string" && serverMessage) {
    return serverMessage;
  }
  const responseData = error?.response?.data;
  if (typeof responseData === "string" && (responseData.includes("<html") || responseData.includes("<!DOCTYPE"))) {
    return "Request failed. Please try again.";
  }
  const dnsAndNetworkCodes = [
    "ERR_NETWORK",
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ERR_NAME_NOT_RESOLVED",
    "ENETUNREACH"
  ];
  if (dnsAndNetworkCodes.includes(error?.code) || error?.message === "Network Error") {
    return "Unable to connect. Check your internet connection and try again.";
  }
  if (error?.response) {
    return "Request failed. Please try again.";
  }
  return typeof error?.message === "string" ? error.message : "Request failed. Please try again.";
}
