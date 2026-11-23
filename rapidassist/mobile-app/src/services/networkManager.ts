import { Platform } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import axios from "axios";
import { API_BASE_URL, setNetworkFailureReporter } from "../config/api";

export type NetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  isBackendReachable: boolean;
  isOnline: boolean;
  connectionType: string;
  lastCheckedAt: number | null;
  isChecking: boolean;
};

type NetworkListener = (state: NetworkState) => void;
type ReconnectedCallback = () => void | Promise<void>;
type ManagedSocket = {
  connected: boolean;
  disconnected: boolean;
  connect: () => any;
};

// Dedicated health-check axios instance with no retry interceptors and short timeout
export const healthClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 4000,
  headers: {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache"
  }
});

class NetworkManager {
  private state: NetworkState = {
    isConnected: true,
    isInternetReachable: true,
    isBackendReachable: true,
    isOnline: true,
    connectionType: "unknown",
    lastCheckedAt: null,
    isChecking: false
  };

  private listeners = new Set<NetworkListener>();
  private reconnectedCallbacks = new Set<ReconnectedCallback>();
  private activeSockets = new Set<ManagedSocket>();
  private netInfoUnsubscribe: (() => void) | null = null;
  private webOnlineHandler: (() => void) | null = null;
  private webOfflineHandler: (() => void) | null = null;
  private healthCheckPromise: Promise<boolean> | null = null;
  private retryTimer: any = null;
  private isDestroyed = false;

  constructor() {
    this.init();
  }

  public init() {
    this.isDestroyed = false;
    setNetworkFailureReporter(() => this.reportNetworkFailure());
    if (Platform.OS === "web" && typeof window !== "undefined") {
      this.initWeb();
    } else {
      this.initNative();
    }
  }

  private initWeb() {
    if (typeof window === "undefined" || !window.addEventListener) return;

    this.webOnlineHandler = () => {
      this.handlePhysicalStatusChange(true, "online-event");
    };

    this.webOfflineHandler = () => {
      this.handlePhysicalStatusChange(false, "offline-event");
    };

    window.addEventListener("online", this.webOnlineHandler);
    window.addEventListener("offline", this.webOfflineHandler);

    const initialOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    this.state.isConnected = initialOnline;
    this.state.isInternetReachable = initialOnline;
    this.state.isOnline = initialOnline;
    this.state.connectionType = initialOnline ? "web" : "none";
  }

  private initNative() {
    try {
      this.netInfoUnsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
        this.handleNetInfoUpdate(netState);
      });

      void NetInfo.fetch().then((netState: NetInfoState) => {
        this.handleNetInfoUpdate(netState);
      }).catch(() => {});
    } catch (e) {
      // Fallback in environments without NetInfo native module
      this.state.isConnected = true;
      this.state.isOnline = true;
    }
  }

  private handleNetInfoUpdate(netState: NetInfoState) {
    if (this.isDestroyed) return;
    const isConnected = netState.isConnected !== false;
    const isInternetReachable = netState.isInternetReachable;
    const connectionType = netState.type || "unknown";

    const prevPhysical = this.state.isConnected;
    this.state.isConnected = isConnected;
    this.state.isInternetReachable = isInternetReachable;
    this.state.connectionType = connectionType;

    if (!isConnected || isInternetReachable === false) {
      this.updateState({
        isBackendReachable: false,
        isOnline: false
      });
      this.cancelPendingRetries();
    } else {
      // NetInfo indicates connected: verify backend
      void this.verifyBackendAndNotify(prevPhysical === false);
    }
  }

  private handlePhysicalStatusChange(isOnline: boolean, source: string) {
    if (this.isDestroyed) return;
    const prevConnected = this.state.isConnected;
    this.state.isConnected = isOnline;
    this.state.isInternetReachable = isOnline;
    this.state.connectionType = isOnline ? "web" : "none";

    if (!isOnline) {
      this.updateState({
        isBackendReachable: false,
        isOnline: false
      });
      this.cancelPendingRetries();
    } else {
      // Web connection restored: verify backend availability
      void this.verifyBackendAndNotify(prevConnected === false);
    }
  }

  /**
   * Called by API client interceptor when an active network error occurs.
   * Enables immediate detection even if browser events lag during Wi-Fi handover.
   */
  public reportNetworkFailure() {
    if (this.isDestroyed) return;
    if (this.state.isBackendReachable || this.state.isOnline) {
      this.updateState({
        isBackendReachable: false,
        isOnline: false
      });
      // Start probing for recovery
      this.scheduleRecoveryProbe(1000);
    }
  }

  private scheduleRecoveryProbe(delayMs: number) {
    this.cancelPendingRetries();
    if (this.isDestroyed) return;

    this.retryTimer = setTimeout(async () => {
      if (this.isDestroyed) return;
      const ok = await this.checkBackendHealth({ silent: true });
      if (ok) {
        this.notifyReconnected();
      } else {
        // Backoff up to 5s
        const nextDelay = Math.min(delayMs * 1.5, 5000);
        this.scheduleRecoveryProbe(nextDelay);
      }
    }, delayMs);
  }

  private cancelPendingRetries() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Verify actual backend reachability via /health endpoint.
   */
  public async checkBackendHealth(options?: { timeoutMs?: number; silent?: boolean; force?: boolean }): Promise<boolean> {
    if (this.healthCheckPromise && !options?.force) {
      return this.healthCheckPromise;
    }

    if (!options?.silent) {
      this.updateState({ isChecking: true });
    }

    this.healthCheckPromise = (async () => {
      try {
        const timeoutMs = options?.timeoutMs || 4000;
        const res = await healthClient.get("/health", {
          params: { _t: Date.now() },
          timeout: timeoutMs
        });
        const ok = res.status >= 200 && res.status < 300 && (res.data?.ok === true || Boolean(res.data));
        this.updateState({
          isBackendReachable: ok,
          isOnline: ok && this.state.isConnected,
          lastCheckedAt: Date.now(),
          isChecking: false
        });
        return ok;
      } catch (err) {
        this.updateState({
          isBackendReachable: false,
          isOnline: false,
          lastCheckedAt: Date.now(),
          isChecking: false
        });
        return false;
      } finally {
        this.healthCheckPromise = null;
      }
    })();

    return this.healthCheckPromise;
  }

  private async verifyBackendAndNotify(wasDisconnected: boolean) {
    const isAvailable = await this.checkBackendHealth({ force: true });
    if (isAvailable) {
      this.cancelPendingRetries();
      this.notifyReconnected();
    } else {
      // Backend not yet ready (e.g. DNS handover settling), probe again soon
      this.scheduleRecoveryProbe(1500);
    }
  }

  private notifyReconnected() {
    // 1. Reconnect registered sockets
    this.reconnectSockets();

    // 2. Call registered reconnected callbacks (for screens/providers)
    for (const callback of this.reconnectedCallbacks) {
      try {
        const res = callback();
        if (res && typeof (res as any).catch === "function") {
          (res as Promise<any>).catch((err) => console.warn("Reconnection handler error:", err));
        }
      } catch (e) {
        console.warn("Reconnection callback error:", e);
      }
    }
  }

  private reconnectSockets() {
    for (const socket of this.activeSockets) {
      try {
        if (!socket.connected) {
          socket.connect();
        }
      } catch (e) {
        console.warn("Socket reconnection error:", e);
      }
    }
  }

  /**
   * Manual reconnect trigger for UI buttons.
   */
  public async reconnect(): Promise<void> {
    const isAvailable = await this.checkBackendHealth({ silent: false, force: true });
    if (isAvailable) {
      this.notifyReconnected();
    }
  }

  public getState(): NetworkState {
    return { ...this.state };
  }

  public addListener(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    // Initial call
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onReconnected(callback: ReconnectedCallback): () => void {
    this.reconnectedCallbacks.add(callback);
    return () => {
      this.reconnectedCallbacks.delete(callback);
    };
  }

  public registerSocket(socket: ManagedSocket): () => void {
    this.activeSockets.add(socket);
    return () => {
      this.activeSockets.delete(socket);
    };
  }

  private updateState(partial: Partial<NetworkState>) {
    this.state = { ...this.state, ...partial };
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (e) {
        console.warn("Network listener error:", e);
      }
    }
  }

  public destroy() {
    this.isDestroyed = true;
    setNetworkFailureReporter(null);
    this.cancelPendingRetries();
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
    if (Platform.OS === "web" && typeof window !== "undefined" && window.removeEventListener) {
      if (this.webOnlineHandler) window.removeEventListener("online", this.webOnlineHandler);
      if (this.webOfflineHandler) window.removeEventListener("offline", this.webOfflineHandler);
    }
    this.listeners.clear();
    this.reconnectedCallbacks.clear();
    this.activeSockets.clear();
  }
}

export const networkManager = new NetworkManager();
export const onReconnected = (cb: ReconnectedCallback) => networkManager.onReconnected(cb);
export const registerSocket = (socket: ManagedSocket) => networkManager.registerSocket(socket);
