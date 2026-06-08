import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { colors } from "../../../src/theme/colors";
import { RAButton } from "../../../src/components/RAButton";
import { RATextInput } from "../../../src/components/RATextInput";
import { LocationMapPicker, type LocationTarget } from "../../../src/components/LocationMapPicker";
import { useAuth } from "../../../src/auth/AuthProvider";
import type { Vehicle } from "../../../src/vehicles/vehicles.types";
import { listMyVehicles } from "../../../src/vehicles/vehicles.api";
import type { FuelType, MechanicIssueCategory, NearbyProvider, PriceLine, RequestCategory } from "../../../src/requests/requests.types";
import { createRequest, listNearbyProviders } from "../../../src/requests/requests.api";
import {
  deleteFavoriteLocation,
  getFavoriteLocations,
  saveFavoriteLocation,
  type FavoriteLocation
} from "../../../src/services/favoriteLocations.storage";
import { searchPlaces, type GeocodingResult } from "../../../src/services/geocoding";
import { getDrivingDistanceKm } from "../../../src/services/routing";
import { distanceKm as calculateDistanceKm, type Coordinate } from "../../../src/utils/distance";

type ServiceOption = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  category: RequestCategory;
  issueType: string | null;
  unknownIssue?: boolean;
};

const serviceOptions: ServiceOption[] = [
  { id: "towing", title: "Car Towing", subtitle: "Move vehicle", icon: "car", category: "car_towing", issueType: "breakdown" },
  { id: "fuel", title: "Fuel Delivery", subtitle: "Petrol or diesel", icon: "water", category: "fuel_delivery", issueType: "fuel_delivery" },
  { id: "mechanic", title: "Mechanic", subtitle: "Inspection and repair", icon: "construct", category: "mechanic", issueType: "battery" }
];

function serviceIdForCategory(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "fuel_delivery") return "fuel";
  if (raw === "mechanic") return "mechanic";
  return "towing";
}

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

const DEFAULT_PICKUP = { latitude: 31.5204, longitude: 74.3587 };
const DEFAULT_DESTINATION = { latitude: 31.4697, longitude: 74.2728 };
const TOWING_RATE_PER_KM = 180;

function parsePositiveNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCoordinate(lat: string, lng: string, fallback: Coordinate) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return fallback;
  return { latitude: parsedLat, longitude: parsedLng };
}

function formatDistanceKm(value: number) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function coordinateLabel(prefix: string, coordinate: Coordinate) {
  return `${prefix}: ${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function nearbyRadiusFor(category: RequestCategory) {
  if (category === "car_towing") return 15;
  if (category === "fuel_delivery") return 8;
  return 5;
}

function ratingText(provider: NearbyProvider) {
  if (!provider.ratingCount) return "New provider";
  return `${Number(provider.ratingAvg || 0).toFixed(1)} rating (${provider.ratingCount})`;
}

function buildEstimate(category: RequestCategory, distanceKm: number, fuelType: FuelType, liters: number) {
  let lines: PriceLine[];

  if (category === "car_towing") {
    lines = [
      { label: "Base towing fee", amount: 1200 },
      { label: `Distance charge (${distanceKm} km)`, amount: Math.round(distanceKm * TOWING_RATE_PER_KM) },
      { label: "Service fee", amount: 250 }
    ];
  } else if (category === "fuel_delivery") {
    const perLiter = fuelType === "diesel" ? 290 : 275;
    lines = [
      { label: `${fuelType === "diesel" ? "Diesel" : "Petrol"} (${liters}L)`, amount: Math.round(perLiter * liters) },
      { label: "Delivery fee", amount: 450 },
      { label: "Service fee", amount: 150 }
    ];
  } else {
    lines = [
      { label: "Inspection fee", amount: 900 },
      { label: "Visit fee", amount: 350 }
    ];
  }

  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.amount, 0)
  };
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
  const [selectedServiceId, setSelectedServiceId] = useState(() => serviceIdForCategory(params.category));
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("31.5204");
  const [lng, setLng] = useState("74.3587");
  const [addressText, setAddressText] = useState("Gulberg, Lahore");
  const [destinationLat, setDestinationLat] = useState("31.4697");
  const [destinationLng, setDestinationLng] = useState("74.2728");
  const [destinationAddress, setDestinationAddress] = useState("Johar Town, Lahore");
  const [distanceKm, setDistanceKm] = useState("8");
  const [activeLocationTarget, setActiveLocationTarget] = useState<LocationTarget>("pickup");
  const [fuelType, setFuelType] = useState<FuelType>("petrol");
  const [liters, setLiters] = useState("5");
  const [mechanicIssue, setMechanicIssue] = useState<MechanicIssueCategory>("battery");
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSearchLoading, setLocationSearchLoading] = useState<"pickup" | "destination" | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [favoriteLocations, setFavoriteLocations] = useState<FavoriteLocation[]>([]);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [nearbyProviders, setNearbyProviders] = useState<NearbyProvider[]>([]);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState(nearbyRadiusFor("car_towing"));
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setSelectedServiceId(serviceIdForCategory(params.category));
  }, [params.category]);

  useEffect(() => {
    let mounted = true;

    async function loadFavoriteLocations() {
      try {
        const saved = await getFavoriteLocations();
        if (mounted) setFavoriteLocations(saved);
      } catch {
        if (mounted) setFavoriteLocations([]);
      }
    }

    loadFavoriteLocations();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedVehicle = useMemo(() => vehicles.find((vehicle) => vehicle.id === vehicleId) || null, [vehicleId, vehicles]);

  const locationReady = useMemo(() => {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    return Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
  }, [lat, lng]);

  const destinationReady = useMemo(() => {
    const parsedLat = Number(destinationLat);
    const parsedLng = Number(destinationLng);
    return Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
  }, [destinationLat, destinationLng]);

  const pickupCoordinate = useMemo(() => parseCoordinate(lat, lng, DEFAULT_PICKUP), [lat, lng]);
  const destinationCoordinate = useMemo(
    () => parseCoordinate(destinationLat, destinationLng, DEFAULT_DESTINATION),
    [destinationLat, destinationLng]
  );
  const calculatedDistanceKm = useMemo(
    () => calculateDistanceKm(pickupCoordinate, destinationCoordinate),
    [destinationCoordinate, pickupCoordinate]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRouteDistance() {
      if (selectedService.category !== "car_towing" || !locationReady || !destinationReady) return;

      try {
        setRouteLoading(true);
        const km = await getDrivingDistanceKm(pickupCoordinate, destinationCoordinate);
        if (!cancelled) {
          const nextDistance = formatDistanceKm(km);
          setDistanceKm((current) => (current === nextDistance ? current : nextDistance));
        }
      } catch {
        if (!cancelled) {
          const fallbackDistance = formatDistanceKm(calculatedDistanceKm);
          setDistanceKm((current) => (current === fallbackDistance ? current : fallbackDistance));
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }

    loadRouteDistance();

    return () => {
      cancelled = true;
    };
  }, [
    calculatedDistanceKm,
    destinationCoordinate,
    destinationReady,
    locationReady,
    pickupCoordinate,
    selectedService.category
  ]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!token || !locationReady) return;
      try {
        const radiusKm = nearbyRadiusFor(selectedService.category);
        setNearbyLoading(true);
        setNearbyError(null);
        const result = await listNearbyProviders(token, {
          category: selectedService.category,
          lat: pickupCoordinate.latitude,
          lng: pickupCoordinate.longitude,
          radiusKm
        });
        if (!cancelled) {
          setNearbyProviders(result.providers);
          setNearbyRadiusKm(result.radiusKm);
        }
      } catch (e: any) {
        if (!cancelled) {
          setNearbyProviders([]);
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
  }, [locationReady, pickupCoordinate, selectedService.category, token]);

  const litersNumber = useMemo(() => Math.min(50, Math.max(1, Math.round(parsePositiveNumber(liters, 5)))), [liters]);
  const distanceNumber = useMemo(() => Math.max(1, parsePositiveNumber(distanceKm, 8)), [distanceKm]);
  const estimate = useMemo(
    () => buildEstimate(selectedService.category, distanceNumber, fuelType, litersNumber),
    [distanceNumber, fuelType, litersNumber, selectedService.category]
  );
  const providerPins = useMemo(
    () =>
      nearbyProviders.map((provider) => ({
        id: provider.id,
        name: provider.name,
        distanceKm: provider.distanceKm,
        location: {
          latitude: provider.location.lat,
          longitude: provider.location.lng
        }
      })),
    [nearbyProviders]
  );

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
      setLat(String(current.coords.latitude));
      setLng(String(current.coords.longitude));
      setActiveLocationTarget("pickup");

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude
        });
        if (address) {
          const readable = [address.name, address.street, address.city, address.region].filter(Boolean).join(", ");
          setAddressText(readable || "Current location");
        }
      } catch {
        setAddressText("Current location");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to fetch current location");
    } finally {
      setLocationLoading(false);
    }
  }

  function updatePickupFromMap(coordinate: Coordinate) {
    setLat(String(coordinate.latitude));
    setLng(String(coordinate.longitude));
    setAddressText(coordinateLabel("Pinned pickup", coordinate));
  }

  function updateDestinationFromMap(coordinate: Coordinate) {
    setDestinationLat(String(coordinate.latitude));
    setDestinationLng(String(coordinate.longitude));
    setDestinationAddress(coordinateLabel("Pinned destination", coordinate));
  }

  function applyPickupLocation(result: GeocodingResult) {
    setLat(String(result.latitude));
    setLng(String(result.longitude));
    setAddressText(result.label);
    setActiveLocationTarget("pickup");
  }

  function applyFavoritePickupLocation(location: FavoriteLocation) {
    setLat(String(location.latitude));
    setLng(String(location.longitude));
    setAddressText(location.addressText);
    setActiveLocationTarget("pickup");
  }

  function applyDestinationLocation(result: GeocodingResult) {
    setDestinationLat(String(result.latitude));
    setDestinationLng(String(result.longitude));
    setDestinationAddress(result.label);
    setActiveLocationTarget("destination");
  }

  async function findPickupLocation() {
    try {
      setLocationSearchLoading("pickup");
      setError(null);
      const [result] = await searchPlaces(addressText, pickupCoordinate);
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
      const [result] = await searchPlaces(destinationAddress, pickupCoordinate);
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
    try {
      setFavoriteSaving(true);
      setError(null);
      const saved = await saveFavoriteLocation({
        addressText,
        latitude: pickupCoordinate.latitude,
        longitude: pickupCoordinate.longitude
      });
      setFavoriteLocations(saved);
    } catch (e: any) {
      setError(e?.message || "Failed to save favorite location");
    } finally {
      setFavoriteSaving(false);
    }
  }

  async function removeFavoritePickupLocation(id: string) {
    try {
      setError(null);
      const saved = await deleteFavoriteLocation(id);
      setFavoriteLocations(saved);
    } catch (e: any) {
      setError(e?.message || "Failed to remove favorite location");
    }
  }

  async function onSubmit() {
    if (!token || !vehicleId || !locationReady) return;
    try {
      setLoading(true);
      setError(null);
      await createRequest(token, {
        vehicleId,
        category: selectedService.category,
        issueType:
          selectedService.category === "mechanic"
            ? mechanicIssue
            : selectedService.unknownIssue
              ? null
              : selectedService.issueType,
        description: description.trim() ? description.trim() : null,
        pickupLocation: {
          lat: Number(lat),
          lng: Number(lng),
          addressText: addressText.trim() ? addressText.trim() : null
        },
        destinationLocation:
          selectedService.category === "car_towing"
            ? {
                lat: Number(destinationLat),
                lng: Number(destinationLng),
                addressText: destinationAddress.trim() ? destinationAddress.trim() : null
              }
            : null,
        distanceKm: selectedService.category === "car_towing" ? distanceNumber : null,
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
      });
      router.replace("/(app)/home");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
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

          <Section title="Our Services">
            <View style={styles.serviceGrid}>
              {serviceOptions.map((option) => (
                <ServiceCard
                  key={option.id}
                  item={option}
                  selected={option.id === selectedServiceId}
                  onPress={() => setSelectedServiceId(option.id)}
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
            <RATextInput icon="location" placeholder="Address" value={addressText} onChangeText={setAddressText} />
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
                <RATextInput icon="navigate" placeholder="Lat" keyboardType="numeric" value={lat} onChangeText={setLat} />
              </View>
              <View style={{ flex: 1 }}>
                <RATextInput icon="navigate" placeholder="Lng" keyboardType="numeric" value={lng} onChangeText={setLng} />
              </View>
            </View>
          </Section>

          <Section
            title="Service Map"
            action={<Text style={styles.mapAction}>{nearbyLoading ? "Searching" : `${nearbyProviders.length} available`}</Text>}
          >
            <LocationMapPicker
              pickup={pickupCoordinate}
              destination={selectedService.category === "car_towing" ? destinationCoordinate : pickupCoordinate}
              providers={providerPins}
              activeTarget={activeLocationTarget}
              onActiveTargetChange={setActiveLocationTarget}
              onPickupChange={updatePickupFromMap}
              onDestinationChange={selectedService.category === "car_towing" ? updateDestinationFromMap : updatePickupFromMap}
              singlePoint={selectedService.category !== "car_towing"}
              pointLabel={selectedService.category === "fuel_delivery" ? "Delivery location" : selectedService.category === "mechanic" ? "Service location" : "Pickup"}
              pickupLabel="Pickup"
              destinationLabel="Destination"
            />
            <View style={styles.mapSummary}>
              <Text style={styles.mapSummaryTitle}>
                {nearbyLoading
                  ? "Checking online providers..."
                  : nearbyProviders.length
                    ? `${nearbyProviders.length} provider${nearbyProviders.length === 1 ? "" : "s"} within ${nearbyRadiusKm} km`
                    : `No providers within ${nearbyRadiusKm} km`}
              </Text>
              <Text style={styles.mapSummaryText}>
                Blue is pickup, red is destination for towing, and green pins are verified available providers.
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
                    {provider.distanceKm} km away - {provider.etaMinutes} min ETA - {ratingText(provider)}
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
                  <Text style={styles.fareValue}>Rs. {estimate.total.toLocaleString()}</Text>
                </View>
                <View style={styles.fareMeta}>
                  <Text style={styles.fareMetaText}>{distanceNumber} km</Text>
                  <Text style={styles.fareMetaSub}>Rs. {TOWING_RATE_PER_KM}/km</Text>
                </View>
              </View>
              <View style={{ height: 10 }} />
              <RATextInput icon="flag" placeholder="Destination address" value={destinationAddress} onChangeText={setDestinationAddress} />
              <View style={{ height: 10 }} />
              <RAButton
                title={locationSearchLoading === "destination" ? "Finding destination..." : "Find Destination on Map"}
                disabled={Boolean(locationSearchLoading) || locationLoading}
                onPress={findDestinationLocation}
              />
              <View style={styles.coordinateRow}>
                <View style={{ flex: 1 }}>
                  <RATextInput icon="navigate" placeholder="Destination lat" keyboardType="numeric" value={destinationLat} onChangeText={setDestinationLat} />
                </View>
                <View style={{ flex: 1 }}>
                  <RATextInput icon="navigate" placeholder="Destination lng" keyboardType="numeric" value={destinationLng} onChangeText={setDestinationLng} />
                </View>
              </View>
              <Text style={styles.distanceNote}>
                {routeLoading
                  ? "Calculating road distance..."
                  : "Distance is calculated from the selected pickup and destination. If road routing is unavailable, the app falls back to straight-line distance."}
              </Text>
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

          <Section title="Problem Details">
            <RATextInput icon="chatbox-ellipses" placeholder="Short description (optional)" value={description} onChangeText={setDescription} />
          </Section>

          <View style={styles.reviewBox}>
            <Text style={styles.reviewTitle}>Service Summary</Text>
            <SummaryLine label="Service Type" value={selectedService.title} />
            <SummaryLine label="Vehicle" value={selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : "Not selected"} />
            <SummaryLine label="Location" value={addressText || `${lat}, ${lng}`} />
            {selectedService.category === "car_towing" ? <SummaryLine label="Destination" value={destinationAddress || `${destinationLat}, ${destinationLng}`} /> : null}
            {selectedService.category === "fuel_delivery" ? <SummaryLine label="Fuel" value={`${fuelType.toUpperCase()} - ${litersNumber}L`} /> : null}
            {selectedService.category === "mechanic" ? <SummaryLine label="Issue" value={mechanicIssues.find((item) => item.value === mechanicIssue)?.label || mechanicIssue} /> : null}
            {estimate.lines.map((line) => (
              <SummaryLine key={line.label} label={line.label} value={`Rs. ${line.amount.toLocaleString()}`} />
            ))}
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>Estimated Total</Text>
              <Text style={styles.estimateValue}>Rs. {estimate.total.toLocaleString()}</Text>
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
