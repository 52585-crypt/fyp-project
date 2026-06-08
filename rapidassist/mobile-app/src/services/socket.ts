import { io } from "socket.io-client";
import { API_BASE_URL } from "../config/api";

export function createSocket(token?: string | null) {
  return io(API_BASE_URL, {
    autoConnect: false,
    transports: ["websocket"],
    auth: token ? { token } : undefined
  });
}

