import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { tokens } from "../../design/tokens";
import { isGoogleMapConfigured } from "../../services/googleMapsAvailability";
import { BOOKING_MAP_CENTER } from "../GoogleMap.shared";
import { loadMaps } from "../GoogleMapView.web";
import { canvasPoints, MAP_CANVAS_EDGE, MAP_CANVAS_FOCUS_ZOOM, type MapCanvasMarker, type MapCanvasProps } from "./MapCanvas.types";
import { TileCanvas } from "./TileCanvas";

/** Web: Google Maps JS when a web key is configured, otherwise the OSM tile canvas. Falls back if Google fails to load. */
export function MapCanvas(props: MapCanvasProps) {
  const [failed, setFailed] = useState(false);
  return isGoogleMapConfigured() && !failed ? <GoogleCanvas {...props} onFail={() => setFailed(true)} /> : <TileCanvas {...props} />;
}

const c = tokens.color;
const look: Record<MapCanvasMarker["kind"], { fill: string; scale: number; stroke: number }> = {
  pickup: { fill: c.primary, scale: 9, stroke: 4 },
  destination: { fill: c.red, scale: 9, stroke: 4 },
  user: { fill: c.primary, scale: 7, stroke: 3 },
  provider: { fill: c.amber, scale: 14, stroke: 3 }
};

function GoogleCanvas({ markers = [], route = [], focus, inset = { top: 0, bottom: 0 }, onCenterChange, initialCenter, accessibilityLabel, style, testID, onFail }:
  MapCanvasProps & { onFail: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const userPanned = useRef(false);
  const onCenter = useRef(onCenterChange);
  onCenter.current = onCenterChange;
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

  const contentKey = JSON.stringify([canvasPoints(markers, route), markers.map((m) => m.kind)]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const maps = (window as any).google.maps;
    const at = (p: { latitude: number; longitude: number }) => ({ lat: p.latitude, lng: p.longitude });
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = markers.map((m) => new maps.Marker({
      map: map.current, position: at(m.coordinate), title: m.label,
      icon: { path: maps.SymbolPath.CIRCLE, fillColor: look[m.kind].fill, fillOpacity: 1, strokeColor: c.surface, strokeWeight: look[m.kind].stroke, scale: look[m.kind].scale }
    }));
    if (route.length > 1) {
      overlays.current.push(new maps.Polyline({ map: map.current, path: route.map(at), strokeColor: c.surface, strokeWeight: 10, zIndex: 3 }));
      overlays.current.push(new maps.Polyline({ map: map.current, path: route.map(at), strokeColor: c.primary, strokeWeight: 6, zIndex: 4 }));
    }
    if (focus) {
      map.current.setZoom(MAP_CANVAS_FOCUS_ZOOM);
      map.current.panTo(at(focus.coordinate));
      if (!onCenterChange) map.current.panBy(0, (inset.bottom - inset.top) / 2);
      return;
    }
    if (onCenterChange) return;
    const points = canvasPoints(markers, route);
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
