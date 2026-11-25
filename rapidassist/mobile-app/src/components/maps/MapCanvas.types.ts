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
};

export type MapCanvasFocus = { coordinate: Coordinate; requestId: number };

export type MapCanvasProps = {
  markers?: MapCanvasMarker[];
  route?: Coordinate[];
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
