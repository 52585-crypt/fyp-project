import axios from "axios";

const defaultApiBaseUrl = `${window.location.protocol}//${window.location.hostname}:4000`;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl;

export const adminApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000
});

// Let the auth layer know when the session has expired so it can send the admin back to login.
export const SESSION_EXPIRED_EVENT = "rapidassist:session-expired";

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || "";
    if ((status === 401 || status === 403) && !url.includes("/auth/")) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(err, fallback = "Something went wrong") {
  if (err?.code === "ERR_NETWORK") return `Cannot reach the API at ${API_BASE_URL}. Is the server running?`;
  return err?.response?.data?.message || err?.message || fallback;
}
