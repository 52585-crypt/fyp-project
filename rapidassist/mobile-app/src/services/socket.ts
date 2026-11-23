import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "../config/api";
import { registerSocket } from "./networkManager";

export function createSocket(token?: string | null): Socket {
  const socket = io(API_BASE_URL, {
    autoConnect: false,
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: token ? { token } : undefined
  });

  const unregister = registerSocket(socket);
  const originalDisconnect = socket.disconnect.bind(socket);

  socket.disconnect = () => {
    unregister();
    return originalDisconnect();
  };

  return socket;
}
