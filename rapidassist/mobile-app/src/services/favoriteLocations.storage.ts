import * as SecureStore from "expo-secure-store";

const FAVORITE_LOCATIONS_KEY = "rapidassist.favoriteLocations";
const MAX_FAVORITE_LOCATIONS = 6;

export type FavoriteLocation = {
  id: string;
  label: string;
  addressText: string;
  latitude: number;
  longitude: number;
  savedAt: string;
};

type SaveFavoriteLocationInput = {
  label?: string;
  addressText: string;
  latitude: number;
  longitude: number;
};

function canUseSecureStore() {
  return (
    typeof (SecureStore as any)?.getItemAsync === "function" &&
    typeof (SecureStore as any)?.setItemAsync === "function"
  );
}

function canUseLocalStorage() {
  try {
    return typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function normalizeFavorite(value: unknown): FavoriteLocation | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<FavoriteLocation>;
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
    savedAt
  };
}

async function readFavoriteLocationsRaw() {
  let raw: string | null = null;
  if (canUseSecureStore()) {
    try {
      raw = await SecureStore.getItemAsync(FAVORITE_LOCATIONS_KEY);
    } catch {
      raw = null;
    }
  }
  if (!raw && canUseLocalStorage()) {
    raw = globalThis.localStorage.getItem(FAVORITE_LOCATIONS_KEY);
  }
  return raw;
}

async function writeFavoriteLocationsRaw(value: string) {
  if (canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(FAVORITE_LOCATIONS_KEY, value);
      return;
    } catch {
      // fall through to localStorage for web or broken SecureStore runtimes
    }
  }
  if (canUseLocalStorage()) {
    globalThis.localStorage.setItem(FAVORITE_LOCATIONS_KEY, value);
  }
}

function buildFavoriteLabel(input: SaveFavoriteLocationInput) {
  if (input.label?.trim()) return input.label.trim();
  const firstAddressPart = input.addressText.split(",")[0]?.trim();
  return firstAddressPart || "Saved location";
}

function isSameFavorite(a: FavoriteLocation, b: FavoriteLocation) {
  const sameAddress = a.addressText.trim().toLowerCase() === b.addressText.trim().toLowerCase();
  const sameCoordinate = Math.abs(a.latitude - b.latitude) < 0.000001 && Math.abs(a.longitude - b.longitude) < 0.000001;
  return sameAddress || sameCoordinate;
}

export async function getFavoriteLocations() {
  const raw = await readFavoriteLocationsRaw();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeFavorite).filter(Boolean).slice(0, MAX_FAVORITE_LOCATIONS) as FavoriteLocation[];
  } catch {
    return [];
  }
}

export async function saveFavoriteLocation(input: SaveFavoriteLocationInput) {
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
    savedAt: new Date().toISOString()
  };

  const existing = await getFavoriteLocations();
  const nextFavorites = [nextFavorite, ...existing.filter((item) => !isSameFavorite(item, nextFavorite))].slice(
    0,
    MAX_FAVORITE_LOCATIONS
  );
  await writeFavoriteLocationsRaw(JSON.stringify(nextFavorites));
  return nextFavorites;
}

export async function deleteFavoriteLocation(id: string) {
  const nextFavorites = (await getFavoriteLocations()).filter((item) => item.id !== id);
  await writeFavoriteLocationsRaw(JSON.stringify(nextFavorites));
  return nextFavorites;
}
