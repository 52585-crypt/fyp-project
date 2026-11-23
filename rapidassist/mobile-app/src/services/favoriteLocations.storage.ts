import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { NormalizedLocation } from "./normalizedLocation";

// The old unscoped key has no owner and must never be read or migrated.
const FAVORITE_LOCATIONS_PREFIX = "rapidassist.favoriteLocations.account.";
const pending = new Map<string, Promise<unknown>>();

function inAccount<T>(accountId: string, operation: (key: string) => Promise<T>): Promise<T> {
  if (typeof accountId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(accountId)) return Promise.reject(new Error("Sign in to manage saved locations."));
  const key = FAVORITE_LOCATIONS_PREFIX + accountId;
  const task = (pending.get(key) ?? Promise.resolve()).then(() => operation(key));
  const settled = task.catch(() => {});
  pending.set(key, settled);
  void settled.then(() => { if (pending.get(key) === settled) pending.delete(key); });
  return task;
}
const MAX_FAVORITE_LOCATIONS = 6;

export type FavoriteLocation = {
  id: string;
  label: string;
  addressText: string;
  latitude: number | null;
  longitude: number | null;
  savedAt: string;
  source?: NormalizedLocation["source"];
  placeId?: string;
};

export type SaveFavoriteLocationInput = {
  label?: string;
  addressText: string;
  latitude: number;
  longitude: number;
  source?: NormalizedLocation["source"];
  placeId?: string;
};

function normalizeFavorite(value: unknown): FavoriteLocation | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<FavoriteLocation>;
  if (item.source === "google_places") {
    if (!item.id) return null;
    return { id: String(item.id), label: "Location unavailable — select again", addressText: "Location unavailable", latitude: null, longitude: null,
      savedAt: typeof item.savedAt === "string" ? item.savedAt : "", source: "google_places", ...(item.placeId ? { placeId: item.placeId } : {}) };
  }
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  if (!item.id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const addressText = typeof item.addressText === "string" && item.addressText.trim() ? item.addressText.trim() : "Saved location";
  const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : addressText.split(",")[0].trim();
  const savedAt = typeof item.savedAt === "string" && item.savedAt.trim() ? item.savedAt : new Date().toISOString();

  return {
    id: String(item.id),
    label,
    addressText,
    latitude,
    longitude,
    savedAt,
    ...(item.source ? { source: item.source } : {}),
    ...(item.placeId ? { placeId: item.placeId } : {})
  };
}

function readFavoriteLocationsRaw(key: string) {
  return Platform.OS === "web" ? globalThis.localStorage.getItem(key) : SecureStore.getItemAsync(key);
}

async function writeFavoriteLocationsRaw(key: string, value: FavoriteLocation[]) {
  const raw = JSON.stringify(value);
  if (Platform.OS === "web") globalThis.localStorage.setItem(key, raw);
  else await SecureStore.setItemAsync(key, raw);
}

function buildFavoriteLabel(input: SaveFavoriteLocationInput) {
  if (input.label?.trim()) return input.label.trim();
  const firstAddressPart = input.addressText.split(",")[0]?.trim();
  return firstAddressPart || "Saved location";
}

function isSameFavorite(a: FavoriteLocation, b: FavoriteLocation) {
  const sameAddress = a.addressText.trim().toLowerCase() === b.addressText.trim().toLowerCase();
  const sameCoordinate = a.latitude != null && b.latitude != null && a.longitude != null && b.longitude != null && Math.abs(a.latitude - b.latitude) < 0.000001 && Math.abs(a.longitude - b.longitude) < 0.000001;
  return sameAddress || sameCoordinate;
}

async function readFavoriteLocations(key: string): Promise<FavoriteLocation[]> {
  const raw = await readFavoriteLocationsRaw(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const safe = parsed.map(normalizeFavorite).filter((item): item is FavoriteLocation => item !== null)
      .slice(0, MAX_FAVORITE_LOCATIONS);
    if (parsed.some((item: unknown) => (item as Partial<FavoriteLocation> | null)?.source === "google_places")) {
      await writeFavoriteLocationsRaw(key, safe);
    }
    return safe;
  } catch {
    return [];
  }
}

export function getFavoriteLocations(accountId: string) {
  return inAccount(accountId, readFavoriteLocations);
}

export async function saveFavoriteLocation(accountId: string, input: SaveFavoriteLocationInput) {
  if (input.source === "google_places") throw new Error("Google Places favorites are not available yet. Select a location on the map instead.");
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Select a valid location before saving.");
  }

  const addressText = input.addressText.trim() || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  const nextFavorite: FavoriteLocation = {
    id: `${Date.now()}`,
    label: buildFavoriteLabel({ ...input, addressText }),
    addressText,
    latitude,
    longitude,
    savedAt: new Date().toISOString(),
    ...(input.source ? { source: input.source } : {}),
    ...(input.placeId ? { placeId: input.placeId } : {})
  };

  return inAccount(accountId, async (key) => {
    const existing = await readFavoriteLocations(key);
    const next = [nextFavorite, ...existing.filter((item) => !isSameFavorite(item, nextFavorite))]
      .slice(0, MAX_FAVORITE_LOCATIONS);
    await writeFavoriteLocationsRaw(key, next);
    return next;
  });
}

export function deleteFavoriteLocation(accountId: string, id: string) {
  return inAccount(accountId, async (key) => {
    const next = (await readFavoriteLocations(key)).filter((item) => item.id !== id);
    await writeFavoriteLocationsRaw(key, next);
    return next;
  });
}
