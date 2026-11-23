import { coordinatesFromUnknown, type Coordinate } from "../utils/distance";
import type { GeocodingResult } from "../services/geocoding";
import { normalizeLocation, type NormalizedLocation } from "../services/normalizedLocation";
import type { LocationSuggestion } from "./places.api";

export type AutocompleteState = {
  suggestions: LocationSuggestion[];
  provider: LocationSuggestion["provider"] | null;
  loading: boolean;
  error: string | null;
};

type ControllerOptions = {
  googleEnabled: boolean;
  googleSearch: (query: string, sessionToken: string, near: Coordinate | undefined, signal: AbortSignal) => Promise<LocationSuggestion[]>;
  googleDetails: (suggestion: LocationSuggestion, sessionToken: string, signal: AbortSignal) => Promise<NormalizedLocation>;
  photonSearch: (query: string, near?: Coordinate) => Promise<GeocodingResult[]>;
  debounceMs?: number;
  sessionTimeoutMs?: number;
  createSessionToken?: () => string;
  now?: () => number;
};

export type LocationAutocompleteController = ReturnType<typeof createLocationAutocompleteController>;

export function createPlacesSessionToken() {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) return randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createLocationAutocompleteController(options: ControllerOptions) {
  const debounceMs = options.debounceMs ?? 350;
  const sessionTimeoutMs = options.sessionTimeoutMs ?? 3 * 60 * 1000;
  const now = options.now || Date.now;
  const createSessionToken = options.createSessionToken || createPlacesSessionToken;
  const listeners = new Set<(state: AutocompleteState) => void>();
  const photonLocations = new Map<string, GeocodingResult>();
  let state: AutocompleteState = { suggestions: [], provider: null, loading: false, error: null };
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let sessionToken: string | null = null;
  let sessionTouchedAt = 0;
  let lastQuery = "";
  let lastNear: Coordinate | undefined;

  function publish(next: Partial<AutocompleteState>) {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener(state));
  }

  function clearPending() {
    if (timer) clearTimeout(timer);
    timer = null;
    abortController?.abort();
    abortController = null;
  }

  function resetSession() {
    sessionToken = null;
    sessionTouchedAt = 0;
  }

  function currentSessionToken() {
    const currentTime = now();
    if (!sessionToken || currentTime - sessionTouchedAt >= sessionTimeoutMs) sessionToken = createSessionToken();
    sessionTouchedAt = currentTime;
    return sessionToken;
  }

  function photonSuggestions(results: GeocodingResult[]) {
    photonLocations.clear();
    return results.slice(0, 5).map((result, index) => {
      const id = `photon:${sequence}:${index}`;
      photonLocations.set(id, result);
      const [primaryText, ...rest] = result.label.split(",");
      return {
        provider: "photon" as const,
        id,
        primaryText: primaryText.trim() || result.label,
        ...(rest.length ? { secondaryText: rest.join(",").trim() } : {})
      };
    });
  }

  async function runSearch(searchSequence: number) {
    abortController = new AbortController();
    const signal = abortController.signal;
    publish({ loading: true, error: null });
    if (options.googleEnabled) {
      try {
        const token = currentSessionToken();
        const suggestions = await options.googleSearch(lastQuery, token, lastNear, signal);
        if (searchSequence !== sequence || signal.aborted) return;
        publish({ suggestions, provider: "google_places", loading: false, error: null });
        return;
      } catch {
        if (searchSequence !== sequence || signal.aborted) return;
      }
    }
    try {
      const results = await options.photonSearch(lastQuery, lastNear);
      if (searchSequence !== sequence) return;
      publish({ suggestions: photonSuggestions(results), provider: "photon", loading: false, error: null });
    } catch (error: any) {
      if (searchSequence !== sequence) return;
      publish({ suggestions: [], provider: null, loading: false, error: error?.message || "Location search is unavailable." });
    }
  }

  function setQuery(query: string, near?: Coordinate, immediate = false) {
    lastQuery = query.trim();
    lastNear = near === undefined ? undefined : coordinatesFromUnknown(near) || undefined;
    sequence += 1;
    const searchSequence = sequence;
    clearPending();
    photonLocations.clear();
    if (!lastQuery) {
      resetSession();
      publish({ suggestions: [], provider: null, loading: false, error: null });
      return;
    }
    if (lastQuery.length < 3) {
      publish({ suggestions: [], provider: null, loading: false, error: null });
      return;
    }
    timer = setTimeout(() => { timer = null; void runSearch(searchSequence); }, immediate ? 0 : debounceMs);
  }

  async function select(suggestion: LocationSuggestion) {
    sequence += 1;
    clearPending();
    publish({ loading: true, error: null });
    try {
      let location: NormalizedLocation;
      if (suggestion.provider === "google_places") {
        if (!sessionToken) throw new Error("Location search session expired. Search again.");
        abortController = new AbortController();
        location = normalizeLocation(await options.googleDetails(suggestion, sessionToken, abortController.signal));
      } else {
        const result = photonLocations.get(suggestion.id);
        if (!result) throw new Error("This location suggestion expired. Search again.");
        location = normalizeLocation({ latitude: result.latitude, longitude: result.longitude, address: result.label, source: "photon" });
      }
      resetSession();
      photonLocations.clear();
      publish({ suggestions: [], provider: null, loading: false, error: null });
      return location;
    } catch (error: any) {
      publish({ loading: false, error: error?.message || "Unable to select this location. Try again." });
      throw error;
    }
  }

  return {
    subscribe(listener: (next: AutocompleteState) => void) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    setQuery,
    retry(near?: Coordinate) {
      if (lastQuery.length >= 3) setQuery(lastQuery, near === undefined ? lastNear : near, true);
    },
    select,
    reset() {
      sequence += 1;
      clearPending();
      resetSession();
      photonLocations.clear();
      publish({ suggestions: [], provider: null, loading: false, error: null });
    },
    dispose() {
      sequence += 1;
      clearPending();
      listeners.clear();
    }
  };
}
