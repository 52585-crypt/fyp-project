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

  const params = new URLSearchParams({
    q: trimmed,
    limit: "5",
    lang: "en"
  });

  if (near) {
    params.set("lat", String(near.latitude));
    params.set("lon", String(near.longitude));
  }

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
        if (!coordinate) return null;

        return {
          ...coordinate,
          label: formatPhotonLabel(feature),
          source: "photon" as const
        };
      })
      .filter((result): result is GeocodingResult => Boolean(result));
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
