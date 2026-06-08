import React, { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors } from "../theme/colors";
import type { Coordinate } from "../utils/distance";
import { TargetSwitch, type LocationTarget } from "./LocationMapPicker.shared";

const CARTO_TILE_URL = "https://basemaps.cartocdn.com/rastertiles/voyager";
const INITIAL_ZOOM = 13;
const MIN_ZOOM = 10;
const MAX_ZOOM = 18;

type Props = {
  pickup: Coordinate;
  destination: Coordinate;
  providers?: Array<{
    id: string;
    name: string;
    distanceKm?: number | null;
    location: Coordinate;
  }>;
  activeTarget: LocationTarget;
  onActiveTargetChange: (target: LocationTarget) => void;
  onPickupChange: (coordinate: Coordinate) => void;
  onDestinationChange: (coordinate: Coordinate) => void;
  singlePoint?: boolean;
  pointLabel?: string;
  pickupLabel?: string;
  destinationLabel?: string;
};

export function LocationMapPicker({
  pickup,
  destination,
  providers = [],
  activeTarget,
  onActiveTargetChange,
  onPickupChange,
  onDestinationChange,
  singlePoint,
  pointLabel = "Service location",
  pickupLabel = "Pickup",
  destinationLabel = "Destination"
}: Props) {
  const [fullMapVisible, setFullMapVisible] = useState(false);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const html = useMemo(
    () => buildMapHtml({ pickup, destination, providers, activeTarget, zoom, singlePoint: Boolean(singlePoint), pointLabel, pickupLabel, destinationLabel }),
    [activeTarget, destination, destinationLabel, pickup, pickupLabel, pointLabel, providers, singlePoint, zoom]
  );

  function updateZoom(delta: number) {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + delta)));
  }

  function onMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        latitude?: number;
        longitude?: number;
      };

      if (message.type !== "mapPress") return;
      if (!Number.isFinite(message.latitude) || !Number.isFinite(message.longitude)) return;

      const coordinate = {
        latitude: Number(message.latitude),
        longitude: Number(message.longitude)
      };

      if (singlePoint || activeTarget === "pickup") {
        onPickupChange(coordinate);
      } else {
        onDestinationChange(coordinate);
      }
    } catch {
      // Ignore malformed WebView messages.
    }
  }

  return (
    <View style={styles.wrap}>
      {singlePoint ? null : <TargetSwitch activeTarget={activeTarget} onActiveTargetChange={onActiveTargetChange} />}
      <View style={styles.mapWrap}>
        <MapWebView html={html} activeTarget={activeTarget} pickup={pickup} destination={destination} zoom={zoom} onMessage={onMessage} />
        <View pointerEvents="none" style={styles.hint}>
          <Text style={styles.hintText}>
            OpenStreetMap - tap to set {singlePoint ? pointLabel.toLowerCase() : activeTarget === "pickup" ? "pickup" : "destination"}
          </Text>
        </View>
        <Pressable onPress={() => setFullMapVisible(true)} style={styles.expandButton}>
          <Ionicons name="expand" size={17} color={colors.primary} />
          <Text style={styles.expandText}>Full map</Text>
        </Pressable>
        <ZoomControls zoom={zoom} onZoomIn={() => updateZoom(1)} onZoomOut={() => updateZoom(-1)} />
      </View>
      <View style={styles.coordinateChips}>
        <CoordinateChip label={singlePoint ? pointLabel : pickupLabel} coordinate={pickup} tone="pickup" />
        {singlePoint ? null : <CoordinateChip label={destinationLabel} coordinate={destination} tone="destination" />}
      </View>
      <Modal visible={fullMapVisible} animationType="slide" onRequestClose={() => setFullMapVisible(false)}>
        <SafeAreaView style={styles.fullScreen}>
          <View style={styles.fullHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fullTitle}>Pick Location</Text>
              <Text style={styles.fullSubtitle}>
                {singlePoint ? "Tap the map to set the service location." : "Select pickup or destination, then tap the map."}
              </Text>
            </View>
            <Pressable onPress={() => setFullMapVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          {singlePoint ? null : (
            <View style={styles.fullSwitch}>
              <TargetSwitch activeTarget={activeTarget} onActiveTargetChange={onActiveTargetChange} />
            </View>
          )}
            <View style={styles.fullMap}>
            <MapWebView html={html} activeTarget={activeTarget} pickup={pickup} destination={destination} zoom={zoom} onMessage={onMessage} />
            <View pointerEvents="none" style={styles.fullHint}>
              <Text style={styles.hintText}>
                Tap map to set {singlePoint ? pointLabel.toLowerCase() : activeTarget === "pickup" ? "pickup" : "destination"}
              </Text>
            </View>
            <ZoomControls zoom={zoom} onZoomIn={() => updateZoom(1)} onZoomOut={() => updateZoom(-1)} fullScreen />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function CoordinateChip({
  label,
  coordinate,
  tone
}: {
  label: string;
  coordinate: Coordinate;
  tone: "pickup" | "destination";
}) {
  return (
    <View style={styles.coordinateChip}>
      <View style={[styles.coordinateDot, tone === "destination" ? styles.destinationDot : styles.pickupDot]} />
      <Text style={styles.coordinateText}>
        {label}: {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
      </Text>
    </View>
  );
}

function MapWebView({
  html,
  activeTarget,
  pickup,
  destination,
  zoom,
  onMessage
}: {
  html: string;
  activeTarget: LocationTarget;
  pickup: Coordinate;
  destination: Coordinate;
  zoom: number;
  onMessage: (event: WebViewMessageEvent) => void;
}) {
  return (
    <WebView
      key={`${activeTarget}-${zoom}-${pickup.latitude}-${pickup.longitude}-${destination.latitude}-${destination.longitude}`}
      originWhitelist={["*"]}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      onMessage={onMessage}
      style={styles.webView}
    />
  );
}

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  fullScreen
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  fullScreen?: boolean;
}) {
  return (
    <View style={[styles.zoomControls, fullScreen ? styles.zoomControlsFull : null]}>
      <Pressable
        onPress={onZoomIn}
        disabled={zoom >= MAX_ZOOM}
        style={({ pressed }) => [styles.zoomButton, zoom >= MAX_ZOOM ? styles.zoomButtonDisabled : null, pressed ? styles.zoomButtonPressed : null]}
      >
        <Ionicons name="add" size={22} color={colors.text} />
      </Pressable>
      <View style={styles.zoomDivider} />
      <Pressable
        onPress={onZoomOut}
        disabled={zoom <= MIN_ZOOM}
        style={({ pressed }) => [styles.zoomButton, zoom <= MIN_ZOOM ? styles.zoomButtonDisabled : null, pressed ? styles.zoomButtonPressed : null]}
      >
        <Ionicons name="remove" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

function buildMapHtml({
  pickup,
  destination,
  providers,
  activeTarget,
  zoom,
  singlePoint,
  pointLabel,
  pickupLabel,
  destinationLabel
}: {
  pickup: Coordinate;
  destination: Coordinate;
  providers: Array<{
    id: string;
    name: string;
    distanceKm?: number | null;
    location: Coordinate;
  }>;
  activeTarget: LocationTarget;
  zoom: number;
  singlePoint: boolean;
  pointLabel: string;
  pickupLabel: string;
  destinationLabel: string;
}) {
  const payload = JSON.stringify({
    pickup,
    destination,
    providers,
    activeTarget,
    zoom,
    tileUrl: CARTO_TILE_URL,
    singlePoint,
    pointLabel,
    pickupLabel,
    destinationLabel
  });

  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body, #map {
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #eef2f7;
        font-family: Arial, sans-serif;
        touch-action: manipulation;
      }
      .tile {
        position: absolute;
        width: 256px;
        height: 256px;
      }
      .marker {
        position: absolute;
        width: 34px;
        height: 34px;
        margin-left: -17px;
        margin-top: -17px;
        border-radius: 17px;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 10px rgba(15, 23, 42, 0.32);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 900;
        z-index: 8;
        pointer-events: none;
      }
      .pickup { background: #2563eb; }
      .destination { background: #dc2626; }
      .provider { background: #16a34a; font-size: 13px; }
      .label {
        position: absolute;
        transform: translate(-50%, 18px);
        z-index: 9;
        border-radius: 10px;
        background: rgba(255,255,255,0.96);
        padding: 4px 7px;
        color: #0f172a;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.16);
        pointer-events: none;
      }
      .route {
        position: absolute;
        height: 4px;
        border-radius: 2px;
        background: #2563eb;
        transform-origin: left center;
        z-index: 3;
      }
      .attribution {
        position: absolute;
        right: 8px;
        bottom: 8px;
        z-index: 6;
        border-radius: 9px;
        background: rgba(255,255,255,0.92);
        padding: 5px 8px;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      const data = ${payload};
      const tileSize = 256;
      const map = document.getElementById("map");

      function worldPoint(coordinate, scale) {
        const sinLat = Math.sin(coordinate.latitude * Math.PI / 180);
        return {
          x: ((coordinate.longitude + 180) / 360) * scale,
          y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
        };
      }

      function coordinateFromWorld(point, scale) {
        const longitude = (point.x / scale) * 360 - 180;
        const n = Math.PI - (2 * Math.PI * point.y) / scale;
        const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
        return { latitude, longitude };
      }

      function draw() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const scale = tileSize * Math.pow(2, data.zoom);
        const points = data.singlePoint ? [data.pickup, ...data.providers.map((provider) => provider.location)] : [data.pickup, data.destination, ...data.providers.map((provider) => provider.location)];
        const validPoints = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
        const center = validPoints.length
          ? {
              latitude: validPoints.reduce((sum, point) => sum + point.latitude, 0) / validPoints.length,
              longitude: validPoints.reduce((sum, point) => sum + point.longitude, 0) / validPoints.length
            }
          : data.pickup;
        const centerPoint = worldPoint(center, scale);
        const topLeft = {
          x: centerPoint.x - width / 2,
          y: centerPoint.y - height / 2
        };
        const maxTile = Math.pow(2, data.zoom);

        map.innerHTML = "";

        const startX = Math.floor(topLeft.x / tileSize);
        const endX = Math.floor((topLeft.x + width) / tileSize);
        const startY = Math.floor(topLeft.y / tileSize);
        const endY = Math.floor((topLeft.y + height) / tileSize);

        for (let x = startX; x <= endX; x += 1) {
          for (let y = startY; y <= endY; y += 1) {
            if (y < 0 || y >= maxTile) continue;
            const urlX = ((x % maxTile) + maxTile) % maxTile;
            const img = document.createElement("img");
            img.className = "tile";
            img.src = data.tileUrl + "/" + data.zoom + "/" + urlX + "/" + y + ".png";
            img.style.left = (x * tileSize - topLeft.x) + "px";
            img.style.top = (y * tileSize - topLeft.y) + "px";
            map.appendChild(img);
          }
        }

        const pickup = toScreenPoint(data.pickup, topLeft, scale);
        const destination = toScreenPoint(data.destination, topLeft, scale);
        if (!data.singlePoint) addRoute(pickup, destination);
        addMarker(pickup, "pickup", "P", data.singlePoint ? data.pointLabel : data.pickupLabel);
        if (!data.singlePoint) addMarker(destination, "destination", "D", data.destinationLabel);
        data.providers.forEach((provider) => {
          const providerPoint = toScreenPoint(provider.location, topLeft, scale);
          const distanceText = Number.isFinite(provider.distanceKm) ? " - " + provider.distanceKm + " km" : "";
          addMarker(providerPoint, "provider", "V", provider.name + distanceText);
        });

        const attribution = document.createElement("div");
        attribution.className = "attribution";
        attribution.textContent = "OpenStreetMap, CARTO";
        map.appendChild(attribution);

        map.onclick = function(event) {
          const coordinate = coordinateFromWorld(
            { x: topLeft.x + event.clientX, y: topLeft.y + event.clientY },
            scale
          );
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "mapPress",
            target: data.activeTarget,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
          }));
        };
      }

      function toScreenPoint(coordinate, topLeft, scale) {
        const point = worldPoint(coordinate, scale);
        return { x: point.x - topLeft.x, y: point.y - topLeft.y };
      }

      function addMarker(point, className, text, labelText) {
        const marker = document.createElement("div");
        marker.className = "marker " + className;
        marker.textContent = text;
        marker.style.left = point.x + "px";
        marker.style.top = point.y + "px";
        map.appendChild(marker);

        const label = document.createElement("div");
        label.className = "label";
        label.textContent = labelText;
        label.style.left = point.x + "px";
        label.style.top = point.y + "px";
        map.appendChild(label);
      }

      function addRoute(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const line = document.createElement("div");
        line.className = "route";
        line.style.left = from.x + "px";
        line.style.top = from.y + "px";
        line.style.width = Math.sqrt(dx * dx + dy * dy) + "px";
        line.style.transform = "rotate(" + (Math.atan2(dy, dx) * 180 / Math.PI) + "deg)";
        map.appendChild(line);
      }

      window.addEventListener("resize", draw);
      draw();
    </script>
  </body>
</html>`;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  mapWrap: {
    height: 260,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted
  },
  webView: { flex: 1, backgroundColor: colors.surfaceMuted },
  coordinateChips: { gap: 7 },
  coordinateChip: {
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  coordinateDot: { width: 10, height: 10, borderRadius: 5 },
  pickupDot: { backgroundColor: colors.primary },
  destinationDot: { backgroundColor: colors.danger },
  coordinateText: { flex: 1, color: colors.text, fontSize: 11, fontWeight: "800" },
  hint: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  hintText: { color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "center" },
  expandButton: {
    position: "absolute",
    right: 12,
    bottom: 12,
    minHeight: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  expandText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  zoomControls: {
    position: "absolute",
    right: 12,
    top: 64,
    width: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border
  },
  zoomControlsFull: { top: 62 },
  zoomButton: {
    width: 44,
    height: 42,
    alignItems: "center",
    justifyContent: "center"
  },
  zoomButtonPressed: { backgroundColor: colors.primarySoft },
  zoomButtonDisabled: { opacity: 0.4 },
  zoomDivider: { height: 1, backgroundColor: colors.border },
  fullScreen: { flex: 1, backgroundColor: colors.bg },
  fullHeader: {
    minHeight: 74,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  fullTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  fullSubtitle: { marginTop: 3, color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  fullSwitch: { padding: 12, backgroundColor: colors.surface },
  fullMap: { flex: 1 },
  fullHint: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 12,
    paddingVertical: 9
  }
});
