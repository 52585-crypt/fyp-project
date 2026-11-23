import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { colors } from "../../../src/theme/colors";
import { RAButton } from "../../../src/components/RAButton";
import { RATextInput } from "../../../src/components/RATextInput";
import { LocationMapPicker, type LocationTarget } from "../../../src/components/LocationMapPicker";
import { CoordinateField } from "../../../src/components/CoordinateField";
import { LocationAutocompleteField } from "../../../src/components/LocationAutocompleteField";
import { useAuth } from "../../../src/auth/AuthProvider";
import { ServiceSuggestionCard } from "../../../src/ai/ServiceSuggestionCard";
import { selectionFromSuggestion } from "../../../src/ai/serviceSuggestion.integration";
import type { ServiceSuggestion } from "../../../src/ai/serviceSuggestion.types";
import type { Vehicle } from "../../../src/vehicles/vehicles.types";
import { listMyVehicles } from "../../../src/vehicles/vehicles.api";
import { buildEstimate, TOWING_RATE_PER_KM } from "../../../src/requests/requestEstimate";
import type { FuelType, MechanicIssueCategory, NearbyProvider, RequestCategory } from "../../../src/requests/requests.types";
import { createRequest, listNearbyProviders } from "../../../src/requests/requests.api";
import type { FavoriteLocation } from "../../../src/services/favoriteLocations.storage";
import { useFavoriteLocations } from "../../../src/services/useFavoriteLocations";
import { searchPlaces, type GeocodingResult } from "../../../src/services/geocoding";
import { applyNormalizedLocationTarget, normalizeLocation, selectedRequestLocations, type NormalizedLocation } from "../../../src/services/normalizedLocation";
import { requiresGoogleMap } from "../../../src/services/locationMapPolicy";
import { useBookingRoute } from "../../../src/requests/useBookingRoute";
import { customerServices, normalizeBookingCategory } from "../../../src/ui/customer/services";
import { distanceKm, type Coordinate } from "../../../src/utils/distance";

type ServiceOption = {
  id: RequestCategory;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  category: RequestCategory;
  issueType: string | null;
  unknownIssue?: boolean;
};

const serviceDetails: Record<RequestCategory, Pick<ServiceOption, "subtitle" | "icon" | "issueType">> = {
  car_towing: { subtitle: "Move vehicle", icon: "car", issueType: "breakdown" },
  fuel_delivery: { subtitle: "Petrol or diesel", icon: "water", issueType: "fuel_delivery" },
  mechanic: { subtitle: "Inspection and repair", icon: "construct", issueType: "battery" }
};

const serviceOptions: ServiceOption[] = customerServices.map(({ label, value }) => ({
  id: value, title: label, category: value, ...serviceDetails[value]
}));

const fuelOptions: Array<{ label: string; value: FuelType }> = [
  { label: "Petrol", value: "petrol" },
  { label: "Diesel", value: "diesel" }
];

const mechanicIssues: Array<{ label: string; value: MechanicIssueCategory }> = [
  { label: "Battery", value: "battery" },
  { label: "Engine", value: "engine" },
  { label: "Tyre", value: "tyre" },
  { label: "Brake", value: "brake" },
  { label: "Overheating", value: "overheating" },
  { label: "Inspection", value: "general_inspection" }
];

function parseCoordinate(lat: string, lng: string) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng) || Math.abs(parsedLat) > 90 || Math.abs(parsedLng) > 180) return null;
  return { latitude: parsedLat, longitude: parsedLng };
}

function coordinateLabel(prefix: string, coordinate: Coordinate) {
  return `${prefix}: ${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function ratingText(provider: NearbyProvider) {
  if (!provider.ratingCount) return "New provider";
  return `${Number(provider.ratingAvg || 0).toFixed(1)} rating (${provider.ratingCount})`;
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function ServiceCard({ item, selected, onPress }: { item: ServiceOption; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.serviceCard, selected ? styles.serviceCardSelected : null]}>
      <View style={styles.serviceTop}>
        <View style={[styles.serviceIcon, selected ? styles.serviceIconSelected : null]}>
          <Ionicons name={item.icon} size={19} color={selected ? "white" : colors.primaryDark} />
        </View>
        {selected ? <Ionicons name="checkmark-circle" size={19} color={colors.primaryDark} /> : null}
      </View>
      <Text style={[styles.serviceTitle, selected ? styles.serviceTitleSelected : null]}>{item.title}</Text>
      <Text style={styles.serviceSubtitle}>{item.subtitle}</Text>
    </Pressable>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function CreateRequest() {
  const { token } = useAuth();
  const params = useLocalSearchParams<{ category?: string }>();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState(() => normalizeBookingCategory(params.category));
  const [description, setDescription] = useState("");
  const [manualSelectionVersion, setManualSelectionVersion] = useState(0);
  const [pickupLocation, setPickupLocation] = useState<NormalizedLocation | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<NormalizedLocation | null>(null);
  const [pickupSearch, setPickupSearch] = useState("");
  const [destinationSearch, setDestinationSearch] = useState("");
  const [coordinateDrafts, setCoordinateDrafts] = useState<Partial<Record<LocationTarget, { latitude: string; longitude: string }>>>({});
  const coordinateInputs = (target: LocationTarget, location: NormalizedLocation | null) => ({
    latitude: location ? String(location.latitude) : coordinateDrafts[target]?.latitude || "",
    longitude: location ? String(location.longitude) : coordinateDrafts[target]?.longitude || ""
  });
  const { latitude: lat, longitude: lng } = coordinateInputs("pickup", pickupLocation);
  const { latitude: destinationLat, longitude: destinationLng } = coordinateInputs("destination", destinationLocation);
  const addressText = pickupLocation?.address || pickupSearch;
  const destinationAddress = destinationLocation?.address || destinationSearch;
  const editLocationSearch = (target: LocationTarget, address: string) => {
    setCoordinateDrafts((value) => ({ ...value, [target]: undefined }));
    if (target === "pickup") { setPickupSearch(address); setPickupLocation(null); }
    else { setDestinationSearch(address); setDestinationLocation(null); }
  };
  const setAddressText = (address: string) => editLocationSearch("pickup", address);
  const setDestinationAddress = (address: string) => editLocationSearch("destination", address);
  const updateCoordinate = (target: "pickup" | "destination", field: "latitude" | "longitude", text: string) => {
    const location = target === "pickup" ? pickupLocation : destinationLocation;
    const draft = coordinateInputs(target, location);
    if (draft[field] === text.trim()) return;
    draft[field] = text.trim();
    const setter = target === "pickup" ? setPickupLocation : setDestinationLocation;
    const searchSetter = target === "pickup" ? setPickupSearch : setDestinationSearch;
    const coordinate = draft.latitude && draft.longitude ? parseCoordinate(draft.latitude, draft.longitude) : null;
    setCoordinateDrafts((value) => ({ ...value, [target]: draft }));
    searchSetter("");
    setter(coordinate ? normalizeLocation({
      ...coordinate, source: "manual_map", address: coordinateLabel(target === "pickup" ? "Pinned pickup" : "Pinned destination", coordinate)
    }) : null);
  };
  const setLat = (value: string) => updateCoordinate("pickup", "latitude", value);
  const setLng = (value: string) => updateCoordinate("pickup", "longitude", value);
  const setDestinationLat = (value: string) => updateCoordinate("destination", "latitude", value);
  const setDestinationLng = (value: string) => updateCoordinate("destination", "longitude", value);
  const [activeLocationTarget, setActiveLocationTarget] = useState<LocationTarget>("pickup");
  const [fuelType, setFuelType] = useState<FuelType>("petrol");
  const [liters, setLiters] = useState("5");
  const [mechanicIssue, setMechanicIssue] = useState<MechanicIssueCategory>("battery");
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSearchLoading, setLocationSearchLoading] = useState<"pickup" | "destination" | null>(null);
  const [nearbyProviders, setNearbyProviders] = useState<NearbyProvider[]>([]);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState<number | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { favoriteLocations, favoriteSaving, saveFavorite, removeFavorite } = useFavoriteLocations(setError);
  const submission = useRef<{ fingerprint: string; id: string } | null>(null);
  const submitting = useRef(false);

  const selectedService = useMemo(
    () => serviceOptions.find((option) => option.id === selectedServiceId) || serviceOptions[0],
    [selectedServiceId]
  );

  const loadVehicles = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const data = await listMyVehicles(token);
      setVehicles(data);
      if (!vehicleId && data.length > 0) setVehicleId(data[0].id);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load vehicles");
    }
  }, [token, vehicleId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    setSelectedServiceId(normalizeBookingCategory(params.category));
  }, [params.category]);


  const selectedVehicle = useMemo(() => vehicles.find((vehicle) => vehicle.id === vehicleId) || null, [vehicleId, vehicles]);

  const locationReady = Boolean(pickupLocation);
  const destinationReady = Boolean(destinationLocation);
  const { route, loading: routeLoading, error: routeError, retry: retryRoute } =
    useBookingRoute(pickupLocation, selectedService.category === "car_towing" ? destinationLocation : null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!token || !pickupLocation) {
        setNearbyProviders([]);
        setNearbyRadiusKm(null);
        setNearbyLoading(false);
        return;
      }
      try {
        setNearbyLoading(true);
        setNearbyError(null);
        const result = await listNearbyProviders(token, {
          category: selectedService.category,
          lat: pickupLocation.latitude,
          lng: pickupLocation.longitude
        });
        if (!cancelled) {
          setNearbyProviders(result.providers);
          setNearbyRadiusKm(result.radiusKm);
        }
      } catch (e: any) {
        if (!cancelled) {
          setNearbyProviders([]);
          setNearbyRadiusKm(null);
          setNearbyError(e?.response?.data?.message || e?.message || "Failed to load nearby providers");
        }
      } finally {
        if (!cancelled) setNearbyLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickupLocation, selectedService.category, token]);

  const quantity = Number(liters);
  const litersNumber = quantity >= 1 && quantity <= 50 ? Math.round(quantity) : NaN;
  const estimate = buildEstimate(selectedService.category, route?.distanceKm ?? null, fuelType, litersNumber);
  const approximateDistance = routeError && pickupLocation && destinationLocation
    ? distanceKm(pickupLocation, destinationLocation) : null;

  const canSubmit = Boolean(
    vehicleId &&
      locationReady &&
      (selectedService.category !== "car_towing" || destinationReady) &&
      (selectedService.category !== "fuel_delivery" || (litersNumber >= 1 && litersNumber <= 50)) &&
      !loading
  );

  async function useCurrentLocation() {
    try {
      setLocationLoading(true);
      setError(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location permission is required to use current location.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const location = normalizeLocation({ latitude: current.coords.latitude, longitude: current.coords.longitude, source: "gps" });
      setPickupLocation({ ...location, address: "Current location" });
      setActiveLocationTarget("pickup");

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude
        });
        if (address) {
          const readable = [address.name, address.street, address.city, address.region].filter(Boolean).join(", ");
          setPickupLocation((value) => value?.source === "gps" && value.latitude === location.latitude && value.longitude === location.longitude ? { ...value, address: readable || "Current location" } : value);
        }
      } catch {
        // Coordinates remain usable when reverse geocoding fails.
      }
    } catch (e: any) {
      setError(e?.message || "Failed to fetch current location");
    } finally {
      setLocationLoading(false);
    }
  }

  function updatePickupFromMap(coordinate: Coordinate) {
    const location = normalizeLocation({ ...coordinate, address: coordinateLabel("Pinned pickup", coordinate), source: "manual_map" });
    setPickupLocation(location);
  }

  function updateDestinationFromMap(coordinate: Coordinate) {
    const location = normalizeLocation({ ...coordinate, address: coordinateLabel("Pinned destination", coordinate), source: "manual_map" });
    setDestinationLocation(location);
  }

  function applyPickupLocation(result: GeocodingResult) {
    const location = normalizeLocation({ ...result, address: result.label, source: result.source });
    applySelectedPickup(location);
  }

  function applySelectedPickup(location: NormalizedLocation) {
    applyNormalizedLocationTarget("pickup", location, { pickup: setPickupLocation, destination: setDestinationLocation });
    setActiveLocationTarget("pickup");
  }

  function applyFavoritePickupLocation(location: FavoriteLocation) {
    if (location.latitude == null || location.longitude == null || location.source === "google_places") { setError("This saved location is unavailable. Please select it again."); return; }
    setPickupLocation(normalizeLocation({ latitude: location.latitude, longitude: location.longitude, address: location.addressText, source: location.source || "unknown", placeId: location.placeId }));
    setActiveLocationTarget("pickup");
  }

  function applyDestinationLocation(result: GeocodingResult) {
    const location = normalizeLocation({ ...result, address: result.label, source: result.source });
    applySelectedDestination(location);
  }

  function applySelectedDestination(location: NormalizedLocation) {
    applyNormalizedLocationTarget("destination", location, { pickup: setPickupLocation, destination: setDestinationLocation });
    setActiveLocationTarget("destination");
  }

  async function findPickupLocation() {
    try {
      setLocationSearchLoading("pickup");
      setError(null);
      const [result] = await searchPlaces(addressText, pickupLocation ?? undefined);
      if (!result) {
        setError("No pickup location found. Try a more specific address.");
        return;
      }
      applyPickupLocation(result);
    } catch (e: any) {
      setError(e?.message || "Failed to search pickup location");
    } finally {
      setLocationSearchLoading(null);
    }
  }

  async function findDestinationLocation() {
    try {
      setLocationSearchLoading("destination");
      setError(null);
      const [result] = await searchPlaces(destinationAddress, pickupLocation ?? undefined);
      if (!result) {
        setError("No destination found. Try a more specific address.");
        return;
      }
      applyDestinationLocation(result);
    } catch (e: any) {
      setError(e?.message || "Failed to search destination");
    } finally {
      setLocationSearchLoading(null);
    }
  }

  async function saveCurrentPickupAsFavorite() {
    if (!pickupLocation) {
      setError("Choose a pickup location before saving it.");
      return;
    }
    setError(null);
    await saveFavorite({
      addressText: addressText,
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
    if (!token || !canSubmit || !vehicleId || submitting.current) return;
    const locations = selectedRequestLocations(selectedService.category, pickupLocation, destinationLocation);
    if (!locations) return;
    submitting.current = true;
    try {
      setLoading(true);
      setError(null);
      const input = {
        vehicleId,
        category: selectedService.category,
        issueType:
          selectedService.category === "mechanic"
            ? mechanicIssue
            : selectedService.unknownIssue
              ? null
              : selectedService.issueType,
        description: description.trim() ? description.trim() : null,
        ...locations,
        distanceKm: route?.distanceKm ?? null,
        fuelDetails:
          selectedService.category === "fuel_delivery"
            ? {
                fuelType,
                liters: litersNumber
              }
            : undefined,
        mechanicDetails:
          selectedService.category === "mechanic"
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
      await createRequest(token, { ...input, clientRequestId: submission.current.id });
      router.replace("/(app)/home");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Request failed");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  function applyServiceSuggestion(suggestion: ServiceSuggestion) {
    const selection = selectionFromSuggestion(suggestion);
    if (!selection) return;
    setSelectedServiceId(selection.category);
    if (selection.mechanicIssue) setMechanicIssue(selection.mechanicIssue);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Service Information</Text>
            <Text style={styles.subtitle}>Vehicle, problem, pickup details</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <ServiceSuggestionCard
            token={token}
            description={description}
            onDescriptionChange={setDescription}
            manualSelectionVersion={manualSelectionVersion}
            onSuggestionAccepted={applyServiceSuggestion}
            onSignInRequested={() => router.replace("/(auth)/login")}
          />

          <Section title="Our Services">
            <View style={styles.serviceGrid}>
              {serviceOptions.map((option) => (
                <ServiceCard
                  key={option.id}
                  item={option}
                  selected={option.id === selectedServiceId}
                  onPress={() => {
                    if (option.id === selectedServiceId) return;
                    setManualSelectionVersion((version) => version + 1);
                    setSelectedServiceId(option.id);
                  }}
                />
              ))}
            </View>
          </Section>

          <Section
            title="Vehicle Information"
            action={
              <Pressable onPress={() => router.push("/(app)/vehicles/add")} style={styles.smallAction}>
                <Ionicons name="add" size={16} color={colors.primaryDark} />
                <Text style={styles.smallActionText}>Add</Text>
              </Pressable>
            }
          >
            {vehicles.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="car-outline" size={22} color={colors.mutedText} />
                <Text style={styles.emptyText}>Add a vehicle before sending a request.</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={vehicles}
                keyExtractor={(vehicle) => vehicle.id}
                contentContainerStyle={styles.vehicleList}
                renderItem={({ item }) => {
                  const selected = item.id === vehicleId;
                  return (
                    <Pressable onPress={() => setVehicleId(item.id)} style={[styles.vehicleCard, selected ? styles.vehicleCardSelected : null]}>
                      <View style={[styles.vehicleIcon, selected ? styles.vehicleIconSelected : null]}>
                        <Ionicons name={item.type === "bike" ? "bicycle" : "car-sport"} size={18} color={selected ? "white" : colors.primaryDark} />
                      </View>
                      <Text style={[styles.vehicleTitle, selected ? styles.vehicleTitleSelected : null]}>
                        {item.make} {item.model}
                      </Text>
                      <Text style={styles.vehicleText}>{item.type.toUpperCase()} - {item.year}</Text>
                    </Pressable>
                  );
                }}
              />
            )}
          </Section>

          <Section title="Pickup Location">
            <Pressable onPress={useCurrentLocation} disabled={locationLoading} style={styles.locationButton}>
              <Ionicons name="navigate" size={18} color={colors.primaryDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.locationTitle}>{locationLoading ? "Fetching location..." : "Use current location"}</Text>
                <Text style={styles.locationText}>{addressText || "Tap to capture current position"}</Text>
              </View>
            </Pressable>
            <View style={{ height: 10 }} />
            <LocationAutocompleteField
              token={token}
              variant="compact"
              icon="location"
              placeholder="Search pickup address"
              value={addressText}
              onChangeText={setAddressText}
              onSelect={applySelectedPickup}
              near={pickupLocation ?? undefined}
            />
            <View style={{ height: 10 }} />
            <RAButton
              title={locationSearchLoading === "pickup" ? "Finding pickup..." : "Find Pickup on Map"}
              disabled={Boolean(locationSearchLoading) || locationLoading}
              onPress={findPickupLocation}
            />
            <View style={styles.favoriteBlock}>
              <View style={styles.favoriteHeader}>
                <Text style={styles.favoriteTitle}>Saved locations</Text>
                <Pressable disabled={favoriteSaving} onPress={saveCurrentPickupAsFavorite} style={styles.favoriteSaveButton}>
                  <Ionicons name="bookmark" size={15} color={colors.primaryDark} />
                  <Text style={styles.favoriteSaveText}>{favoriteSaving ? "Saving..." : "Save Pickup"}</Text>
                </Pressable>
              </View>
              {favoriteLocations.length > 0 ? (
                <View style={styles.favoriteList}>
                  {favoriteLocations.map((location) => (
                    <View key={location.id} style={styles.favoriteChip}>
                      <Pressable onPress={() => applyFavoritePickupLocation(location)} style={styles.favoriteApply}>
                        <Text numberOfLines={1} style={styles.favoriteText}>
                          {location.label}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => removeFavoritePickupLocation(location.id)} style={styles.favoriteDelete}>
                        <Ionicons name="close" size={15} color={colors.mutedText} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.favoriteEmpty}>Save frequent pickup or service points here.</Text>
              )}
            </View>
            <View style={styles.coordinateRow}>
              <View style={{ flex: 1 }}>
                <CoordinateField variant="compact" label="Lat" value={lat} onChangeText={setLat} />
              </View>
              <View style={{ flex: 1 }}>
                <CoordinateField variant="compact" label="Lng" value={lng} onChangeText={setLng} />
              </View>
            </View>
          </Section>

          <Section
            title="Service Map"
            action={<Text style={styles.mapAction}>{nearbyLoading ? "Searching" : `${nearbyProviders.length} available`}</Text>}
          >
            <LocationMapPicker
              pickup={pickupLocation}
              destination={selectedService.category === "car_towing" ? destinationLocation : null}
              route={route?.coordinates}
              activeTarget={activeLocationTarget}
              onActiveTargetChange={setActiveLocationTarget}
              onPickupChange={updatePickupFromMap}
              onDestinationChange={selectedService.category === "car_towing" ? updateDestinationFromMap : updatePickupFromMap}
              singlePoint={selectedService.category !== "car_towing"}
              pointLabel={selectedService.category === "fuel_delivery" ? "Delivery location" : selectedService.category === "mechanic" ? "Service location" : "Pickup"}
              pickupLabel="Pickup"
              destinationLabel="Destination"
              requiresGoogleMap={requiresGoogleMap(pickupLocation, selectedService.category === "car_towing" ? destinationLocation : null)}
            />
            <View style={styles.mapSummary}>
              <Text style={styles.mapSummaryTitle}>
                {nearbyLoading
                  ? "Checking online providers..."
                  : nearbyProviders.length
                    ? `${nearbyProviders.length} provider${nearbyProviders.length === 1 ? "" : "s"} ${nearbyRadiusKm === null ? "nearby" : `within ${nearbyRadiusKm} km`}`
                    : nearbyRadiusKm === null ? "No nearby providers found" : `No providers within ${nearbyRadiusKm} km`}
              </Text>
              <Text style={styles.mapSummaryText}>
                Blue is pickup. Red is the towing destination.
              </Text>
            </View>
            {nearbyProviders.slice(0, 3).map((provider) => (
              <View key={provider.id} style={styles.providerRow}>
                <View style={styles.providerIcon}>
                  <Ionicons name={selectedService.icon} size={18} color="white" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.providerName}>{provider.name}</Text>
                  <Text style={styles.providerMeta}>
                    {ratingText(provider)}
                  </Text>
                </View>
              </View>
            ))}
            {nearbyError ? <Text style={styles.error}>{nearbyError}</Text> : null}
          </Section>

          {selectedService.category === "car_towing" ? (
            <Section title="Towing Details">
              <View style={styles.fareCard}>
                <View>
                  <Text style={styles.fareLabel}>Estimated Fare</Text>
                  <Text style={styles.fareValue}>{estimate ? `Rs. ${estimate.total.toLocaleString()}` : "Unavailable"}</Text>
                </View>
                <View style={styles.fareMeta}>
                  {route ? <Text style={styles.fareMetaText}>{route.distanceKm.toFixed(1)} km</Text> : null}
                  {approximateDistance !== null ? (
                    <Text style={styles.fareMetaText}>About {approximateDistance.toFixed(1)} km</Text>
                  ) : null}
                  <Text style={styles.fareMetaSub}>Rs. {TOWING_RATE_PER_KM}/km</Text>
                </View>
              </View>
              <View style={{ height: 10 }} />
              <LocationAutocompleteField
                token={token}
                variant="compact"
                icon="flag"
                placeholder="Search destination address"
                value={destinationAddress}
                onChangeText={setDestinationAddress}
                onSelect={applySelectedDestination}
                near={pickupLocation ?? undefined}
              />
              <View style={{ height: 10 }} />
              <RAButton
                title={locationSearchLoading === "destination" ? "Finding destination..." : "Find Destination on Map"}
                disabled={Boolean(locationSearchLoading) || locationLoading}
                onPress={findDestinationLocation}
              />
              <View style={styles.coordinateRow}>
                <View style={{ flex: 1 }}>
                  <CoordinateField variant="compact" label="Destination lat" value={destinationLat} onChangeText={setDestinationLat} />
                </View>
                <View style={{ flex: 1 }}>
                  <CoordinateField variant="compact" label="Destination lng" value={destinationLng} onChangeText={setDestinationLng} />
                </View>
              </View>
              <Text style={styles.distanceNote}>
                {routeLoading
                  ? "Calculating road distance..."
                  : routeError ? `${routeError} Approximate distance is straight-line only.`
                    : route ? "Preview. The final estimate is calculated by the server."
                      : "Select pickup and destination to preview the fare."}
              </Text>
              {routeError ? <RAButton title="Retry route" onPress={retryRoute} /> : null}
            </Section>
          ) : null}

          {selectedService.category === "fuel_delivery" ? (
            <Section title="Fuel Details">
              <View style={styles.segment}>
                {fuelOptions.map((item) => {
                  const selected = fuelType === item.value;
                  return (
                    <Pressable key={item.value} onPress={() => setFuelType(item.value)} style={[styles.segmentItem, selected ? styles.segmentItemSelected : null]}>
                      <Text style={[styles.segmentText, selected ? styles.segmentTextSelected : null]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ height: 10 }} />
              <RATextInput icon="water" placeholder="Liters needed (1-50)" keyboardType="numeric" value={liters} onChangeText={setLiters} />
            </Section>
          ) : null}

          {selectedService.category === "mechanic" ? (
            <Section title="Mechanic Issue">
              <View style={styles.issueGrid}>
                {mechanicIssues.map((item) => {
                  const selected = mechanicIssue === item.value;
                  return (
                    <Pressable key={item.value} onPress={() => setMechanicIssue(item.value)} style={[styles.issuePill, selected ? styles.issuePillSelected : null]}>
                      <Text style={[styles.issueText, selected ? styles.issueTextSelected : null]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Section>
          ) : null}

          <View style={styles.reviewBox}>
            <Text style={styles.reviewTitle}>Service Summary</Text>
            <SummaryLine label="Service Type" value={selectedService.title} />
            <SummaryLine label="Vehicle" value={selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : "Not selected"} />
            <SummaryLine label="Location" value={pickupLocation ? addressText || `${lat}, ${lng}` : "Choose a pickup location"} />
            {selectedService.category === "car_towing" ? <SummaryLine label="Destination" value={destinationLocation ? destinationAddress || `${destinationLat}, ${destinationLng}` : "Choose a towing destination"} /> : null}
            {selectedService.category === "fuel_delivery" ? <SummaryLine label="Fuel" value={Number.isFinite(litersNumber) ? `${fuelType.toUpperCase()} - ${litersNumber}L` : "Enter 1–50 liters"} /> : null}
            {selectedService.category === "mechanic" ? <SummaryLine label="Issue" value={mechanicIssues.find((item) => item.value === mechanicIssue)?.label || mechanicIssue} /> : null}
            {estimate?.lines.map((line) => (
              <SummaryLine key={line.label} label={line.label} value={`Rs. ${line.amount.toLocaleString()}`} />
            ))}
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>Estimated Total</Text>
              <Text style={styles.estimateValue}>{estimate ? `Rs. ${estimate.total.toLocaleString()}` : "Unavailable"}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <RAButton
            title={loading ? "Sending request..." : "Confirm Request"}
            disabled={!canSubmit || vehicles.length === 0}
            onPress={onSubmit}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, padding: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  subtitle: { marginTop: 3, color: colors.mutedText, fontSize: 13, fontWeight: "700" },
  content: { paddingBottom: 18 },
  section: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  serviceCard: {
    width: "48%",
    minHeight: 106,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    justifyContent: "space-between"
  },
  serviceCardSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  serviceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  serviceIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  serviceIconSelected: { backgroundColor: colors.primary },
  serviceTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  serviceTitleSelected: { color: colors.primaryDark },
  serviceSubtitle: { color: colors.mutedText, fontSize: 11, lineHeight: 15 },
  smallAction: {
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 4
  },
  smallActionText: { color: colors.primaryDark, fontWeight: "900", fontSize: 12 },
  emptyBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  emptyText: { flex: 1, color: colors.mutedText, fontSize: 13, fontWeight: "700" },
  vehicleList: { gap: 10 },
  vehicleCard: {
    width: 168,
    minHeight: 98,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    justifyContent: "space-between"
  },
  vehicleCardSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  vehicleIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  vehicleIconSelected: { backgroundColor: colors.primary },
  vehicleTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  vehicleTitleSelected: { color: colors.primaryDark },
  vehicleText: { color: colors.mutedText, fontSize: 12 },
  locationButton: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  locationTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: "900" },
  locationText: { marginTop: 3, color: colors.mutedText, fontSize: 12, lineHeight: 16 },
  favoriteBlock: { gap: 8, marginTop: 10 },
  favoriteHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  favoriteTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  favoriteSaveButton: {
    minHeight: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 6
  },
  favoriteSaveText: { color: colors.primaryDark, fontSize: 12, fontWeight: "900" },
  favoriteList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  favoriteChip: {
    maxWidth: "100%",
    minHeight: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden"
  },
  favoriteApply: { maxWidth: 210, minHeight: 38, justifyContent: "center", paddingLeft: 12, paddingRight: 8 },
  favoriteText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  favoriteDelete: { width: 34, height: 38, alignItems: "center", justifyContent: "center" },
  favoriteEmpty: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  coordinateRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  mapAction: { color: colors.primaryDark, fontSize: 12, fontWeight: "900" },
  mapSummary: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: 12
  },
  mapSummaryTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  mapSummaryText: { marginTop: 3, color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  providerRow: {
    marginTop: 10,
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  providerIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center"
  },
  providerName: { color: colors.text, fontSize: 13, fontWeight: "900" },
  providerMeta: { marginTop: 3, color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  fareCard: {
    minHeight: 86,
    borderRadius: 16,
    backgroundColor: colors.primary,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12
  },
  fareLabel: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "800" },
  fareValue: { marginTop: 4, color: "white", fontSize: 25, fontWeight: "900" },
  fareMeta: {
    minWidth: 96,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  fareMetaText: { color: "white", fontSize: 15, fontWeight: "900" },
  fareMetaSub: { marginTop: 3, color: "rgba(255,255,255,0.78)", fontSize: 11, fontWeight: "800" },
  distanceNote: { marginTop: 10, color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  segment: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    flexDirection: "row",
    padding: 4
  },
  segmentItem: { flex: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  segmentItemSelected: { backgroundColor: colors.primary },
  segmentText: { color: colors.mutedText, fontSize: 13, fontWeight: "900" },
  segmentTextSelected: { color: "white" },
  issueGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  issuePill: {
    minHeight: 42,
    minWidth: "31%",
    flexGrow: 1,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  issuePillSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  issueText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  issueTextSelected: { color: "white" },
  reviewBox: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14
  },
  reviewTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginBottom: 8 },
  summaryLine: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  summaryLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  summaryValue: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "right" },
  estimateRow: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  estimateLabel: { color: colors.text, fontSize: 13, fontWeight: "900" },
  estimateValue: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  footer: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  error: { color: colors.danger, fontWeight: "800", marginBottom: 10 }
});
