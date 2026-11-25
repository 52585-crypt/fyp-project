import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { LocationAutocompleteField } from "../../../../src/components/LocationAutocompleteField";
import { MapCanvas, type MapCanvasMarker } from "../../../../src/components/maps/MapCanvas";
import {
  Banner, BottomSheet, Button, CenterPin, Icon, IconButton, MapPill, MapTopBar, MAP_TOP_BAR_HEIGHT, SegmentedControl, Text
} from "../../../../src/design/components";
import { SERVICE_AREA_MESSAGE, isInServiceArea } from "../../../../src/config/serviceArea";
import { TWIN_CITY_LANDMARKS } from "../../../../src/config/twinCityLandmarks";
import { tokens } from "../../../../src/design/tokens";
import { customerRoutes } from "../../../../src/navigation/routes";
import { useBooking } from "../../../../src/requests/booking/BookingProvider";
import { normalizeBookingCategory } from "../../../../src/requests/booking/category";
import { NearbyProviderCard } from "../../../../src/requests/customer/NearbyProviderCard";
import { NearbyProviderList } from "../../../../src/requests/customer/NearbyProviderList";
import { nearbyProviderMarkers } from "../../../../src/requests/nearbyProviderMarkers";
import { useNearbyProviders } from "../../../../src/requests/useNearbyProviders";
import { useProviderPreview } from "../../../../src/requests/useProviderPreview";
import { mechanicServices } from "../../../../src/requests/booking/options";
import { getServiceTitle } from "../../../../src/requests/serviceCatalog";
import { applyNormalizedLocationTarget, normalizeLocation, type NormalizedLocation } from "../../../../src/services/normalizedLocation";

type Step = "pickup" | "destination";
type ProvidersView = "map" | "list";

const VIEWS = [{ value: "map", label: "Map", icon: "map-outline" }, { value: "list", label: "List", icon: "list" }] as const;
const TOGGLE_TOP = MAP_TOP_BAR_HEIGHT + tokens.space.sm;
const LIST_TOP = TOGGLE_TOP + tokens.sizes.buttonSmall + tokens.space.xxs * 2 + tokens.space.lg;

/** Pickup pin: the map moves under a fixed centre pin. Towing adds a drop-off step. Next: request/estimate. */
export default function PickupPin() {
  const { service, issue, step: stepParam } = useLocalSearchParams<{ service?: string; issue?: string; step?: string }>();
  const b = useBooking();
  const category = normalizeBookingCategory(service);
  const towing = category === "car_towing";
  const [step, setStep] = useState<Step>(towing && stepParam === "destination" ? "destination" : "pickup");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ProvidersView>("map");

  useEffect(() => { b.setCategory(category); b.setError(null); }, [category]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const preset = mechanicServices.find((s) => s.value === issue);
    if (preset) b.setMechanicIssue(preset.value);
  }, [issue]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!b.pickup) void b.useCurrentLocation(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = step === "pickup" ? b.pickup : b.destination;
  // Same rule as the server: a pickup outside Islamabad/Rawalpindi cannot be booked.
  const outsideArea = step === "pickup" && Boolean(value) && !isInServiceArea(value!.latitude, value!.longitude);
  const pinned = value?.source === "manual_map" && /^Pinned /.test(value.address ?? "");
  // Nearby providers for this service around the pickup pin (approximate positions, refreshed every 20 s).
  const near = useNearbyProviders(category, b.pickup ? { lat: b.pickup.latitude, lng: b.pickup.longitude } : null, step === "pickup");
  const preview = useProviderPreview(near.providers, b.pickup);
  const listing = step === "pickup" && view === "list";
  const card = step === "pickup" && !listing ? preview.selected : null;
  const markers: MapCanvasMarker[] = step === "destination" && b.pickup
    ? [{ id: "pickup", kind: "pickup", coordinate: b.pickup, label: "Pickup" }]
    : nearbyProviderMarkers(near.providers ?? [], category);
  const tow = towing && step === "destination" && b.route.route ? `${b.route.route.distanceKm.toFixed(1)} km tow · ${b.route.route.durationMinutes} min` : null;

  function choose(loc: NormalizedLocation) {
    applyNormalizedLocationTarget(step, loc, { pickup: b.setPickup, destination: b.setDestination });
    b.focusOn(loc);
    setSearch("");
    b.setError(null);
  }

  function goTo(next: Step) {
    preview.close();
    setStep(next);
    setSearch("");
    const target = next === "destination" ? b.destination ?? b.pickup : b.pickup;
    if (target) b.focusOn(target);
  }

  function confirm() {
    if (!value) return b.setError(step === "pickup" ? "Move the map to your location, or search for it." : "Move the map to where the vehicle should be towed.");
    if (outsideArea) return b.setError(SERVICE_AREA_MESSAGE);
    if (step === "pickup" && towing) return goTo("destination");
    b.setError(null);
    router.push(customerRoutes.estimate);
  }

  const title = step === "pickup" ? (category === "fuel_delivery" ? "Where should we deliver?" : "Where are you?") : "Where to tow?";

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.map}>
        <MapCanvas accessibilityLabel={`Map. Drag to set the ${step === "pickup" ? "pickup" : "drop-off"} point`}
          focus={b.cameraFocus} markers={markers} inset={{ top: MAP_TOP_BAR_HEIGHT, bottom: 0 }} onCenterChange={(c) => b.pinLocation(step, c)}
          onMarkerPress={step === "pickup" ? preview.select : undefined} />
        <CenterPin label={step === "pickup" ? "Help here" : "Drop-off here"} tone={step === "pickup" ? "primary" : "red"} />
        {listing ? (
          <View style={StyleSheet.absoluteFill}>
            <NearbyProviderList providers={near.providers} category={category} pickup={b.pickup} onRequest={confirm} topInset={LIST_TOP} />
          </View>
        ) : null}
        {step === "pickup" ? (
          <View pointerEvents="box-none" style={styles.toggle}>
            <SegmentedControl accessibilityLabel="Show nearby providers as" options={VIEWS} value={view}
              onChange={(v) => { preview.close(); setView(v); }} />
          </View>
        ) : null}
      </View>

      <MapTopBar
        left={<IconButton icon="arrow-back" label="Back" onPress={() => (step === "destination" ? goTo("pickup") : router.back())} />}
        center={<MapPill title={getServiceTitle(category)} subtitle={towing ? `Step ${step === "pickup" ? 1 : 2} of 2` : "Set location"} />}
        right={<IconButton icon="locate" label="Use my current location" disabled={b.locating}
          onPress={() => (step === "pickup" ? void b.useCurrentLocation() : void b.recenter())} />} />

      {card ? (
        <BottomSheet fixed>
          <NearbyProviderCard provider={card} fallbackCategory={category} eta={preview.eta} onClose={preview.close}
            onRequest={() => { preview.close(); confirm(); }} />
          <Text variant="caption" color="muted">Location shown is approximate. We send your request to the best available provider nearby.</Text>
        </BottomSheet>
      ) : (
        <BottomSheet fixed footer={
          <Button title={step === "pickup" ? (towing ? "Confirm pickup" : "Confirm location") : "Confirm drop-off"}
            icon="arrow-forward" disabled={b.locating || !value || outsideArea} onPress={confirm} />
        }>
          <Text variant="title">{title}</Text>
          <View style={styles.address}>
            <View style={[styles.addressIcon, step === "destination" && styles.addressIconDrop]}>
              <Icon name={step === "pickup" ? "location" : "flag"} color={step === "pickup" ? "primary" : "red"} size={tokens.sizes.icon} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={2} accessibilityLiveRegion="polite">
                {b.locating && !value ? "Finding you…" : value ? value.address || "Pinned location" : "Drag the map to place the pin"}
              </Text>
              <Text variant="caption" color="muted" numberOfLines={1}>
                {tow ?? (pinned && value ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : value ? "Drag the map to fine-tune" : "Or search below")}
              </Text>
            </View>
          </View>

          <LocationAutocompleteField token={b.token} icon="search" variant="compact" value={search} onChangeText={setSearch}
            placeholder={step === "pickup" ? "Search street, area or landmark" : "Search workshop or drop-off"} onSelect={choose}
            near={b.pickup ?? undefined} />

          {step === "pickup" && b.favorites.favoriteLocations.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {b.favorites.favoriteLocations.filter((f) => f.latitude != null && f.longitude != null).map((f) => (
                <Button key={f.id} title={f.label} icon="bookmark-outline" size="small" variant="secondary" fullWidth={false}
                  onPress={() => choose(normalizeLocation({ latitude: f.latitude!, longitude: f.longitude!, address: f.addressText,
                    source: f.source || "unknown", placeId: f.placeId }))} />
              ))}
            </ScrollView>
          ) : null}

          {step === "pickup" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}
              accessibilityLabel="Popular pickup points in Islamabad and Rawalpindi">
              {TWIN_CITY_LANDMARKS.map((l) => (
                <Button key={l.id} title={l.label} icon="navigate-outline" size="small" variant="secondary" fullWidth={false}
                  onPress={() => choose(normalizeLocation({ latitude: l.latitude, longitude: l.longitude, address: `${l.label}, ${l.city}`, source: "unknown" }))} />
              ))}
            </ScrollView>
          ) : null}

          {outsideArea ? <Banner tone="warning" title="Outside our service area" message={`${SERVICE_AREA_MESSAGE}. Move the pin or pick a place below.`} /> : null}
          {b.error && !(outsideArea && b.error === SERVICE_AREA_MESSAGE) ? <Banner tone="danger" message={b.error} /> : null}
        </BottomSheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  map: { flex: 1 },
  toggle: { position: "absolute", top: TOGGLE_TOP, left: 0, right: 0, alignItems: "center" },
  flex: { flex: 1 },
  address: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.md,
    borderRadius: tokens.radius.control, backgroundColor: tokens.color.cloud
  },
  addressIcon: {
    width: tokens.sizes.buttonSmall, height: tokens.sizes.buttonSmall, borderRadius: tokens.radius.control,
    alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.mist
  },
  addressIconDrop: { backgroundColor: tokens.color.dangerSoft },
  chips: { gap: tokens.space.sm }
});
