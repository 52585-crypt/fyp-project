import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { BOOKING_MAP_CENTER, type GoogleMapProps } from "./GoogleMap.shared";
import { tokens } from "../design/tokens";

let loading: Promise<any> | undefined;
const authFailureListeners = new Set<() => void>();
export function loadMaps(key: string): Promise<any> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const existing = (window as any).google?.maps;
    if (existing) { resolve(existing); return; }
    const script = document.createElement("script");
    const previousAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      if (typeof previousAuthFailure === "function") previousAuthFailure();
      authFailureListeners.forEach((listener) => listener());
    };
    const callbackName = "__rapidassistGoogleMapsReady";
    (window as any)[callbackName] = () => { delete (window as any)[callbackName]; resolve((window as any).google.maps); };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => { delete (window as any)[callbackName]; script.remove(); reject(new Error("Maps unavailable")); };
    document.head.appendChild(script);
  });
  loading = loading.catch((error) => { loading = undefined; throw error; });
  return loading;
}

export function GoogleMapView({ pickup, destination, providers = [], route = [], pickupLabel = "Pickup", destinationLabel = "Destination", currentLocation, cameraFocus, onPress }: GoogleMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const click = useRef(onPress);
  click.current = onPress;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY?.trim() || "";
  useEffect(() => {
    let active = true;
    const authFailure = () => { if (active) setFailed(true); };
    authFailureListeners.add(authFailure);
    loadMaps(key).then((maps) => {
      if (!active || !element.current) return;
      const center = pickup ?? destination ?? BOOKING_MAP_CENTER;
      map.current = new maps.Map(element.current, { center: { lat: center.latitude, lng: center.longitude }, zoom: 13, streetViewControl: false, mapTypeControl: false });
      map.current.addListener("click", (event: any) => { if (event.latLng) click.current?.({ latitude: event.latLng.lat(), longitude: event.latLng.lng() }); });
      setReady(true);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; authFailureListeners.delete(authFailure); map.current = null; };
  }, [key]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const maps = (window as any).google.maps;
    overlays.current.forEach((overlay) => overlay.setMap(null));
    const toLatLng = (point: { latitude: number; longitude: number }) => ({ lat: point.latitude, lng: point.longitude });
    const markers = [...(pickup ? [{ point: pickup, title: pickupLabel }] : []), ...(destination ? [{ point: destination, title: destinationLabel }] : []), ...providers.map((p) => ({ point: p.location, title: p.name })), ...(currentLocation ? [{ point: currentLocation, title: "Your current location" }] : [])];
    overlays.current = markers.map(({ point, title }) => new maps.Marker({ map: map.current, position: toLatLng(point), title }));
    if (route.length > 1) {
      const path = route.map(toLatLng);
      overlays.current.push(new maps.Polyline({ map: map.current, path, strokeColor: tokens.color.surface, strokeOpacity: 0.96, strokeWeight: 10, zIndex: 3 }));
      overlays.current.push(new maps.Polyline({ map: map.current, path, strokeColor: tokens.color.primary, strokeOpacity: 0.96, strokeWeight: 6, zIndex: 4 }));
    }
    const all = route.length > 1
      ? [...(pickup ? [pickup] : []), ...(destination ? [destination] : []), ...route]
      : markers.map(({ point }) => point);
    if (cameraFocus) { map.current.panTo(toLatLng(cameraFocus.coordinate)); map.current.setZoom(15); }
    else if (all.length > 1) { const bounds = new maps.LatLngBounds(); all.forEach((point) => bounds.extend(toLatLng(point))); map.current.fitBounds(bounds, 45); }
    else map.current.panTo(toLatLng(all[0] ?? BOOKING_MAP_CENTER));
  }, [ready, pickup, destination, providers, route, pickupLabel, destinationLabel, currentLocation, cameraFocus?.requestId]);
  return <View style={{ flex: 1 }}>{failed ? <Text>Google Maps could not load. Check your connection and Maps configuration.</Text> : <div ref={element} style={{ width: "100%", height: "100%" }} />}</View>;
}
