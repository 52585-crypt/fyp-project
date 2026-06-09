import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../theme/colors";
import type { Coordinate } from "../utils/distance";

const CARTO_TILE_URL = "https://basemaps.cartocdn.com/rastertiles/voyager";

type Props = {
  pickup: Coordinate;
  destination?: Coordinate | null;
  providers?: Array<{
    id: string;
    name: string;
    distanceKm?: number | null;
    location: Coordinate;
  }>;
  pickupLabel?: string;
  destinationLabel?: string;
  title?: string;
};

export function LocationMapPreview({
  pickup,
  destination,
  providers = [],
  pickupLabel = "Pickup",
  destinationLabel = "Destination",
  title
}: Props) {
  const html = useMemo(
    () => buildPreviewHtml({ pickup, destination, providers, pickupLabel, destinationLabel, title }),
    [destination, destinationLabel, pickup, pickupLabel, providers, title]
  );

  return (
    <View style={styles.mapWrap}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={styles.webView}
      />
    </View>
  );
}

function buildPreviewHtml({
  pickup,
  destination,
  providers = [],
  pickupLabel = "Pickup",
  destinationLabel = "Destination",
  title
}: Props) {
  const payload = JSON.stringify({
    pickup,
    destination: destination || pickup,
    hasDestination: Boolean(destination),
    providers,
    pickupLabel,
    destinationLabel,
    title: title || null,
    zoom: destination ? 13 : providers?.length ? 12 : 14,
    tileUrl: CARTO_TILE_URL
  });

  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body, #map { height: 100%; margin: 0; overflow: hidden; background: #eef2f7; font-family: Arial, sans-serif; }
      .tile { position: absolute; width: 256px; height: 256px; }
      .pin { position: absolute; width: 24px; height: 24px; margin-left: -12px; margin-top: -24px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 3px 8px rgba(15,23,42,.28); z-index: 4; }
      .pin::after { content: ""; position: absolute; width: 10px; height: 10px; left: 7px; top: 7px; border-radius: 50%; background: white; }
      .pickup { background: #2563eb; }
      .destination { background: #dc2626; }
      .provider { background: #16a34a; }
      .label { position: absolute; transform: translate(-50%, 4px); z-index: 5; border-radius: 10px; background: rgba(255,255,255,.96); padding: 4px 7px; color: #0f172a; font-size: 11px; font-weight: 800; white-space: nowrap; box-shadow: 0 2px 6px rgba(15,23,42,.16); }
      .route { position: absolute; height: 4px; border-radius: 2px; background: #2563eb; transform-origin: left center; z-index: 3; }
      .hint { position: absolute; left: 12px; right: 12px; top: 12px; z-index: 6; border-radius: 13px; background: rgba(255,255,255,.94); padding: 9px 12px; color: #0f172a; font-size: 12px; font-weight: 800; text-align: center; }
      .attribution { position: absolute; right: 8px; bottom: 8px; z-index: 6; border-radius: 9px; background: rgba(255,255,255,.92); padding: 5px 8px; color: #64748b; font-size: 10px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      const data = ${payload};
      const tileSize = 256;
      const map = document.getElementById("map");

      function worldPoint(c, scale) {
        const sinLat = Math.sin(c.latitude * Math.PI / 180);
        return {
          x: ((c.longitude + 180) / 360) * scale,
          y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
        };
      }

      function toScreen(c, topLeft, scale) {
        const p = worldPoint(c, scale);
        return { x: p.x - topLeft.x, y: p.y - topLeft.y };
      }

      function addPin(point, className, text) {
        const pin = document.createElement("div");
        pin.className = "pin " + className;
        pin.style.left = point.x + "px";
        pin.style.top = point.y + "px";
        map.appendChild(pin);
        const label = document.createElement("div");
        label.className = "label";
        label.textContent = text;
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

      function draw() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const scale = tileSize * Math.pow(2, data.zoom);
        const center = {
          latitude: (data.pickup.latitude + data.destination.latitude) / 2,
          longitude: (data.pickup.longitude + data.destination.longitude) / 2
        };
        const centerPoint = worldPoint(center, scale);
        const topLeft = { x: centerPoint.x - width / 2, y: centerPoint.y - height / 2 };
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

        const pickup = toScreen(data.pickup, topLeft, scale);
        const destination = toScreen(data.destination, topLeft, scale);
        if (data.hasDestination) addRoute(pickup, destination);
        addPin(pickup, "pickup", data.pickupLabel);
        if (data.hasDestination) addPin(destination, "destination", data.destinationLabel);
        data.providers.forEach((provider) => {
          const providerPoint = toScreen(provider.location, topLeft, scale);
          const distanceText = Number.isFinite(provider.distanceKm) ? " - " + provider.distanceKm + " km" : "";
          addPin(providerPoint, "provider", provider.name + distanceText);
        });

        const hint = document.createElement("div");
        hint.className = "hint";
        hint.textContent = data.title || (data.hasDestination ? "Customer route preview" : "Customer pickup location");
        map.appendChild(hint);
        const attribution = document.createElement("div");
        attribution.className = "attribution";
        attribution.textContent = "OpenStreetMap, CARTO";
        map.appendChild(attribution);
      }

      window.addEventListener("resize", draw);
      draw();
    </script>
  </body>
</html>`;
}

const styles = StyleSheet.create({
  mapWrap: {
    height: 240,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted
  },
  webView: { flex: 1, backgroundColor: colors.surfaceMuted }
});
