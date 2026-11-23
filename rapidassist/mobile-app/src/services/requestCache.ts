import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ServiceRequest } from "../requests/requests.types";

// Cached jobs are optional. A storage failure must not break live job updates.
export async function removeCachedRequest(key: string) {
  try { await AsyncStorage.removeItem(key); }
  catch (error) { console.warn("Unable to clear cached job:", error); }
}

// Scope startup migration to RapidAssist's request-cache keys only.
export async function cleanGoogleRequestCaches() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys) {
      const wrapped = key.startsWith("rapidassist.customerActiveJob.");
      if (!wrapped && !key.startsWith("rapidassist.activeJob.")) continue;
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const request = wrapped ? parsed?.request : parsed;
        if (request?.pickupLocation?.source === "google_places" || request?.destinationLocation?.source === "google_places") await removeCachedRequest(key);
      } catch { /* Leave unrelated or malformed cached data untouched. */ }
    }
  } catch (error) { console.warn("Unable to inspect cached jobs:", error); }
}

export async function readCachedRequest(key: string, wrapped = false): Promise<ServiceRequest | null> {
  try {
    const saved = await AsyncStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    const request = wrapped ? parsed?.request : parsed;
    if (request?.pickupLocation?.source === "google_places" || request?.destinationLocation?.source === "google_places") {
      await removeCachedRequest(key);
      return null;
    }
    if (!request || typeof request.id !== "string" || typeof request.status !== "string" ||
        !["mechanic", "car_towing", "fuel_delivery"].includes(request.category) ||
        !Number.isFinite(request.estimate?.total) || !request.pickupLocation) {
      await removeCachedRequest(key);
      return null;
    }
    return request;
  } catch (error) {
    console.warn("Unable to read cached job:", error);
    if (error instanceof SyntaxError) await removeCachedRequest(key);
    return null;
  }
}

export async function writeCachedRequest(key: string, request: ServiceRequest, wrapped = false) {
  try {
    if (request.pickupLocation?.source === "google_places" || request.destinationLocation?.source === "google_places") {
      await removeCachedRequest(key);
      return;
    }
    await AsyncStorage.setItem(key, JSON.stringify(wrapped ? { request, savedAt: new Date().toISOString() } : request));
  } catch (error) { console.warn("Unable to save cached job:", error); }
}
