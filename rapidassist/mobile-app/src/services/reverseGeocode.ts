import * as Location from "expo-location";
import { Platform } from "react-native";
import type { Coordinate } from "../utils/distance";

/** Best-effort street address. Android uses the platform geocoder; web has none, so it returns null. */
export async function readableAddress(c: Coordinate): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const [a] = await Location.reverseGeocodeAsync(c);
    if (!a) return null;
    const parts = [a.name, a.street, a.city].filter((v): v is string => Boolean(v));
    return parts.filter((v, i) => parts.indexOf(v) === i).join(", ") || null;
  } catch {
    return null;
  }
}
