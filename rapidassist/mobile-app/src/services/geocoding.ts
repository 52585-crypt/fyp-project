import { DEFAULT_CENTER, SERVICE_AREA_BBOX_PARAM, isInServiceArea } from "../config/serviceArea";
import { coordinatesFromLngLat, type Coordinate } from "../utils/distance";

const PHOTON_SEARCH_URL = "https://photon.komoot.io/api/";

export type GeocodingResult = Coordinate & {
  label: string;
  source: "photon";
};

type PhotonFeature = {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    name?: string;
    street?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
  };
};

export async function searchPlaces(query: string, near?: Coordinate): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    throw new Error("Enter at least 3 characters to search a location.");
  }

  // Twin cities only: Photon returns results inside the bbox, biased to the user (or the area centre if unknown).
  const params = new URLSearchParams({
    q: trimmed,
    limit: "8",
    lang: "en",
    bbox: SERVICE_AREA_BBOX_PARAM
  });
  const bias = near ?? DEFAULT_CENTER;
  params.set("lat", String(bias.latitude));
  params.set("lon", String(bias.longitude));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${PHOTON_SEARCH_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error("Location search is unavailable right now.");
    }

    const data = (await response.json()) as { features?: PhotonFeature[] };
    if (!Array.isArray(data?.features)) throw new Error("Location search returned an invalid response. Please try again.");
    return data.features
      .map((feature) => {
        const coordinates = feature.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;

        const coordinate = coordinatesFromLngLat(coordinates);
        if (!coordinate || !isInServiceArea(coordinate.latitude, coordinate.longitude)) return null;

        return {
          ...coordinate,
          label: formatPhotonLabel(feature),
          source: "photon" as const
        };
      })
      .filter((result): result is GeocodingResult => Boolean(result))
      .slice(0, 5);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Location search timed out. Please try again.");
    if (error instanceof TypeError) throw new Error("Unable to search locations. Check your connection and try again.");
    throw error;
  } finally { clearTimeout(timeout); }
}

function formatPhotonLabel(feature: PhotonFeature) {
  const props = feature.properties || {};
  return [props.name, props.street, props.district, props.city, props.state, props.country]
    .filter(Boolean)
    .join(", ") || "Selected location";
}

const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";

/** Short street address for a point (Photon reverse geocoding), or null when nothing readable is found. */
export async function reverseGeocode(point: Coordinate): Promise<string | null> {
  const params = new URLSearchParams({ lat: String(point.latitude), lon: String(point.longitude), limit: "1", lang: "en" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${PHOTON_REVERSE_URL}?${params.toString()}`, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = (await response.json()) as { features?: PhotonFeature[] };
    const props = data?.features?.[0]?.properties;
    if (!props) return null;
    const parts = [props.name, props.street, props.district, props.city].filter((v): v is string => Boolean(v?.trim()));
    return parts.filter((v, i) => parts.indexOf(v) === i).slice(0, 3).join(", ") || null;
  } catch {
    return null;
  } finally { clearTimeout(timeout); }
}
