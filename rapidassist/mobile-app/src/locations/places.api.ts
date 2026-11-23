import { api } from "../config/api";
import type { Coordinate } from "../utils/distance";
import type { NormalizedLocation } from "../services/normalizedLocation";

export type LocationSuggestion = {
  provider: "google_places" | "photon";
  id: string;
  primaryText: string;
  secondaryText?: string;
};

type GoogleSelection = {
  provider: "google_places";
  id: string;
  latitude: number;
  longitude: number;
  address?: string;
};

export async function autocompleteGooglePlaces(
  token: string,
  input: string,
  sessionToken: string,
  near?: Coordinate,
  signal?: AbortSignal
) {
  const response = await api.post<{ ok: boolean; provider: "google_places"; suggestions: LocationSuggestion[] }>(
    "/api/locations/autocomplete",
    { input, sessionToken, ...(near ? { near } : {}) },
    { headers: { Authorization: `Bearer ${token}` }, signal }
  );
  return response.data.suggestions;
}

export async function resolveGoogleSuggestion(
  token: string,
  suggestion: LocationSuggestion,
  sessionToken: string,
  signal?: AbortSignal
): Promise<NormalizedLocation> {
  const response = await api.post<{ ok: boolean; location: GoogleSelection }>(
    "/api/locations/details",
    { placeId: suggestion.id, sessionToken },
    { headers: { Authorization: `Bearer ${token}` }, signal }
  );
  const location = response.data.location;
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    address: location.address || [suggestion.primaryText, suggestion.secondaryText].filter(Boolean).join(", "),
    displayName: suggestion.primaryText,
    placeId: location.id,
    source: "google_places"
  };
}
