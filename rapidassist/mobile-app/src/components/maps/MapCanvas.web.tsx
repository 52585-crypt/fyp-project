import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { tokens } from "../../design/tokens";
import { isGoogleMapConfigured } from "../../services/googleMapsAvailability";
import { BOOKING_MAP_CENTER } from "../GoogleMap.shared";
import { loadMaps } from "../GoogleMapView.web";
import { accuracyRadius, canvasPoints, MAP_CANVAS_EDGE, MAP_CANVAS_FOCUS_ZOOM, type MapCanvasMarker, type MapCanvasProps } from "./MapCanvas.types";
import { serviceMarkerDataUrl } from "./serviceGlyphs";
import { TileCanvas } from "./TileCanvas";
import { useGlidingMarkers } from "./useGlidingMarkers";

/** Web: Google Maps JS when a web key is configured, otherwise the OSM tile canvas. Falls back if Google fails to load. */
export function MapCanvas(props: MapCanvasProps) {
  const [failed, setFailed] = useState(false);
  return isGoogleMapConfigured() && !failed ? <GoogleCanvas {...props} onFail={() => setFailed(true)} /> : <TileCanvas {...props} />;
}

const c = tokens.color;
const look: Record<MapCanvasMarker["kind"], { fill: string; scale: number; stroke: number }> = {
  pickup: { fill: c.primary, scale: 9, stroke: 4 },
  destination: { fill: c.red, scale: 9, stroke: 4 },
  user: { fill: c.myLocation, scale: tokens.sizes.mapMyLocation / 2, stroke: 3 },
  provider: { fill: c.amber, scale: 14, stroke: 3 }
};

function GoogleCanvas({ markers = [], route = [], plannedRoute = [], focus, inset = { top: 0, bottom: 0 }, onCenterChange, onMarkerPress, initialCenter, accessibilityLabel, style, testID, onFail }:
  MapCanvasProps & { onFail: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const userPanned = useRef(false);
  const onCenter = useRef(onCenterChange);
  onCenter.current = onCenterChange;
  const onMarker = useRef(onMarkerPress);
  onMarker.current = onMarkerPress;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const start = initialCenter ?? markers[0]?.coordinate ?? BOOKING_MAP_CENTER;
    loadMaps(process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY?.trim() || "").then((maps) => {
      if (!active || !element.current) return;
      map.current = new maps.Map(element.current, {
        center: { lat: start.latitude, lng: start.longitude }, zoom: MAP_CANVAS_FOCUS_ZOOM - 2,
        disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false
      });
      // Report the centre only after a user drag, never after programmatic camera moves.
      map.current.addListener("dragstart", () => { userPanned.current = true; });
      map.current.addListener("idle", () => {
        if (!userPanned.current) return;
        userPanned.current = false;
        const center = map.current.getCenter();
        onCenter.current?.({ latitude: center.lat(), longitude: center.lng() });
      });
      setReady(true);
    }).catch(() => { if (active) onFail(); });
    return () => { active = false; map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (p: { latitude: number; longitude: number }) => ({ lat: p.latitude, lng: p.longitude });
  // Drawn positions glide between live updates; the camera still fits the real targets.
  const drawn = useGlidingMarkers(markers);
  const fitted = useRef("");
  const movers = useRef(new Map<string, Array<(p: { lat: number; lng: number }) => void>>());
  // Overlays are rebuilt only when what is drawn changes (ids, looks, labels, route); positions are moved in place
  // below, so a glide or a 20 s refresh of nearby providers never recreates markers. The camera only moves for its
  // own inputs (ambient markers excluded).
  const overlayKey = JSON.stringify([markers.map((m) => [m.id, m.kind, m.service, m.label, m.ambient, m.accuracyMeters]), route, plannedRoute]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const maps = (window as any).google.maps;
    const size = tokens.sizes.mapMarkerProvider;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    movers.current = new Map();
    const track = (id: string, overlay: any, move: (p: { lat: number; lng: number }) => void) => {
      overlays.current.push(overlay);
      movers.current.set(id, [...(movers.current.get(id) ?? []), move]);
    };
    drawn.forEach((m) => {
      // The customer's position: a soft halo under the blue dot, plus a faint accuracy circle when the fix is approximate.
      if (m.kind === "user") {
        const halo = new maps.Marker({ map: map.current, position: at(m.coordinate), clickable: false, zIndex: 0,
          icon: { path: maps.SymbolPath.CIRCLE, fillColor: c.myLocationHalo, fillOpacity: 1, strokeWeight: 0, scale: tokens.sizes.mapMyLocation } });
        track(m.id, halo, (p) => halo.setPosition(p));
        const radius = accuracyRadius(m);
        if (radius) {
          const circle = new maps.Circle({ map: map.current, center: at(m.coordinate), radius, clickable: false, zIndex: 0,
            fillColor: c.myLocationAccuracy, fillOpacity: 1, strokeColor: c.myLocationAccuracyEdge, strokeOpacity: 1, strokeWeight: 1 });
          track(m.id, circle, (p) => circle.setCenter(p));
        }
      }
      const marker = new maps.Marker({
        map: map.current, position: at(m.coordinate), title: m.label, zIndex: m.ambient ? 1 : 2, clickable: Boolean(m.ambient),
        icon: m.kind === "provider" && m.service
          ? { url: serviceMarkerDataUrl(m.service), scaledSize: new maps.Size(size, size), anchor: new maps.Point(size / 2, size / 2) }
          : { path: maps.SymbolPath.CIRCLE, fillColor: look[m.kind].fill, fillOpacity: 1, strokeColor: c.surface, strokeWeight: look[m.kind].stroke, scale: look[m.kind].scale }
      });
      marker.addListener("click", () => onMarker.current?.(m.id));
      track(m.id, marker, (p) => marker.setPosition(p));
    });
    if (plannedRoute.length > 1) {
      // Dotted: an invisible stroke carrying a repeated dot symbol.
      overlays.current.push(new maps.Polyline({ map: map.current, path: plannedRoute.map(at), strokeOpacity: 0, zIndex: 2,
        icons: [{ icon: { path: maps.SymbolPath.CIRCLE, fillColor: c.routePlanned, fillOpacity: 1, strokeWeight: 0, scale: 2.5 }, offset: "0", repeat: "12px" }] }));
    }
    if (route.length > 1) {
      overlays.current.push(new maps.Polyline({ map: map.current, path: route.map(at), strokeColor: c.surface, strokeWeight: 10, zIndex: 3 }));
      overlays.current.push(new maps.Polyline({ map: map.current, path: route.map(at), strokeColor: c.primary, strokeWeight: 6, zIndex: 4 }));
    }
  }, [ready, overlayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const positionsKey = JSON.stringify(drawn.map((m) => [m.id, m.coordinate.latitude, m.coordinate.longitude]));
  useEffect(() => {
    drawn.forEach((m) => movers.current.get(m.id)?.forEach((move) => move(at(m.coordinate))));
  }, [positionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const contentKey = JSON.stringify([canvasPoints(markers, route), markers.filter((m) => !m.ambient).map((m) => m.kind)]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const maps = (window as any).google.maps;
    if (focus) {
      map.current.setZoom(MAP_CANVAS_FOCUS_ZOOM);
      map.current.panTo(at(focus.coordinate));
      if (!onCenterChange) map.current.panBy(0, (inset.bottom - inset.top) / 2);
      return;
    }
    if (onCenterChange) return;
    const points = canvasPoints(markers, route);
    // A live position update that stays inside the current view keeps the camera still, so the marker glides
    // instead of the whole map jumping; a new marker set, a new route or a point leaving the view refits.
    const shape = JSON.stringify([markers.filter((m) => !m.ambient).map((m) => m.id), route.length > 1, inset.top, inset.bottom]);
    const bounds0 = map.current.getBounds?.();
    const inside = bounds0 && points.every((p) => bounds0.contains(at(p)));
    if (fitted.current === shape && inside) return;
    fitted.current = shape;
    const padding = { top: inset.top + MAP_CANVAS_EDGE, bottom: inset.bottom + MAP_CANVAS_EDGE, left: MAP_CANVAS_EDGE, right: MAP_CANVAS_EDGE };
    if (points.length > 1) {
      const bounds = new maps.LatLngBounds();
      points.forEach((p) => bounds.extend(at(p)));
      map.current.fitBounds(bounds, padding);
    } else if (points[0]) {
      map.current.setZoom(MAP_CANVAS_FOCUS_ZOOM);
      map.current.panTo(at(points[0]));
      map.current.panBy(0, (inset.bottom - inset.top) / 2);
    }
  }, [ready, contentKey, focus?.requestId, inset.top, inset.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.fill, style]} testID={testID} accessibilityLabel={accessibilityLabel}>
      <div ref={element} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
