import { customerRoutes } from "../../../../src/navigation/routes";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { NoticeBanner } from "../../../../src/ui/components";
import {
  AppHeader, ChoiceGroup, CustomerScreen, LocationCard, PrimaryButton, PrioritySelector, SectionHeading,
  SummaryCard, Surface, VehicleCard, customerColors, customerStyles
} from "../../../../src/ui/customer/components";
import { useAuth } from "../../../../src/auth/AuthProvider";
import { ServiceSuggestionCard } from "../../../../src/ai/ServiceSuggestionCard";
import { selectionFromSuggestion } from "../../../../src/ai/serviceSuggestion.integration";
import type { ServiceSuggestion } from "../../../../src/ai/serviceSuggestion.types";
import { LocationMapPicker, type LocationTarget } from "../../../../src/components/LocationMapPicker";
import { LocationAutocompleteField } from "../../../../src/components/LocationAutocompleteField";
import { createRequest, listNearbyProviders } from "../../../../src/requests/requests.api";
import type {
  FuelType,
  MechanicIssueCategory,
  RequestCategory,
  RequestPriority
} from "../../../../src/requests/requests.types";
import { useFavoriteLocations } from "../../../../src/services/useFavoriteLocations";
import {
  applyNormalizedLocationTarget,
  manualMapLocation,
  normalizeLocation,
  selectedRequestLocations,
  type NormalizedLocation
} from "../../../../src/services/normalizedLocation";
import { requiresGoogleMap } from "../../../../src/services/locationMapPolicy";
import { useBookingRoute } from "../../../../src/requests/useBookingRoute";
import { getCurrentForegroundLocation } from "../../../../src/services/currentLocation";
import { coordinatesFromUnknown, type Coordinate } from "../../../../src/utils/distance";
import { buildEstimate } from "../../../../src/requests/requestEstimate";
import { listMyVehicles } from "../../../../src/vehicles/vehicles.api";
import type { Vehicle } from "../../../../src/vehicles/vehicles.types";
import { formatCurrency } from "../../../../src/i18n";
import { customerServices, normalizeBookingCategory } from "../../../../src/ui/customer/services";

const mechanicIssues: Array<{ label: string; value: MechanicIssueCategory }> = [
  { label: "Battery", value: "battery" },
  { label: "Engine", value: "engine" },
  { label: "Tyre", value: "tyre" },
  { label: "Brake", value: "brake" },
  { label: "Overheat", value: "overheating" },
  { label: "Inspection", value: "general_inspection" }
];

function coordinateLabel(prefix: string, coordinate: Coordinate) {
  return `${prefix}: ${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

export default function UserRequest() {
  const { token } = useAuth();
  const params = useLocalSearchParams<{ service?: string }>();
  const { height: windowHeight } = useWindowDimensions();
  const mapHeight = Math.max(190, Math.min(270, Math.round(windowHeight * 0.32)));

  // Request State
  const [category, setCategory] = useState<RequestCategory>(() => normalizeBookingCategory(params.service));
  const [pickupLocation, setPickupLocation] = useState<NormalizedLocation | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<NormalizedLocation | null>(null);
  const [pickupSearch, setPickupSearch] = useState("");
  const [destinationSearch, setDestinationSearch] = useState("");

  const pickup = pickupLocation?.address || pickupSearch;
  const destination = destinationLocation?.address || destinationSearch;

  const [activeLocationTarget, setActiveLocationTarget] = useState<LocationTarget>("pickup");
  const [editingTarget, setEditingTarget] = useState<"pickup" | "destination" | null>(null);

  // Form Fields
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const manualVehicle = useRef(false);
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [fuelType, setFuelType] = useState<FuelType>("petrol");
  const [liters, setLiters] = useState("5");
  const [mechanicIssue, setMechanicIssue] = useState<MechanicIssueCategory>("battery");
  const [priority, setPriority] = useState<RequestPriority>("normal");
  const [description, setDescription] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);

  const [manualSelectionVersion, setManualSelectionVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const submission = useRef<{ fingerprint: string; id: string } | null>(null);
  const submitting = useRef(false);

  const [locationLoading, setLocationLoading] = useState<"pickup" | "destination" | "current" | null>(null);

  const [nearbyProviderCount, setNearbyProviderCount] = useState<number | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [currentMapLocation, setCurrentMapLocation] = useState<Coordinate | null>(null);
  const [mapCameraFocus, setMapCameraFocus] = useState<{ coordinate: Coordinate; requestId: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { favoriteLocations, favoriteSaving, saveFavorite, removeFavorite } = useFavoriteLocations(setError);
  const [formError, setFormError] = useState<string | null>(null);

  const litersNumber = Math.max(1, Number(liters) || 1);
  const { route: activeDrivingRoute, loading: routeLoading, error: routeError, retry: retryRoute } =
    useBookingRoute(pickupLocation, category === "car_towing" ? destinationLocation : null);
  const currentEstimate = buildEstimate(category, activeDrivingRoute?.distanceKm ?? null, fuelType, litersNumber);
  const selectedVehicle = vehicles.find((item) => item.id === vehicleId);


  useEffect(() => {
    setCategory(normalizeBookingCategory(params.service));
  }, [params.service]);

  useFocusEffect(useCallback(() => {
    if (!token) return;
    let active = true;
    setVehiclesLoading(true);
    setVehicleError(null);
    void listMyVehicles(token).then((items) => {
      if (!active) return;
      setVehicles(items);
      setVehicleId((previous) => {
        if (manualVehicle.current) return null;
        return items.find((item) => item.id === previous)?.id ?? items[0]?.id ?? null;
      });
    }).catch(() => {
      if (active) setVehicleError("Saved vehicles couldn’t be loaded.");
    }).finally(() => {
      if (active) setVehiclesLoading(false);
    });
    return () => { active = false; };
  }, [token]));

  // Load nearby providers
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!token || !pickupLocation) {
        setNearbyProviderCount(null);
        setNearbyLoading(false);
        return;
      }
      try {
        setNearbyLoading(true);
        const result = await listNearbyProviders(token, {
          category,
          lat: pickupLocation.latitude,
          lng: pickupLocation.longitude
        });
        if (!cancelled) {
          setNearbyProviderCount(result.providers.length);
        }
      } catch {
        if (!cancelled) setNearbyProviderCount(null);
      } finally {
        if (!cancelled) setNearbyLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [category, pickupLocation, token]);

  function updatePickupFromMap(value: unknown) {
    const coordinate = coordinatesFromUnknown(value);
    if (!coordinate) {
      setError("The map returned invalid coordinates. Your pickup location was not changed.");
      return;
    }
    setMapCameraFocus(null);
    const location = manualMapLocation(coordinate, coordinateLabel("Selected location", coordinate));
    if (!location) return;
    setPickupLocation(location);
    setError(null);
  }

  function updateDestinationFromMap(value: unknown) {
    const coordinate = coordinatesFromUnknown(value);
    if (!coordinate) {
      setError("The map returned invalid coordinates. Your destination was not changed.");
      return;
    }
    setMapCameraFocus(null);
    const location = manualMapLocation(coordinate, coordinateLabel("Selected drop-off", coordinate));
    if (!location) return;
    setDestinationLocation(location);
    setError(null);
  }

  function applySelectedPickup(location: NormalizedLocation) {
    applyNormalizedLocationTarget("pickup", location, {
      pickup: setPickupLocation,
      destination: setDestinationLocation
    });
    setActiveLocationTarget("pickup");
    setEditingTarget(null);
  }

  function applySelectedDestination(location: NormalizedLocation) {
    applyNormalizedLocationTarget("destination", location, {
      pickup: setPickupLocation,
      destination: setDestinationLocation
    });
    setActiveLocationTarget("destination");
    setEditingTarget(null);
  }

  async function getCurrentMapCoordinate() {
    const { coordinate } = await getCurrentForegroundLocation();
    setCurrentMapLocation(coordinate);
    setMapCameraFocus((value) => ({ coordinate, requestId: (value?.requestId || 0) + 1 }));
    return coordinate;
  }

  async function recenterMapOnCurrentLocation() {
    try {
      setLocationLoading("current");
      setError(null);
      return await getCurrentMapCoordinate();
    } catch (e: any) {
      setError(e?.message || "Failed to fetch current location");
      return null;
    } finally {
      setLocationLoading(null);
    }
  }

  async function useCurrentLocation() {
    try {
      setLocationLoading("current");
      setError(null);
      const currentCoordinate = await getCurrentMapCoordinate();
      const coordinate = normalizeLocation({ ...currentCoordinate, source: "gps" });
      setPickupLocation({ ...coordinate, address: "Locating address…" });
      setActiveLocationTarget("pickup");

      try {
        const [address] = await Location.reverseGeocodeAsync(coordinate);
        const readable = address
          ? [address.name, address.street, address.city, address.region].filter(Boolean).join(", ")
          : "";
        setPickupLocation((value) =>
          value?.source === "gps" &&
          value.latitude === coordinate.latitude &&
          value.longitude === coordinate.longitude
            ? { ...value, address: readable || "Current location" }
            : value
        );
      } catch {
        setPickupLocation((value) =>
          value?.source === "gps" &&
          value.latitude === coordinate.latitude &&
          value.longitude === coordinate.longitude
            ? { ...value, address: "Current location" }
            : value
        );
      }
    } catch (e: any) {
      setError(e?.message || "Location permission denied or unavailable");
    } finally {
      setLocationLoading(null);
    }
  }

  async function saveCurrentPickupAsFavorite() {
    if (!pickupLocation) {
      setError("Choose a pickup location before saving it.");
      return;
    }
    setError(null);
    await saveFavorite({
      addressText: pickup,
      source: pickupLocation.source,
      placeId: pickupLocation.placeId,
      latitude: pickupLocation.latitude,
      longitude: pickupLocation.longitude
    });
  }

  async function removeFavoritePickupLocation(id: string) {
    setError(null);
    await removeFavorite(id);
  }

  async function onSubmit() {
    if (!token || submitting.current) return;
    const locations = selectedRequestLocations(category, pickupLocation, destinationLocation);
    if (!locations) {
      setFormError(pickupLocation
        ? "Choose a towing destination."
        : "Choose the service location on the map or use your current GPS location.");
      return;
    }
    if (category === "car_towing" && (!activeDrivingRoute || routeLoading)) {
      setFormError("A valid road route is required before requesting a tow.");
      return;
    }
    submitting.current = true;
    try {
      setLoading(true);
      setFormError(null);
      const input = {
        category,
        priority,
        ...(selectedVehicle ? { vehicleId: selectedVehicle.id } : {
          vehicleInfo: { type: "car", model: vehicle.trim(), registrationNumber: registrationNumber.trim() }
        }),
        ...locations,
        issueType: category === "mechanic" ? mechanicIssue : null,
        description,
        fuelDetails:
          category === "fuel_delivery"
            ? {
                fuelType,
                liters: litersNumber
              }
            : undefined,
        mechanicDetails:
          category === "mechanic"
            ? {
                issueCategory: mechanicIssue
              }
            : undefined
      };
      const fingerprint = JSON.stringify(input);
      if (submission.current?.fingerprint !== fingerprint) {
        submission.current = {
          fingerprint,
          id: `dispatch-${Date.now()}-${Math.random().toString(36).slice(2)}`
        };
      }
      const request = await createRequest(token, { ...input, clientRequestId: submission.current.id });
      router.push(customerRoutes.request(request.id));
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || "Failed to create request");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const waitingForRoute = category === "car_towing" && Boolean(pickupLocation && destinationLocation) && (routeLoading || !activeDrivingRoute);

  function applyServiceSuggestion(suggestion: ServiceSuggestion) {
    const selection = selectionFromSuggestion(suggestion);
    if (!selection) return;
    setCategory(selection.category);
    if (selection.mechanicIssue) setMechanicIssue(selection.mechanicIssue);
    setShowAiModal(false);
  }

  const config = requestCopy[category];
  const vehicleLabel = selectedVehicle
    ? vehicleTitle(selectedVehicle)
    : [vehicle.trim(), registrationNumber.trim()].filter(Boolean).join(" · ");
  const estimateLines = currentEstimate?.lines.map((line) => ({ label: line.label, value: formatCurrency(line.amount) })) ?? [];
  const summaryItems = category === "car_towing" && activeDrivingRoute ? [
    { label: "Road distance", value: `${activeDrivingRoute.distanceKm.toFixed(1)} km` },
    { label: "Driving time", value: `${activeDrivingRoute.durationMinutes} min` },
    ...estimateLines
  ] : category === "mechanic" ? [
    { label: "Provider ETA", value: "Available in live tracking" },
    ...estimateLines
  ] : estimateLines;

  return (
    <CustomerScreen active="Services" header={<AppHeader title={config.title} back />}>
      <ChoiceGroup label="Roadside service" hideLabel options={customerServices} value={category}
        onChange={(value) => {
          if (value === category) return;
          setManualSelectionVersion((version) => version + 1);
          setCategory(value);
          setError(null);
          setFormError(null);
        }} />

      <Surface style={styles.mapCard}>
        <LocationMapPicker
          pickup={pickupLocation}
          destination={category === "car_towing" ? destinationLocation : null}
          route={category === "car_towing" ? activeDrivingRoute?.coordinates || [] : []}
          onCoordinateError={setError}
          currentLocation={currentMapLocation}
          cameraFocus={mapCameraFocus}
          onRequestCurrentLocation={recenterMapOnCurrentLocation}
          activeTarget={activeLocationTarget}
          onActiveTargetChange={setActiveLocationTarget}
          onPickupChange={updatePickupFromMap}
          onDestinationChange={category === "car_towing" ? updateDestinationFromMap : updatePickupFromMap}
          singlePoint={category !== "car_towing"}
          pointLabel={config.location}
          pickupLabel="Pickup"
          destinationLabel="Destination"
          mapHeight={mapHeight}
          requiresGoogleMap={requiresGoogleMap(pickupLocation, category === "car_towing" ? destinationLocation : null)}
        />
        <PrimaryButton title="Use current location" icon="locate-outline" variant="outline"
          style={styles.secondaryButton} onPress={useCurrentLocation} loading={locationLoading === "current"} />
        {pickupLocation && (nearbyLoading || nearbyProviderCount !== null) ? (
          <Text style={customerStyles.muted} accessibilityLiveRegion="polite">
            {nearbyLoading ? "Checking provider availability…" : `${nearbyProviderCount} nearby available`}
          </Text>
        ) : null}
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      </Surface>

      <LocationCard label={config.location} icon="location-outline" value={pickupLocation?.address || "Choose a location"}
        expanded={editingTarget === "pickup"} onPress={() => {
          setActiveLocationTarget("pickup");
          setEditingTarget(editingTarget === "pickup" ? null : "pickup");
        }}>
        <LocationAutocompleteField
          token={token} label={`Search ${config.location.toLowerCase()}`} icon="search"
          placeholder="Enter a street or landmark" value={pickup}
          onChangeText={(value) => { setPickupSearch(value); setPickupLocation(null); }}
          onSelect={applySelectedPickup} near={pickupLocation ?? undefined}
        />
        {pickupLocation ? (
          <PrimaryButton title="Save location" icon="bookmark-outline" variant="outline"
            style={styles.secondaryButton} loading={favoriteSaving} onPress={saveCurrentPickupAsFavorite} />
        ) : null}
        {favoriteLocations.map((favorite) => (
          <View key={favorite.id} style={customerStyles.row}>
            <Pressable accessibilityRole="button" style={styles.favorite}
              disabled={favorite.latitude == null || favorite.longitude == null}
              onPress={() => {
                if (favorite.latitude == null || favorite.longitude == null) return;
                applySelectedPickup(normalizeLocation({
                  latitude: favorite.latitude,
                  longitude: favorite.longitude,
                  address: favorite.addressText,
                  source: favorite.source || "unknown",
                  placeId: favorite.placeId
                }));
              }}>
              <Ionicons name="bookmark-outline" size={16} color={customerColors.brand} />
              <Text style={styles.fieldLabel} numberOfLines={1}>{favorite.label}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${favorite.label}`}
              onPress={() => void removeFavoritePickupLocation(favorite.id)} style={styles.removeFavorite}>
              <Ionicons name="trash-outline" size={18} color={customerColors.inkMuted} />
            </Pressable>
          </View>
        ))}
      </LocationCard>

      {category === "car_towing" ? (
        <LocationCard label="Towing destination" icon="flag-outline"
          value={destinationLocation?.address || "Choose a destination"}
          expanded={editingTarget === "destination"} onPress={() => {
            setActiveLocationTarget("destination");
            setEditingTarget(editingTarget === "destination" ? null : "destination");
          }}>
          <LocationAutocompleteField
            token={token} label="Search destination" icon="flag" placeholder="Enter a drop-off address"
            value={destination} onChangeText={(value) => { setDestinationSearch(value); setDestinationLocation(null); }}
            onSelect={applySelectedDestination} near={pickupLocation ?? undefined}
          />
        </LocationCard>
      ) : null}

      <VehicleCard value={vehicleLabel || (vehiclesLoading ? "Loading saved vehicles…" : "Select or enter a vehicle")}
        expanded={editingVehicle} onPress={() => setEditingVehicle(!editingVehicle)}>
        {vehicleError ? <Text style={customerStyles.muted}>{vehicleError}</Text> : null}
        {vehicles.length > 0 ? (
          <ChoiceGroup label="Vehicle to assist"
            options={[...vehicles.map((item) => ({ value: item.id, label: vehicleTitle(item) })), { value: "", label: "Enter manually" }]}
            value={vehicleId ?? ""}
            onChange={(value) => { manualVehicle.current = !value; setVehicleId(value || null); }}
          />
        ) : null}
        {!selectedVehicle ? (
          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Vehicle model</Text>
              <TextInput accessibilityLabel="Vehicle model" value={vehicle} onChangeText={setVehicle}
                placeholder="Enter model" placeholderTextColor={customerColors.inkMuted} style={customerStyles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>License plate</Text>
              <TextInput accessibilityLabel="License plate" value={registrationNumber} onChangeText={setRegistrationNumber}
                placeholder="Enter plate" placeholderTextColor={customerColors.inkMuted}
                autoCapitalize="characters" style={customerStyles.input} />
            </View>
          </View>
        ) : null}
        <PrimaryButton title="Add a saved vehicle" icon="add" variant="outline" style={styles.secondaryButton}
          onPress={() => router.push("/vehicles/add")} />
      </VehicleCard>

      {category === "fuel_delivery" ? (
        <Surface>
          <SectionHeading>Fuel details</SectionHeading>
          <ChoiceGroup label="Fuel type" options={fuelTypes} value={fuelType} onChange={setFuelType} />
          <ChoiceGroup label="Quantity" options={fuelQuantities} value={liters} onChange={setLiters} />
        </Surface>
      ) : null}

      {category === "mechanic" ? (
        <Surface>
          <SectionHeading>Vehicle issue</SectionHeading>
          <ChoiceGroup label="Issue category" hideLabel options={mechanicIssues} value={mechanicIssue} onChange={(issue) => {
            setManualSelectionVersion((value) => value + 1);
            setMechanicIssue(issue);
          }} />
          <Description label="Issue description" value={description} onChange={setDescription} />
        </Surface>
      ) : (
        <Surface>
          <Description label="Notes (optional)" value={description} onChange={setDescription} />
        </Surface>
      )}

      <Surface style={styles.aiCard}>
        <Pressable accessibilityRole="button" accessibilityLabel="AI Breakdown Diagnostic Assist" accessibilityState={{ expanded: showAiModal }}
          onPress={() => setShowAiModal(!showAiModal)} style={styles.aiButton}>
          <Ionicons name="sparkles-outline" size={20} color={customerColors.brand} />
          <Text style={[styles.fieldLabel, styles.aiLabel]}>AI Breakdown Diagnostic Assist</Text>
          <Ionicons name={showAiModal ? "chevron-up" : "chevron-down"} size={16} color={customerColors.brand} />
        </Pressable>
        {showAiModal ? (
          <View style={styles.aiBody}>
            <ServiceSuggestionCard token={token} description={description} onDescriptionChange={setDescription}
              manualSelectionVersion={manualSelectionVersion} onSuggestionAccepted={applyServiceSuggestion}
              onSignInRequested={() => router.replace("/(auth)/login")} />
          </View>
        ) : null}
      </Surface>

      <PrioritySelector value={priority} onChange={setPriority} />
      <SummaryCard title={config.summary} items={summaryItems}
        total={currentEstimate ? formatCurrency(currentEstimate.total) : undefined}
        note={category === "car_towing" && !currentEstimate && !routeError
          ? waitingForRoute ? "Finding the driving route…" : "Select pickup and destination to estimate your fare."
          : currentEstimate ? "Preview. The final estimate is calculated by the server." : undefined} />
      {routeError ? (
        <Surface>
          <NoticeBanner tone="warning" title="Driving route unavailable" message={routeError} />
          <PrimaryButton title="Retry route" icon="refresh" variant="outline"
            onPress={retryRoute} />
        </Surface>
      ) : null}
      {formError ? <NoticeBanner tone="danger" title="Request details" message={formError} /> : null}
      <PrimaryButton title={config.action} icon="arrow-forward" style={customerStyles.primary}
        loading={loading} disabled={Boolean(locationLoading) || waitingForRoute} onPress={onSubmit} />
    </CustomerScreen>
  );
}

const requestCopy = {
  car_towing: { title: "Car towing request", location: "Pickup location", summary: "Estimated fare", action: "Find Tow Trucks" },
  fuel_delivery: { title: "Fuel delivery request", location: "Delivery location", summary: "Estimated cost", action: "Find Fuel Providers" },
  mechanic: { title: "Mechanic booking", location: "Service location", summary: "Visit estimate", action: "Find Mechanics" }
};

const fuelTypes: ReadonlyArray<{ label: string; value: FuelType }> = [
  { label: "Petrol", value: "petrol" }, { label: "Diesel", value: "diesel" }
];
const fuelQuantities = ["3", "5", "10"].map((value) => ({ label: `${value} L`, value }));

function vehicleTitle(item: Vehicle) {
  return [`${item.make} ${item.model}`.trim(), item.registrationNumber].filter(Boolean).join(" · ");
}

function Description({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholder="Add any details for your provider"
        placeholderTextColor={customerColors.inkMuted} value={value} onChangeText={onChange}
        multiline style={[customerStyles.input, styles.description]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mapCard: { padding: 9 },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { flex: 1, minWidth: 110, gap: 6 },
  fieldLabel: { color: customerColors.ink, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  description: { minHeight: 72, textAlignVertical: "top" },
  secondaryButton: { minHeight: 44, borderColor: customerColors.border },
  favorite: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, minHeight: 44, paddingHorizontal: 8 },
  removeFavorite: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
  aiCard: { padding: 0, gap: 0, backgroundColor: customerColors.brandSoft },
  aiButton: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13 },
  aiLabel: { flex: 1 },
  aiBody: { padding: 12 },
  error: { color: customerColors.statusDanger, fontSize: 13, lineHeight: 18 }
});
