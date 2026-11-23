import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { LocationMapPreview as LegacyMapPreview } from "../../src/components/LocationMapPreviewLegacy";
import { RapidAssistMapWithFallback } from "../../src/components/maps/RapidAssistMapWithFallback";
import type {
  RapidAssistMapCamera,
  RapidAssistMapMarker,
  RapidAssistMapRoute
} from "../../src/components/maps/RapidAssistMap.types";
import { colors } from "../../src/theme/colors";

type DemoMode = "maplibre" | "style-error" | "legacy";
type DemoStatus = "loading" | "ready" | "error" | "legacy";

const INTENTIONAL_STYLE_ERROR = "data:application/json,%7B%22version%22%3A7%2C%22sources%22%3A%7B%7D%2C%22layers%22%3A%5B%5D%7D";

const markers: RapidAssistMapMarker[] = [
  { id: "customer", coordinate: { latitude: 31.5204, longitude: 74.3587 }, title: "Customer", label: "C", color: "#dc2626" },
  { id: "provider", coordinate: { latitude: 31.5308, longitude: 74.3461 }, title: "Provider", label: "P", color: "#087f5b" }
];

const sampleRoute: RapidAssistMapRoute = {
  coordinates: [
    markers[0].coordinate,
    { latitude: 31.5259, longitude: 74.3532 },
    markers[1].coordinate
  ],
  color: colors.primary,
  width: 5
};

export default function MapFoundationScreen() {
  const [cameraMode, setCameraMode] = useState<"fit" | "customer" | "provider">("fit");
  const [demoMode, setDemoMode] = useState<DemoMode>("maplibre");
  const [demoStatus, setDemoStatus] = useState<DemoStatus>("loading");
  const [mapRevision, setMapRevision] = useState(0);
  const [message, setMessage] = useState("Loading the cross-platform MapLibre renderer…");
  const camera = useMemo<RapidAssistMapCamera>(() => {
    if (cameraMode === "customer") return { center: markers[0].coordinate, zoom: 15 };
    if (cameraMode === "provider") return { center: markers[1].coordinate, zoom: 15 };
    return {};
  }, [cameraMode]);

  function activateDemo(mode: DemoMode) {
    setDemoMode(mode);
    setMapRevision((value) => value + 1);
    if (mode === "legacy") {
      setDemoStatus("legacy");
      setMessage("Legacy OSM/CARTO preview selected explicitly.");
    } else {
      setDemoStatus("loading");
      setMessage(mode === "style-error"
        ? "Loading an intentionally invalid style to exercise error, retry, and fallback behavior."
        : "Loading the cross-platform MapLibre renderer…");
    }
  }

  const legacyPreview = (
    <LegacyMapPreview
      pickup={markers[0].coordinate}
      destination={markers[1].coordinate}
      route={sampleRoute.coordinates}
      pickupLabel="Customer"
      destinationLabel="Provider"
      title="Legacy OSM/CARTO fallback"
    />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>STAGE 3A · MODULE 4 TEST ROUTE</Text>
        <Text style={styles.title}>Cross-platform map foundation</Text>
        <Text style={styles.body}>
          Android resolves the native MapLibre renderer; Expo Web resolves MapLibre GL JS. Both can return to the preserved OSM/CARTO preview.
        </Text>

        <View style={styles.demoActions}>
          <DemoButton active={demoMode === "maplibre"} label="Reload MapLibre" onPress={() => activateDemo("maplibre")} />
          <DemoButton active={demoMode === "style-error"} label="Test style error" onPress={() => activateDemo("style-error")} />
          <DemoButton active={demoMode === "legacy"} label="Show legacy map" onPress={() => activateDemo("legacy")} />
        </View>

        <View
          accessibilityLiveRegion="polite"
          accessibilityRole={demoStatus === "error" ? "alert" : undefined}
          style={[styles.status, demoStatus === "error" ? styles.statusError : null]}
          testID="map-foundation-status"
        >
          {demoStatus === "loading" ? <ActivityIndicator color={colors.primary} size="small" /> : null}
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{statusTitle(demoStatus)}</Text>
            <Text style={styles.statusMessage}>{message}</Text>
          </View>
        </View>

        <View style={[styles.mapCard, demoMode === "legacy" ? styles.legacyCard : null]}>
          {demoMode === "legacy" ? legacyPreview : (
            <RapidAssistMapWithFallback
              key={`${demoMode}-${mapRevision}`}
              markers={markers}
              route={sampleRoute}
              camera={camera}
              mapStyle={demoMode === "style-error" ? INTENTIONAL_STYLE_ERROR : undefined}
              style={styles.map}
              fallback={legacyPreview}
              testID="map-foundation-map"
              onLoad={() => {
                setDemoStatus("ready");
                setMessage("MapLibre is ready. Pan, zoom, move the camera, or select a marker.");
              }}
              onError={(error) => {
                setDemoStatus("error");
                setMessage(error);
              }}
              onFallback={() => {
                setDemoStatus("legacy");
                setMessage("MapLibre was replaced with the preserved OSM/CARTO fallback. Use “Try MapLibre again” to retry.");
              }}
              onMapPress={(coordinate) => setMessage(`Map selected: ${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`)}
              onMarkerPress={(marker) => setMessage(`${marker.title || marker.id} marker selected.`)}
            />
          )}
        </View>

        <Text style={styles.sectionTitle}>Camera movement</Text>
        <View style={styles.cameraActions}>
          {(["fit", "customer", "provider"] as const).map((mode) => (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected: cameraMode === mode }}
              onPress={() => setCameraMode(mode)}
              style={[styles.cameraButton, cameraMode === mode ? styles.buttonActive : null]}
            >
              <Text style={[styles.buttonText, cameraMode === mode ? styles.buttonTextActive : null]}>
                {mode === "fit" ? "Fit route" : mode === "customer" ? "Customer" : "Provider"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>
          This isolated route uses sample coordinates only. Customer requests, provider screens, GPS, OSRM, and live tracking remain unchanged.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DemoButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.demoButton, active ? styles.demoButtonActive : null]}
    >
      <Text style={[styles.demoButtonText, active ? styles.buttonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function statusTitle(status: DemoStatus) {
  if (status === "ready") return "MapLibre ready";
  if (status === "error") return "Map style failed";
  if (status === "legacy") return "Legacy fallback active";
  return "Loading map";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, gap: 12 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900" },
  body: { color: colors.mutedText, fontSize: 13, lineHeight: 19 },
  demoActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  demoButton: {
    minHeight: 40,
    flexGrow: 1,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center"
  },
  demoButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  demoButtonText: { color: colors.primaryDark, fontSize: 11, fontWeight: "900" },
  status: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
    paddingVertical: 10
  },
  statusError: { borderColor: colors.danger, backgroundColor: "#fff5f5" },
  statusCopy: { flex: 1, gap: 2 },
  statusTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  statusMessage: { color: colors.mutedText, fontSize: 11, lineHeight: 16 },
  mapCard: {
    height: 420,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted
  },
  legacyCard: { height: 260 },
  map: { flex: 1 },
  sectionTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  cameraActions: { flexDirection: "row", gap: 8 },
  cameraButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonText: { color: colors.primaryDark, fontSize: 11, fontWeight: "900" },
  buttonTextActive: { color: "white" },
  note: { color: colors.mutedText, fontSize: 11, lineHeight: 17 }
});
