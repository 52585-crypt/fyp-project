import * as Location from "expo-location";
import { Platform } from "react-native";
import type { Coordinate } from "../utils/distance";
import { reverseGeocode } from "./geocoding";

/**
 * Best-effort readable address for a point. Android uses the platform geocoder (falling back to Photon);
 * web has no platform geocoder, so it uses Photon, the same provider that powers place search.
 */
export async function readableAddress(c: Coordinate): Promise<string | null> {
  if (Platform.OS !== "web") {
    try {
      const [a] = await Location.reverseGeocodeAsync(c);
      const parts = a ? [a.name, a.street, a.city].filter((v): v is string => Boolean(v)) : [];
      const text = parts.filter((v, i) => parts.indexOf(v) === i).join(", ");
      if (text) return text;
    } catch { /* fall through to Photon */ }
  }
  return reverseGeocode(c);
}
