import type { Coordinate } from "../utils/distance";

const PHOTON_SEARCH_URL = "https://photon.komoot.io/api/";

export type GeocodingResult = Coordinate & {
  label: string;
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

  const response = await fetch(`${PHOTON_SEARCH_URL}?${params.toString()}`, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error("Location search is unavailable right now.");
  }

  const data = (await response.json()) as { features?: PhotonFeature[] };
  return (data.features || [])
    .map((feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (!coordinates) return null;

      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      return {
        latitude,
        longitude,
        label: formatPhotonLabel(feature)
      };
    })
    .filter((result): result is GeocodingResult => Boolean(result));
}

function formatPhotonLabel(feature: PhotonFeature) {
  const props = feature.properties || {};
  return [props.name, props.street, props.district, props.city, props.state, props.country]
    .filter(Boolean)
    .join(", ") || "Selected location";
}
