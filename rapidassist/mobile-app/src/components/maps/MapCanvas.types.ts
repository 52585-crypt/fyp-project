import type { StyleProp, ViewStyle } from "react-native";
import type { Coordinate } from "../../utils/distance";

/**
 * Full-bleed map used by the map-first customer screens.
 * Renderers: react-native-maps (Android, Google key set), Google Maps JS (web, key set),
 * otherwise the shared OSM tile canvas (WebView on Android, iframe on web).
 */
export type MapCanvasMarkerKind = "pickup" | "destination" | "provider" | "user";

export type MapCanvasService = "mechanic" | "towing" | "fuel_delivery";
export const MAP_CANVAS_SERVICES: ReadonlyArray<MapCanvasService> = ["mechanic", "towing", "fuel_delivery"];

export type MapCanvasMarker = {
  id: string;
  coordinate: Coordinate;
  kind: MapCanvasMarkerKind;
  label?: string;
  /** Provider markers: which service, drawn with its own colour and glyph. */
  service?: MapCanvasService;
  /** Shown, but ignored when fitting the camera (e.g. nearby providers around the customer). */
  ambient?: boolean;
  /** "user" markers: radius in metres of a faint accuracy circle, set only when the position is approximate. */
  accuracyMeters?: number;
};

export type MapCanvasFocus = { coordinate: Coordinate; requestId: number };

export type MapCanvasProps = {
  markers?: MapCanvasMarker[];
  route?: Coordinate[];
  /** The whole planned trip (e.g. tow pickup → drop-off), drawn muted and dotted under `route`; not used for fitting. */
  plannedRoute?: Coordinate[];
  /** Explicit camera target; bump `requestId` to re-centre. Otherwise the camera fits markers + route. */
  focus?: MapCanvasFocus | null;
  /** Pixels covered by overlays (top bar, bottom sheet) that the camera keeps content clear of. In pin mode it only moves controls. */
  inset?: { top: number; bottom: number };
  /** Pin mode: called with the map centre after each user pan (never for programmatic moves). */
  onCenterChange?: (center: Coordinate) => void;
  /** Called with a marker's id when the user taps it (a tap, not the end of a drag). */
  onMarkerPress?: (id: string) => void;
  /** Starting camera when there is nothing to fit yet. */
  initialCenter?: Coordinate;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const MAP_CANVAS_FOCUS_ZOOM = 15;
export const MAP_CANVAS_EDGE = 48;
/** Largest accuracy circle drawn; matches the coarsest fix the app accepts. */
export const MAP_CANVAS_MAX_ACCURACY_METERS = 2_000;

/** A moved marker glides to its new position over this long instead of jumping (live provider updates). */
export const MAP_CANVAS_GLIDE_MS = 900;
/** Moves longer than this snap: a glide across town would show a car driving through buildings. */
export const MAP_CANVAS_MAX_GLIDE_KM = 3;

/** Ease-out cubic progress for a glide that is `t` (0..1) of the way through. */
export function glideProgress(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** The position `t` (0..1) of the way through a glide from `from` to `to`. */
export function glidePoint(from: Coordinate, to: Coordinate, t: number): Coordinate {
  const k = glideProgress(t);
  return { latitude: from.latitude + (to.latitude - from.latitude) * k, longitude: from.longitude + (to.longitude - from.longitude) * k };
}

/** Whether a move from `from` to `to` should glide (it moved, and not further than the snap distance). */
export function shouldGlide(from: Coordinate, to: Coordinate) {
  if (from.latitude === to.latitude && from.longitude === to.longitude) return false;
  const kmLat = (to.latitude - from.latitude) * 111.32;
  const kmLng = (to.longitude - from.longitude) * 111.32 * Math.cos((from.latitude * Math.PI) / 180);
  return Math.hypot(kmLat, kmLng) <= MAP_CANVAS_MAX_GLIDE_KM;
}

/** The accuracy circle radius for a marker, or null when none should be drawn. */
export function accuracyRadius(marker: Pick<MapCanvasMarker, "kind" | "accuracyMeters">): number | null {
  const r = Number(marker.accuracyMeters);
  return marker.kind === "user" && marker.accuracyMeters != null && Number.isFinite(r) && r > 0
    ? Math.min(r, MAP_CANVAS_MAX_ACCURACY_METERS) : null;
}

export function isCoordinate(value: unknown): value is Coordinate {
  const c = value as Partial<Coordinate> | null;
  return Boolean(c) && typeof c!.latitude === "number" && Number.isFinite(c!.latitude) && Math.abs(c!.latitude) <= 90
    && typeof c!.longitude === "number" && Number.isFinite(c!.longitude) && Math.abs(c!.longitude) <= 180;
}

/** Everything the camera should keep in view (ambient markers excluded). */
export function canvasPoints(markers: MapCanvasMarker[] = [], route: Coordinate[] = []) {
  return [...markers.filter((m) => !m.ambient).map((m) => m.coordinate), ...route].filter(isCoordinate);
}

/** Parses a marker tap posted from the tile canvas document: the marker id, or null for anything else. */
export function parseCanvasMarkerTap(raw: unknown, instance: string): string | null {
  if (typeof raw !== "string") return null;
  try {
    const m = JSON.parse(raw) as { type?: unknown; id?: unknown; marker?: unknown };
    return m?.type === "marker" && m.id === instance && typeof m.marker === "string" && m.marker ? m.marker : null;
  } catch {
    return null;
  }
}

/** Parses a centre report posted from the tile canvas document. Returns null for anything else. */
export function parseCanvasMessage(raw: unknown, instance: string): Coordinate | null {
  if (typeof raw !== "string") return null;
  try {
    const m = JSON.parse(raw) as { type?: unknown; id?: unknown; latitude?: unknown; longitude?: unknown };
    if (m?.type !== "center" || m.id !== instance) return null;
    const c = { latitude: m.latitude, longitude: m.longitude };
    return isCoordinate(c) ? c : null;
  } catch {
    return null;
  }
}
