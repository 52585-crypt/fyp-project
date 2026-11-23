import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { GestureResponderEvent, Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { colors } from "../theme/colors";
import { coordinatesFromUnknown, isValidCoordinates, type Coordinate } from "../utils/distance";
import { TargetSwitch } from "./LocationMapPicker.shared";
import { BOOKING_MAP_CENTER, selectedCoordinateText, type PickerProps } from "./GoogleMap.shared";
import { LEGACY_MAP_TILES, legacyMapTileUrl } from "./maps/legacyMapTiles";

export type { LocationTarget } from "./LocationMapPicker.shared";

const TILE_SIZE = 256;
const INITIAL_ZOOM = 13;
const MIN_ZOOM = 10;
const MAX_ZOOM = 18;

export function LocationMapPicker({
  pickup,
  destination,
  route = [],
  providers = [],
  activeTarget,
  onActiveTargetChange,
  onPickupChange,
  onDestinationChange,
  onCoordinateError,
  singlePoint,
  pointLabel = "Service location",
  pickupLabel = "Pickup",
  destinationLabel = "Destination",
  currentLocation,
  cameraFocus,
  mapHeight
}: PickerProps) {
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const validRoute = useMemo(
    () => route.length > 1 && route.every(isValidCoordinates) ? route : [],
    [route]
  );
  const fitCoordinates = useMemo(
    () => validRoute.length > 1 ? [pickup, destination, ...validRoute].filter(isValidCoordinates) : [],
    [destination, pickup, validRoute]
  );
  const routeSignature = validRoute.length > 1
    ? `${validRoute.length}:${validRoute[0].latitude},${validRoute[0].longitude}:${validRoute[validRoute.length - 1].latitude},${validRoute[validRoute.length - 1].longitude}`
    : "none";
  const center = useMemo(
    () => {
      if (cameraFocus) return cameraFocus.coordinate;
      if (fitCoordinates.length > 1) return boundsCenter(fitCoordinates);
      const points = singlePoint ? [pickup, ...providers.map((provider) => provider.location)] : [pickup, destination, ...providers.map((provider) => provider.location)];
      const validPoints = points.filter(isValidCoordinates);
      if (!validPoints.length) return BOOKING_MAP_CENTER;
      return {
        latitude: validPoints.reduce((sum, point) => sum + point.latitude, 0) / validPoints.length,
        longitude: validPoints.reduce((sum, point) => sum + point.longitude, 0) / validPoints.length
      };
    },
    [cameraFocus?.requestId, destination, fitCoordinates, pickup, providers, singlePoint]
  );
  const mapProjection = useMemo(
    () => createMapProjection(center, mapSize.width, mapSize.height, zoom),
    [center, mapSize.height, mapSize.width, zoom]
  );
  const tiles = useMemo(() => getVisibleTiles(mapProjection, zoom), [mapProjection, zoom]);
  const pickupPoint = pickup ? mapProjection.coordinateToPoint(pickup) : null;
  const destinationPoint = destination ? mapProjection.coordinateToPoint(destination) : null;
  const currentLocationPoint = currentLocation ? mapProjection.coordinateToPoint(currentLocation) : null;
  const providerPoints = useMemo(
    () =>
      providers.map((provider) => ({
        provider,
        point: mapProjection.coordinateToPoint(provider.location)
      })),
    [mapProjection, providers]
  );
  const routePoints = useMemo(
    () => validRoute.map((coordinate) => {
      const point = mapProjection.coordinateToPoint(coordinate);
      return `${point.x},${point.y}`;
    }).join(" "),
    [mapProjection, validRoute]
  );

  useEffect(() => {
    if (validRoute.length < 2 || !mapSize.width || !mapSize.height) return;
    setZoom(fitZoomForCoordinates(fitCoordinates, mapSize.width, mapSize.height));
  }, [fitCoordinates, mapSize.height, mapSize.width, routeSignature]);

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setMapSize({ width, height });
  }

  function onMapPress(event: GestureResponderEvent) {
    if (!mapSize.width || !mapSize.height) return;
    const coordinate = coordinateFromMapPress(event, mapProjection);
    if (!coordinate) {
      onCoordinateError?.("The map returned invalid coordinates. Please tap the map again.");
      return;
    }

    if (singlePoint || activeTarget === "pickup") {
      onPickupChange(coordinate);
    } else {
      onDestinationChange(coordinate);
    }
  }

  return (
    <View style={styles.wrap}>
      {singlePoint ? null : <TargetSwitch activeTarget={activeTarget} onActiveTargetChange={onActiveTargetChange} />}
      <Pressable onPress={onMapPress} onLayout={onLayout} style={[styles.webMap, mapHeight ? { height: mapHeight } : null]}>
        {tiles.map((tile) => (
          <Image
            key={`${tile.x}-${tile.y}`}
            source={{ uri: legacyMapTileUrl(zoom, tile.urlX, tile.y) }}
            style={[styles.tile, { left: tile.left, top: tile.top }]}
          />
        ))}
        {!singlePoint && validRoute.length > 1 ? (
          <Svg width="100%" height="100%" pointerEvents="none" style={StyleSheet.absoluteFillObject}>
            <Polyline points={routePoints} fill="none" stroke="rgba(255,255,255,0.96)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={routePoints} fill="none" stroke="#4f46e5" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
        {pickupPoint ? <MapPin point={pickupPoint} label={singlePoint ? pointLabel : pickupLabel} color={colors.primary} markerText="P" /> : null}
        {currentLocationPoint ? <MapPin point={currentLocationPoint} label="You" color="#0ea5e9" markerText="" /> : null}
        {!singlePoint && destinationPoint ? <MapPin point={destinationPoint} label={destinationLabel} color={colors.danger} markerText="D" /> : null}
        {providerPoints.map(({ provider, point }) => (
          <MapPin
            key={provider.id}
            point={point}
            label={`${provider.name}${provider.distanceKm == null ? "" : ` - ${provider.distanceKm} km`}`}
            color="#16a34a"
            markerText="V"
          />
        ))}
        <View style={styles.hint}>
          <Ionicons name="map" size={15} color={colors.primary} />
          <Text style={styles.hintText}>OpenStreetMap - tap to set {singlePoint ? pointLabel.toLowerCase() : activeTarget}</Text>
        </View>
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>{LEGACY_MAP_TILES.attribution}</Text>
        </View>
        <ZoomControls
          zoom={zoom}
          onZoomIn={() => setZoom((current) => Math.min(MAX_ZOOM, current + 1))}
          onZoomOut={() => setZoom((current) => Math.max(MIN_ZOOM, current - 1))}
        />
      </Pressable>
      <View style={styles.coordinateChips}>
        <CoordinateChip label={singlePoint ? pointLabel : pickupLabel} coordinate={pickup} tone="pickup" />
        {singlePoint ? null : <CoordinateChip label={destinationLabel} coordinate={destination} tone="destination" />}
      </View>
    </View>
  );
}

export function coordinateFromMapPress(
  event: Pick<GestureResponderEvent, "nativeEvent" | "currentTarget"> | null | undefined,
  projection: Pick<ReturnType<typeof createMapProjection>, "pointToCoordinate">
): Coordinate | null {
  const nativeEvent = event?.nativeEvent as {
    locationX?: unknown;
    locationY?: unknown;
    offsetX?: unknown;
    offsetY?: unknown;
    clientX?: unknown;
    clientY?: unknown;
  } | undefined;
  let x = typeof nativeEvent?.locationX === "number" ? nativeEvent.locationX : nativeEvent?.offsetX;
  let y = typeof nativeEvent?.locationY === "number" ? nativeEvent.locationY : nativeEvent?.offsetY;
  if ((typeof x !== "number" || typeof y !== "number") &&
      typeof nativeEvent?.clientX === "number" && typeof nativeEvent?.clientY === "number") {
    const target = event?.currentTarget as unknown as { getBoundingClientRect?: () => { left: number; top: number } };
    const bounds = target?.getBoundingClientRect?.();
    if (bounds) {
      x = nativeEvent.clientX - bounds.left;
      y = nativeEvent.clientY - bounds.top;
    }
  }
  if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) return null;
  return coordinatesFromUnknown(projection.pointToCoordinate({ x, y }));
}

function CoordinateChip({
  label,
  coordinate,
  tone
}: {
  label: string;
  coordinate: Coordinate | null;
  tone: "pickup" | "destination";
}) {
  return (
    <View style={styles.coordinateChip}>
      <View style={[styles.coordinateDot, tone === "destination" ? styles.destinationDot : styles.pickupDot]} />
      <Text style={styles.coordinateText}>
        {label}: {selectedCoordinateText(coordinate)}
      </Text>
    </View>
  );
}

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <View style={styles.zoomControls}>
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

function MapPin({ point, label, color, markerText }: { point: Point; label: string; color: string; markerText: string }) {
  return (
    <View pointerEvents="none" style={[styles.pinWrap, { left: point.x - 17, top: point.y - 17 }]}>
      <View style={[styles.markerBubble, { backgroundColor: color }]}>
        <Text style={styles.markerText}>{markerText}</Text>
      </View>
      <Text style={styles.pinLabel}>{label}</Text>
    </View>
  );
}

type Point = {
  x: number;
  y: number;
};

function createMapProjection(center: Coordinate, width: number, height: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const centerPixel = coordinateToWorldPoint(center, scale);
  const topLeft = {
    x: centerPixel.x - width / 2,
    y: centerPixel.y - height / 2
  };

  return {
    topLeft,
    width,
    height,
    coordinateToPoint(coordinate: Coordinate) {
      const worldPoint = coordinateToWorldPoint(coordinate, scale);
      return {
        x: worldPoint.x - topLeft.x,
        y: worldPoint.y - topLeft.y
      };
    },
    pointToCoordinate(point: Point) {
      return worldPointToCoordinate(
        {
          x: topLeft.x + point.x,
          y: topLeft.y + point.y
        },
        scale
      );
    }
  };
}

function coordinateToWorldPoint(coordinate: Coordinate, scale: number) {
  const sinLatitude = Math.sin((coordinate.latitude * Math.PI) / 180);
  return {
    x: ((coordinate.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale
  };
}

function worldPointToCoordinate(point: Point, scale: number) {
  const longitude = (point.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * point.y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { latitude, longitude };
}

function getVisibleTiles(projection: ReturnType<typeof createMapProjection>, zoom: number) {
  if (!projection.width || !projection.height) return [];

  const maxTile = 2 ** zoom;
  const startX = Math.floor(projection.topLeft.x / TILE_SIZE);
  const endX = Math.floor((projection.topLeft.x + projection.width) / TILE_SIZE);
  const startY = Math.floor(projection.topLeft.y / TILE_SIZE);
  const endY = Math.floor((projection.topLeft.y + projection.height) / TILE_SIZE);
  const tiles: Array<{ x: number; y: number; urlX: number; left: number; top: number }> = [];

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      if (y < 0 || y >= maxTile) continue;
      tiles.push({
        x,
        y,
        urlX: ((x % maxTile) + maxTile) % maxTile,
        left: x * TILE_SIZE - projection.topLeft.x,
        top: y * TILE_SIZE - projection.topLeft.y
      });
    }
  }

  return tiles;
}

function boundsCenter(coordinates: Coordinate[]) {
  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2
  };
}

function fitZoomForCoordinates(coordinates: Coordinate[], width: number, height: number) {
  const availableWidth = Math.max(1, width - 96);
  const availableHeight = Math.max(1, height - 96);
  for (let candidate = MAX_ZOOM; candidate >= MIN_ZOOM; candidate -= 1) {
    const scale = TILE_SIZE * 2 ** candidate;
    const points = coordinates.map((coordinate) => coordinateToWorldPoint(coordinate, scale));
    const spanX = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    const spanY = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
    if (spanX <= availableWidth && spanY <= availableHeight) return candidate;
  }
  return MIN_ZOOM;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  webMap: {
    height: 260,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden"
  },
  tile: {
    position: "absolute",
    width: TILE_SIZE,
    height: TILE_SIZE
  },
  pinWrap: {
    position: "absolute",
    alignItems: "center",
    zIndex: 8,
    elevation: 8
  },
  markerBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center"
  },
  markerText: {
    color: "white",
    fontSize: 15,
    fontWeight: "900"
  },
  pinLabel: {
    marginTop: 2,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.94)",
    color: colors.text,
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 6,
    paddingVertical: 3
  },
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
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  hintText: { color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "center" },
  attribution: {
    position: "absolute",
    right: 8,
    bottom: 8,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  attributionText: { color: colors.mutedText, fontSize: 10, fontWeight: "800" }
  ,
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
  zoomButton: {
    width: 44,
    height: 42,
    alignItems: "center",
    justifyContent: "center"
  },
  zoomButtonPressed: { backgroundColor: colors.primarySoft },
  zoomButtonDisabled: { opacity: 0.4 },
  zoomDivider: { height: 1, backgroundColor: colors.border }
});
