import axios from "axios";

const defaultApiBaseUrl = `${window.location.protocol}//${window.location.hostname}:4000`;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl;

export const adminApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});
