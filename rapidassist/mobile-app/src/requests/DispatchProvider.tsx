import { customerRoutes, providerRoutes } from "../navigation/routes";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import * as Location from "expo-location";
import { useAuth } from "../auth/AuthProvider";
import { createSocket } from "../services/socket";
import { getDispatchOffers, getProviderActiveRequest, updateProviderLocation } from "./requests.api";
import type { ServiceRequest } from "./requests.types";
import { Icon, Text as DSText } from "../design/components";
import { tokens } from "../design/tokens";
import { formatCurrency } from "../utils/format";
import { startProviderBackgroundLocation, stopProviderBackgroundLocation } from "../services/backgroundLocation";
import { cleanGoogleRequestCaches, readCachedRequest, removeCachedRequest, writeCachedRequest } from "../services/requestCache";
import { useActiveLocationRefresh } from "./useActiveLocationRefresh";
import { parseRequestId } from "./requestId";
import { onReconnected } from "../services/networkManager";

type DispatchState = {
  offers: ServiceRequest[];
  activeJob: ServiceRequest | null;
  online: boolean;
  setOnline: (value: boolean) => void;
  revision: number;
  connected: boolean;
  serverOffset: number;
  error: string | null;
  locationRefreshError: string | null;
  retryLocationRefresh: () => void;
  refresh: () => Promise<void>;
  subscribeToPaymentUpdates: (listener: (requestId: string, eventId?: string) => void) => () => void;
};
const Context = createContext<DispatchState | null>(null);
export function useDispatchUpdates() {
  const context = useContext(Context);
  if (!context) throw new Error("DispatchProvider missing");
  return context;
}
export function useOfferSeconds(expiresAt?: string | null) {
  const { serverOffset } = useDispatchUpdates();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  return expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now - serverOffset) / 1000)) : 0;
}

export function DispatchProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [offers, setOffers] = useState<ServiceRequest[]>([]);
  const [activeJob, setActiveJob] = useState<ServiceRequest | null>(null);
  const { locationRefreshError, retryLocationRefresh } = useActiveLocationRefresh(token, activeJob, setActiveJob);
  const [online, setOnline] = useState(false);
  const [revision, setRevision] = useState(0);
  const [connected, setConnected] = useState(false);
  const [serverOffset, setServerOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; requestId: string } | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState !== "background");
  const sessionRef = useRef(token);
  sessionRef.current = token;
  const paymentListeners = useRef(new Set<(requestId: string, eventId?: string) => void>());
  const subscribeToPaymentUpdates = useCallback((listener: (requestId: string, eventId?: string) => void) => {
    paymentListeners.current.add(listener);
    return () => { paymentListeners.current.delete(listener); };
  }, []);
  const fetching = useRef(false);
  const freshJob = useRef(false);
  const provider = user?.role === "mechanic";
  const cacheKey = user?.id ? `rapidassist.activeJob.${user.id}` : null;

  useEffect(() => {
    void cleanGoogleRequestCaches();
  }, []);

  useEffect(() => {
    setOffers([]); setActiveJob(null); setNotice(null); setError(null);
    setOnline(Boolean(user?.providerState?.isOnline));
    freshJob.current = false;
  }, [token, user?.id, user?.providerState?.isOnline]);

  useEffect(() => {
    if (!provider || !cacheKey) return;
    let active = true;
    void readCachedRequest(cacheKey).then((saved) => {
      if (active && saved && !freshJob.current) setActiveJob(saved);
    });
    return () => { active = false; };
  }, [cacheKey, provider]);

  useEffect(() => {
    if (!cacheKey) return;
    if (activeJob) void writeCachedRequest(cacheKey, activeJob);
  }, [activeJob, cacheKey]);

  const refresh = useCallback(async () => {
    if (!token || !provider || fetching.current) return;
    fetching.current = true;
    try {
      const started = Date.now();
      const [data, active] = await Promise.all([getDispatchOffers(token), getProviderActiveRequest(token)]);
      if (sessionRef.current !== token) return;
      freshJob.current = true;
      setServerOffset(Date.parse(data.serverTime) - (started + Date.now()) / 2);
      setOffers(data.requests); setActiveJob(active); setError(null);
      if (!active && cacheKey) await removeCachedRequest(cacheKey);
    } catch (e: any) {
      if (sessionRef.current === token) setError(e?.response?.data?.message || "Connection interrupted. Retrying offers…");
    } finally { fetching.current = false; }
  }, [token, provider, cacheKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!foreground) return;
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh, foreground]);

  useEffect(() => {
    return onReconnected(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    if (!token || !foreground) return;
    const socket = createSocket(token);
    socket.on("connect", () => { setConnected(true); setRevision((n) => n + 1); void refresh(); });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("request:changed", (event: { kind: string; requestId?: string; eventId?: string }) => {
      if (sessionRef.current !== token) return;
      const requestId = parseRequestId(event.requestId);
      if (event.kind === "payment" && requestId) {
        paymentListeners.current.forEach((listener) => listener(requestId, event.eventId));
      }
      setRevision((n) => n + 1);
      if (provider) void refresh();
      else {
        if (event.kind === "arrived") setNotice({ requestId: requestId ?? "invalid", message: "Your provider has arrived at the pickup point." });
        if (event.kind === "assigned") setNotice({ requestId: requestId ?? "invalid", message: "Provider confirmed! Follow their arrival live." });
      }
    });
    socket.connect();
    return () => { socket.disconnect(); setConnected(false); };
  }, [token, provider, refresh, foreground]);

  // Lives above the screens, so navigation never stops an active job's GPS sync.
  useEffect(() => {
    if (!token || !provider || !foreground || (!online && !activeJob)) return;
    let stopped = false;
    let busy = false;
    async function sync() {
      if (busy || stopped) return;
      busy = true;
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error("Enable location permission to receive nearby jobs and share your arrival.");
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (stopped) return;
        await updateProviderLocation(token!, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          addressText: "Provider live location",
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          capturedAt: new Date(position.timestamp).toISOString()
        });
      } catch (e: any) {
        if (!stopped) setError(e?.message || "Unable to update your location.");
      } finally { busy = false; }
    }
    void sync();
    const timer = setInterval(sync, 10000);
    return () => { stopped = true; clearInterval(timer); };
  }, [token, provider, foreground, online, activeJob?.id]);

  useEffect(() => {
    if (!provider || !token || !activeJob?.id) {
      void stopProviderBackgroundLocation().catch(() => {});
      return;
    }
    void startProviderBackgroundLocation().then((started) => {
      if (!started) setError("Background location permission is needed to keep live tracking active when the app is minimized.");
    }).catch((e: any) => setError(e?.message || "Unable to start background location."));
  }, [activeJob?.id, provider, token]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  return <Context.Provider value={{ offers, activeJob, online, setOnline, revision, connected, serverOffset, error, refresh, locationRefreshError, retryLocationRefresh, subscribeToPaymentUpdates }}>
    {children}
    {notice ? <View style={[styles.notice, { top: insets.top + tokens.space.sm }]} accessibilityLiveRegion="polite">
      <Pressable style={styles.flex} accessibilityRole="button" onPress={() => { setNotice(null); router.push(customerRoutes.request(notice.requestId)); }}>
        <DSText variant="bodySmallStrong" color="onPrimary">{notice.message}</DSText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" hitSlop={tokens.space.md} onPress={() => setNotice(null)}>
        <Icon name="close" color="onPrimary" />
      </Pressable>
    </View> : null}
    {provider ? <OfferBanner /> : null}
  </Context.Provider>;
}
function OfferBanner() {
  const pathname = usePathname();
  const { offers } = useDispatchUpdates();
  const offer = offers[0];
  const seconds = useOfferSeconds(offer?.dispatch?.expiresAt);
  const insets = useSafeAreaInsets();
  // Only on tab screens (the dashboard shows offers inline; job/incoming screens have their own actions).
  if (!offer || !seconds || !["/jobs", "/earnings", "/inbox", "/profile"].includes(pathname)) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`New job, ${seconds} seconds to respond. Tap to review.`}
    style={[styles.offer, { bottom: insets.bottom + tokens.sizes.tabBar + tokens.space.lg }]} onPress={() => router.push(providerRoutes.incoming(offer.id))}>
    <DSText variant="bodySmallStrong" color="onPrimary">New roadside job · {seconds}s to respond</DSText>
    <DSText variant="caption" color="onPrimaryMuted">{formatCurrency(offer.estimate.total)} · Tap to review offer</DSText>
  </Pressable>;
}
const styles = StyleSheet.create({
  notice: {
    position: "absolute", left: tokens.space.lg, right: tokens.space.lg, padding: tokens.space.lg, borderRadius: tokens.radius.card,
    backgroundColor: tokens.color.primaryDark, flexDirection: "row", alignItems: "center", gap: tokens.space.lg, zIndex: 100, ...tokens.shadow.raised
  },
  offer: {
    position: "absolute", left: tokens.space.lg, right: tokens.space.lg, padding: tokens.space.lg, gap: tokens.space.xs,
    borderRadius: tokens.radius.card, backgroundColor: tokens.color.primary, zIndex: 90, ...tokens.shadow.raised
  },
  flex: { flex: 1 }
});
