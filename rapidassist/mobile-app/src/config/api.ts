import axios from "axios";

// For Android emulator use: http://10.0.2.2:4000
// For real device use your PC LAN IP, e.g. http://192.168.1.5:4000
export const API_BASE_URL = "http://10.0.2.2:4000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

