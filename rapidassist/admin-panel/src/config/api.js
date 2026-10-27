import axios from "axios";

const defaultApiBaseUrl = `${window.location.protocol}//${window.location.hostname}:4000`;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl;

export const adminApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true
});

adminApi.interceptors.response.use((response) => response, (error) => {
  if (!axios.isCancel(error)) {
    const serverMessage = error?.response?.data?.message;
    error.message = typeof serverMessage === "string" ? serverMessage
      : error.code === "ECONNABORTED" ? "The request timed out. Check the current status and try again."
      : !error.response ? "Unable to connect to the server. Check your connection and try again."
      : "Request failed. Please try again.";
  }
  return Promise.reject(error);
});
