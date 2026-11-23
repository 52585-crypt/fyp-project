import type { Feature, FeatureCollection, LineString } from "geojson";
import type { StyleProp, ViewStyle } from "react-native";

export const OPENFREEMAP_LIBERTY_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const OPENSTREETMAP_ATTRIBUTION = {
  text: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright"
} as const;

export interface RapidAssistMapCoordinate {
  latitude: number;
  longitude: number;
}

export const DEFAULT_MAP_CENTER: RapidAssistMapCoordinate = { latitude: 31.5204, longitude: 74.3587 };
export const DEFAULT_MAP_ZOOM = 12;
export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 20;
export const DEFAULT_CAMERA_DURATION_MS = 500;

export const RAPIDASSIST_MAP_CONFIG = {
  styleUrl: OPENFREEMAP_LIBERTY_STYLE,
  attribution: OPENSTREETMAP_ATTRIBUTION,
  defaultCenter: DEFAULT_MAP_CENTER,
  defaultZoom: DEFAULT_MAP_ZOOM,
  minZoom: MIN_MAP_ZOOM,
  maxZoom: MAX_MAP_ZOOM
} as const;

export type LngLat = [longitude: number, latitude: number];
export type MapBounds = [west: number, south: number, east: number, north: number];

export interface RapidAssistMapMarker {
  id: string;
  coordinate: RapidAssistMapCoordinate;
  title?: string;
  color?: string;
  label?: string;
}

export interface RapidAssistMapRouteProperties {
  color?: string;
  width?: number;
}

export interface RapidAssistMapRoute extends RapidAssistMapRouteProperties {
  coordinates: RapidAssistMapCoordinate[];
}

/** GeoJSON always stores positions in [longitude, latitude] order. */
export interface RapidAssistMapRouteGeoJSON extends Feature<LineString, RapidAssistMapRouteProperties> {}
export interface RapidAssistMapRouteGeoJSONCollection extends FeatureCollection<LineString, RapidAssistMapRouteProperties> {}

export interface RapidAssistMapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RapidAssistMapCamera {
  center?: RapidAssistMapCoordinate;
  zoom?: number;
  /** Bounds used for the first view and subsequent explicit camera updates. */
  initialBounds?: MapBounds;
  /** Backward-compatible alias for initialBounds. */
  bounds?: MapBounds;
  padding?: RapidAssistMapPadding;
  durationMs?: number;
}

export type RapidAssistMapStatus =
  | { state: "loading"; message?: string }
  | { state: "ready" }
  | { state: "error"; message: string };

export type RapidAssistMapProps = {
  markers?: RapidAssistMapMarker[];
  route?: RapidAssistMapRoute | null;
  camera?: RapidAssistMapCamera;
  mapStyle?: string;
  style?: StyleProp<ViewStyle>;
  onMapPress?: (coordinate: RapidAssistMapCoordinate) => void;
  onMarkerPress?: (marker: RapidAssistMapMarker) => void;
  onLoad?: () => void;
  onError?: (message: string) => void;
  onFallback?: () => void;
  testID?: string;
};

export type ResolvedMapCamera = {
  center: LngLat;
  zoom: number;
  bounds: MapBounds | null;
  padding: RapidAssistMapPadding;
  durationMs: number;
};

export const DEFAULT_MAP_PADDING: RapidAssistMapPadding = { top: 44, right: 44, bottom: 44, left: 44 };

export function isMapCoordinate(value: unknown): value is RapidAssistMapCoordinate {
  if (!value || typeof value !== "object") return false;
  const coordinate = value as Partial<RapidAssistMapCoordinate>;
  return typeof coordinate.latitude === "number"
    && Number.isFinite(coordinate.latitude)
    && Math.abs(coordinate.latitude) <= 90
    && typeof coordinate.longitude === "number"
    && Number.isFinite(coordinate.longitude)
    && Math.abs(coordinate.longitude) <= 180;
}

export function toLngLat(coordinate: RapidAssistMapCoordinate): LngLat {
  return [coordinate.longitude, coordinate.latitude];
}

export function fromLngLat(lngLat: readonly [number, number]): RapidAssistMapCoordinate {
  return { longitude: lngLat[0], latitude: lngLat[1] };
}

export function validMarkers(markers: RapidAssistMapMarker[] = []) {
  return markers.filter((marker) => Boolean(marker.id) && isMapCoordinate(marker.coordinate));
}

export function validRouteCoordinates(route?: RapidAssistMapRoute | null) {
  return (route?.coordinates || []).filter(isMapCoordinate);
}

export function routeFeature(route?: RapidAssistMapRoute | null): RapidAssistMapRouteGeoJSON | null {
  const coordinates = validRouteCoordinates(route);
  if (coordinates.length < 2) return null;
  return {
    type: "Feature",
    properties: {
      ...(route?.color ? { color: route.color } : {}),
      ...(Number.isFinite(route?.width) ? { width: route?.width } : {})
    },
    geometry: { type: "LineString", coordinates: coordinates.map(toLngLat) }
  };
}

export function routeFeatureCollection(route?: RapidAssistMapRoute | null): RapidAssistMapRouteGeoJSONCollection {
  const feature = routeFeature(route);
  return { type: "FeatureCollection", features: feature ? [feature] : [] };
}

export function contentCoordinates(markers: RapidAssistMapMarker[] = [], route?: RapidAssistMapRoute | null) {
  return [
    ...validMarkers(markers).map((marker) => marker.coordinate),
    ...validRouteCoordinates(route)
  ];
}

export function boundsForCoordinates(coordinates: RapidAssistMapCoordinate[]): MapBounds | null {
  const valid = coordinates.filter(isMapCoordinate);
  if (valid.length < 2) return null;
  return [
    Math.min(...valid.map((coordinate) => coordinate.longitude)),
    Math.min(...valid.map((coordinate) => coordinate.latitude)),
    Math.max(...valid.map((coordinate) => coordinate.longitude)),
    Math.max(...valid.map((coordinate) => coordinate.latitude))
  ];
}

export function isMapBounds(bounds: unknown): bounds is MapBounds {
  if (!Array.isArray(bounds) || bounds.length !== 4) return false;
  return Boolean(bounds
    && bounds.every(Number.isFinite)
    && bounds[0] >= -180 && bounds[2] <= 180
    && bounds[1] >= -90 && bounds[3] <= 90
    && bounds[0] <= bounds[2] && bounds[1] <= bounds[3]);
}

export function resolveMapCamera(
  camera: RapidAssistMapCamera = {},
  markers: RapidAssistMapMarker[] = [],
  route?: RapidAssistMapRoute | null
): ResolvedMapCamera {
  const coordinates = contentCoordinates(markers, route);
  const contentBounds = boundsForCoordinates(coordinates);
  const requestedBounds = camera.initialBounds ?? camera.bounds;
  const center = isMapCoordinate(camera.center)
    ? camera.center
    : coordinates[0] || DEFAULT_MAP_CENTER;
  return {
    center: toLngLat(center),
    zoom: Number.isFinite(camera.zoom) ? Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, Number(camera.zoom))) : DEFAULT_MAP_ZOOM,
    bounds: isMapBounds(requestedBounds) ? requestedBounds : camera.center ? null : contentBounds,
    padding: validPadding(camera.padding) ? camera.padding : DEFAULT_MAP_PADDING,
    durationMs: Number.isFinite(camera.durationMs) ? Math.max(0, Number(camera.durationMs)) : DEFAULT_CAMERA_DURATION_MS
  };
}

function validPadding(padding: RapidAssistMapPadding | undefined): padding is RapidAssistMapPadding {
  return Boolean(padding
    && Number.isFinite(padding.top) && padding.top >= 0
    && Number.isFinite(padding.right) && padding.right >= 0
    && Number.isFinite(padding.bottom) && padding.bottom >= 0
    && Number.isFinite(padding.left) && padding.left >= 0);
}
