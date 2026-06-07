import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { LocationMapPicker, type LocationTarget } from "../../../src/components/LocationMapPicker";
import { createRequest, listNearbyProviders } from "../../../src/requests/requests.api";
import type { FuelType, MechanicIssueCategory, NearbyProvider, RequestCategory } from "../../../src/requests/requests.types";
import {
  deleteFavoriteLocation,
  getFavoriteLocations,
  saveFavoriteLocation,
  type FavoriteLocation
} from "../../../src/services/favoriteLocations.storage";
import { searchPlaces, type GeocodingResult } from "../../../src/services/geocoding";
import { getDrivingDistanceKm } from "../../../src/services/routing";
import { distanceKm, type Coordinate } from "../../../src/utils/distance";
import { AppShell, BottomNav, Card, Field, IconBox, PrimaryButton, SectionTitle, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const services: Array<{ label: string; value: RequestCategory; icon: "car" | "water" | "construct" }> = [
  { label: "Car Towing", value: "car_towing", icon: "car" },
  { label: "Fuel Delivery", value: "fuel_delivery", icon: "water" },
  { label: "Mechanic", value: "mechanic", icon: "construct" }
];

function normalizeCategoryParam(value: unknown): RequestCategory {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "fuel_delivery" || raw === "mechanic" || raw === "car_towing") return raw;
  return "car_towing";
}

const DEFAULT_PICKUP = { latitude: 31.5204, longitude: 74.3587 };
const DEFAULT_DESTINATION = { latitude: 31.4697, longitude: 74.2728 };
const TOWING_RATE_PER_KM = 180;

const mechanicIssues: Array<{ label: string; value: MechanicIssueCategory }> = [
  { label: "Battery", value: "battery" },
  { label: "Engine", value: "engine" },
  { label: "Tyre", value: "tyre" },
  { label: "Brake", value: "brake" },
  { label: "Overheating", value: "overheating" },
  { label: "Inspection", value: "general_inspection" }
];

function estimate(category: RequestCategory, liters: number, towingDistanceKm: number) {
  if (category === "car_towing") {
    const billedDistance = Math.max(1, towingDistanceKm);
    const total = 1200 + Math.round(billedDistance * TOWING_RATE_PER_KM) + 250;
    return {
      total,
      text: `${billedDistance} km at PKR ${TOWING_RATE_PER_KM}/km, base towing fee, and service fee.`
    };
  }
  if (category === "fuel_delivery") return { total: liters * 275 + 600, text: "Fuel amount, delivery fee, and service fee." };
  return { total: 1250, text: "Inspection fee and visit fee. Extra work needs approval." };
}

function parseCoordinate(lat: string, lng: string, fallback: Coordinate) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return fallback;
  return { latitude: parsedLat, longitude: parsedLng };
}

function formatDistanceKm(value: number) {
  return Number((value >= 10 ? Number(value.toFixed(0)) : Number(value.toFixed(1))).toFixed(1));
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

function coordinateLabel(prefix: string, coordinate: Coordinate) {
  return `${prefix}: ${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

export default function UserRequest() {
  const { token } = useAuth();
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState<RequestCategory>(() => normalizeCategoryParam(params.category));
  const [pickup, setPickup] = useState("Gulberg 3, Lahore");
  const [destination, setDestination] = useState("Johar Town, Lahore");
  const [pickupLat, setPickupLat] = useState("31.5204");
  const [pickupLng, setPickupLng] = useState("74.3587");
  const [destinationLat, setDestinationLat] = useState("31.4697");
  const [destinationLng, setDestinationLng] = useState("74.2728");
  const [activeLocationTarget, setActiveLocationTarget] = useState<LocationTarget>("pickup");
  const [vehicle, setVehicle] = useState("Honda Civic");
  const [registrationNumber, setRegistrationNumber] = useState("LEA 2244");
  const [fuelType, setFuelType] = useState<FuelType>("petrol");
  const [liters, setLiters] = useState("5");
  const [mechanicIssue, setMechanicIssue] = useState<MechanicIssueCategory>("battery");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState<"pickup" | "destination" | "current" | null>(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [favoriteLocations, setFavoriteLocations] = useState<FavoriteLocation[]>([]);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [nearbyProviders, setNearbyProviders] = useState<NearbyProvider[]>([]);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState(nearbyRadiusFor(category));
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const litersNumber = Math.max(1, Number(liters) || 1);
  const pickupCoordinate = useMemo(() => parseCoordinate(pickupLat, pickupLng, DEFAULT_PICKUP), [pickupLat, pickupLng]);
  const destinationCoordinate = useMemo(
    () => parseCoordinate(destinationLat, destinationLng, DEFAULT_DESTINATION),
    [destinationLat, destinationLng]
  );
  const straightLineDistanceKm = useMemo(
    () => formatDistanceKm(distanceKm(pickupCoordinate, destinationCoordinate)),
    [destinationCoordinate, pickupCoordinate]
  );
  const towingDistanceKm = routeDistanceKm ? formatDistanceKm(routeDistanceKm) : straightLineDistanceKm;
  const billedTowingDistanceKm = Math.max(1, towingDistanceKm);
  const currentEstimate = useMemo(
    () => estimate(category, litersNumber, billedTowingDistanceKm),
    [billedTowingDistanceKm, category, litersNumber]
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

  useEffect(() => {
    setCategory(normalizeCategoryParam(params.category));
  }, [params.category]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!token) return;
      try {
        const radiusKm = nearbyRadiusFor(category);
        setNearbyLoading(true);
        setNearbyError(null);
        const result = await listNearbyProviders(token, {
          category,
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
  }, [category, pickupCoordinate, token]);

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

  useEffect(() => {
    let cancelled = false;

    async function loadRouteDistance() {
      if (category !== "car_towing") {
        setRouteDistanceKm(null);
        return;
      }

      try {
        setRouteLoading(true);
        const km = await getDrivingDistanceKm(pickupCoordinate, destinationCoordinate);
        if (!cancelled) setRouteDistanceKm(km);
      } catch {
        if (!cancelled) setRouteDistanceKm(null);
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }

    loadRouteDistance();

    return () => {
      cancelled = true;
    };
  }, [category, destinationCoordinate, pickupCoordinate]);

  function updatePickupFromMap(coordinate: Coordinate) {
    setPickupLat(String(coordinate.latitude));
    setPickupLng(String(coordinate.longitude));
    setPickup(coordinateLabel("Pinned pickup", coordinate));
  }

  function updateDestinationFromMap(coordinate: Coordinate) {
    setDestinationLat(String(coordinate.latitude));
    setDestinationLng(String(coordinate.longitude));
    setDestination(coordinateLabel("Pinned destination", coordinate));
  }

  function applyPickupLocation(result: GeocodingResult) {
    setPickup(result.label);
    setPickupLat(String(result.latitude));
    setPickupLng(String(result.longitude));
    setActiveLocationTarget("pickup");
  }

  function applyFavoritePickupLocation(location: FavoriteLocation) {
    setPickup(location.addressText);
    setPickupLat(String(location.latitude));
    setPickupLng(String(location.longitude));
    setActiveLocationTarget("pickup");
  }

  function applyDestinationLocation(result: GeocodingResult) {
    setDestination(result.label);
    setDestinationLat(String(result.latitude));
    setDestinationLng(String(result.longitude));
    setActiveLocationTarget("destination");
  }

  async function findPickupLocation() {
    try {
      setLocationLoading("pickup");
      setError(null);
      const [result] = await searchPlaces(pickup, pickupCoordinate);
      if (!result) {
        setError("No pickup location found. Try a more specific address.");
        return;
      }
      applyPickupLocation(result);
    } catch (e: any) {
      setError(e?.message || "Failed to search pickup location");
    } finally {
      setLocationLoading(null);
    }
  }

  async function findDestinationLocation() {
    try {
      setLocationLoading("destination");
      setError(null);
      const [result] = await searchPlaces(destination, pickupCoordinate);
      if (!result) {
        setError("No destination found. Try a more specific address.");
        return;
      }
      applyDestinationLocation(result);
    } catch (e: any) {
      setError(e?.message || "Failed to search destination");
    } finally {
      setLocationLoading(null);
    }
  }

  async function useCurrentLocation() {
    try {
      setLocationLoading("current");
      setError(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location permission is required to use current pickup location.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coordinate = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      };
      setPickupLat(String(coordinate.latitude));
      setPickupLng(String(coordinate.longitude));
      setActiveLocationTarget("pickup");

      try {
        const [address] = await Location.reverseGeocodeAsync(coordinate);
        const readable = address
          ? [address.name, address.street, address.city, address.region].filter(Boolean).join(", ")
          : "";
        setPickup(readable || "Current location");
      } catch {
        setPickup("Current location");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to fetch current location");
    } finally {
      setLocationLoading(null);
    }
  }

  async function saveCurrentPickupAsFavorite() {
    try {
      setFavoriteSaving(true);
      setError(null);
      const saved = await saveFavoriteLocation({
        addressText: pickup,
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
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      await createRequest(token, {
        category,
        vehicleInfo: {
          type: "car",
          model: vehicle,
          registrationNumber
        },
        pickupLocation: {
          lat: pickupCoordinate.latitude,
          lng: pickupCoordinate.longitude,
          addressText: pickup
        },
        destinationLocation:
          category === "car_towing"
            ? {
                lat: destinationCoordinate.latitude,
                lng: destinationCoordinate.longitude,
                addressText: destination
              }
            : null,
        distanceKm: category === "car_towing" ? billedTowingDistanceKm : null,
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
      });
      router.push("/(user)/tracking");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to create request");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Create Request" subtitle="Choose one of the three RapidAssist services.">
        <SectionTitle title="Select service" />
        <View style={styles.serviceGrid}>
          {services.map((item) => {
            const active = category === item.value;
            return (
              <Pressable key={item.value} onPress={() => setCategory(item.value)} style={[styles.service, active ? styles.serviceActive : null]}>
                <IconBox icon={item.icon} tone={active ? "primary" : "dark"} />
                <Text style={[styles.serviceText, active ? styles.serviceTextActive : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle title="Vehicle and pickup" />
        <Card style={styles.form}>
          <Field label="Pickup location" icon="locate" value={pickup} onChangeText={setPickup} />
          <View style={styles.locationActions}>
            <PrimaryButton
              title={locationLoading === "pickup" ? "Finding..." : "Find Pickup"}
              icon="search"
              variant="outline"
              disabled={Boolean(locationLoading)}
              style={{ flex: 1 }}
              onPress={findPickupLocation}
            />
            <PrimaryButton
              title={locationLoading === "current" ? "Locating..." : "Current"}
              icon="navigate"
              variant="outline"
              disabled={Boolean(locationLoading)}
              style={{ flex: 1 }}
              onPress={useCurrentLocation}
            />
          </View>
          <View style={styles.favoriteBlock}>
            <View style={styles.favoriteHeader}>
              <Text style={styles.favoriteTitle}>Saved locations</Text>
              <PrimaryButton
                title={favoriteSaving ? "Saving..." : "Save Pickup"}
                icon="bookmark"
                variant="outline"
                disabled={favoriteSaving}
                style={styles.favoriteSaveButton}
                onPress={saveCurrentPickupAsFavorite}
              />
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
                      <Ionicons name="close" size={15} color={ui.colors.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.favoriteEmpty}>Save frequent pickup or service points here.</Text>
            )}
          </View>
          <Field label="Vehicle model" icon="car" value={vehicle} onChangeText={setVehicle} />
          <Field label="Registration number" icon="reader" value={registrationNumber} onChangeText={setRegistrationNumber} />
        </Card>

        <SectionTitle
          title="Service map"
          action={nearbyLoading ? "Searching" : `${nearbyProviders.length} available`}
        />
        <Card style={styles.nearbyCard}>
          <LocationMapPicker
            pickup={pickupCoordinate}
            destination={category === "car_towing" ? destinationCoordinate : pickupCoordinate}
            providers={providerPins}
            activeTarget={activeLocationTarget}
            onActiveTargetChange={setActiveLocationTarget}
            onPickupChange={updatePickupFromMap}
            onDestinationChange={category === "car_towing" ? updateDestinationFromMap : updatePickupFromMap}
            singlePoint={category !== "car_towing"}
            pointLabel={category === "fuel_delivery" ? "Delivery location" : category === "mechanic" ? "Service location" : "Pickup"}
            pickupLabel="Pickup"
            destinationLabel="Destination"
          />
          <View style={styles.nearbySummary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nearbyTitle}>
                {nearbyLoading
                  ? "Checking online providers..."
                  : nearbyProviders.length
                    ? `${nearbyProviders.length} provider${nearbyProviders.length === 1 ? "" : "s"} within ${nearbyRadiusKm} km`
                    : `No providers within ${nearbyRadiusKm} km`}
              </Text>
              <Text style={styles.nearbyText}>
                This map shows your service location and verified online providers matching this service.
              </Text>
            </View>
            <StatusPill label={nearbyProviders.length ? "Live" : "Waiting"} tone={nearbyProviders.length ? "success" : "warning"} />
          </View>
          {nearbyProviders.slice(0, 3).map((provider) => (
            <View key={provider.id} style={styles.providerRow}>
              <IconBox icon={category === "mechanic" ? "construct" : category === "fuel_delivery" ? "water" : "car"} tone="success" />
              <View style={{ flex: 1 }}>
                <Text style={styles.providerName}>{provider.name}</Text>
                <Text style={styles.providerMeta}>
                  {provider.distanceKm} km away - {provider.etaMinutes} min ETA - {ratingText(provider)}
                </Text>
                <Text style={styles.providerMeta}>{provider.completedJobs} completed jobs</Text>
              </View>
            </View>
          ))}
          {nearbyError ? <Text style={styles.error}>{nearbyError}</Text> : null}
        </Card>

        {category === "car_towing" ? (
          <>
            <SectionTitle title="Towing details" />
            <Card style={styles.form}>
              <View style={styles.fareCard}>
                <View>
                  <Text style={styles.fareLabel}>Estimated Fare</Text>
                  <Text style={styles.fareValue}>PKR {currentEstimate.total.toLocaleString()}</Text>
                </View>
                <View style={styles.fareMeta}>
                  <Text style={styles.fareMetaText}>{billedTowingDistanceKm} km</Text>
                  <Text style={styles.fareMetaSub}>PKR {TOWING_RATE_PER_KM}/km</Text>
                </View>
              </View>
              <Field label="Destination" icon="flag" value={destination} onChangeText={setDestination} />
              <PrimaryButton
                title={locationLoading === "destination" ? "Finding destination..." : "Find Destination"}
                icon="search"
                variant="outline"
                disabled={Boolean(locationLoading)}
                onPress={findDestinationLocation}
              />
              <View style={styles.coordinateRow}>
                <View style={{ flex: 1 }}>
                  <Field label="Pickup lat" icon="navigate" keyboardType="numeric" value={pickupLat} onChangeText={setPickupLat} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Pickup lng" icon="navigate" keyboardType="numeric" value={pickupLng} onChangeText={setPickupLng} />
                </View>
              </View>
              <View style={styles.coordinateRow}>
                <View style={{ flex: 1 }}>
                  <Field label="Drop lat" icon="navigate" keyboardType="numeric" value={destinationLat} onChangeText={setDestinationLat} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Drop lng" icon="navigate" keyboardType="numeric" value={destinationLng} onChangeText={setDestinationLng} />
                </View>
              </View>
              <Text style={styles.distanceNote}>
                {routeLoading
                  ? "Calculating road distance..."
                  : routeDistanceKm
                    ? "Price uses road distance. Tap pickup or destination, then tap the map to adjust the pin."
                    : "Road distance unavailable, using straight-line distance. Tap pickup or destination, then tap the map to adjust the pin."}
              </Text>
              <Field label="Breakdown reason" icon="alert-circle" placeholder="Accident, breakdown, stuck..." value={description} onChangeText={setDescription} />
            </Card>
          </>
        ) : null}

        {category === "fuel_delivery" ? (
          <>
            <SectionTitle title="Fuel details" />
            <Card style={styles.form}>
              <View style={styles.segment}>
                {(["petrol", "diesel"] as FuelType[]).map((item) => (
                  <Pressable key={item} onPress={() => setFuelType(item)} style={[styles.segmentItem, fuelType === item ? styles.segmentItemActive : null]}>
                    <Text style={[styles.segmentText, fuelType === item ? styles.segmentTextActive : null]}>{item.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Quantity in liters" icon="water" keyboardType="numeric" value={liters} onChangeText={setLiters} />
              <Field label="Notes" icon="alert-circle" placeholder="Car is parked near main gate..." value={description} onChangeText={setDescription} />
            </Card>
          </>
        ) : null}

        {category === "mechanic" ? (
          <>
            <SectionTitle title="Mechanic issue" />
            <View style={styles.issueGrid}>
              {mechanicIssues.map((item) => {
                const active = mechanicIssue === item.value;
                return (
                  <Pressable key={item.value} onPress={() => setMechanicIssue(item.value)} style={[styles.issue, active ? styles.issueActive : null]}>
                    <Text style={[styles.issueText, active ? styles.issueTextActive : null]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Card style={styles.form}>
              <Field label="Issue description" icon="construct" placeholder="Describe what happened" value={description} onChangeText={setDescription} />
            </Card>
          </>
        ) : null}

        <SectionTitle title="Estimate" />
        <Card style={styles.estimate}>
          <View style={styles.estimateRow}>
            <IconBox icon="receipt" />
            <View style={{ flex: 1 }}>
              <Text style={styles.estimateTitle}>PKR {currentEstimate.total.toLocaleString()}</Text>
              <Text style={styles.estimateText}>{currentEstimate.text}</Text>
            </View>
            <StatusPill label="Cash" tone="warning" />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton title={loading ? "Creating..." : "Confirm and Find Provider"} icon="search" disabled={loading} onPress={onSubmit} />
        </Card>
      </AppShell>
      <BottomNav role="user" active="Request" />
    </View>
  );
}

const styles = StyleSheet.create({
  serviceGrid: { flexDirection: "row", gap: 10 },
  service: { flex: 1, minHeight: 112, borderRadius: 18, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, alignItems: "center", justifyContent: "center", gap: 10, padding: 8 },
  serviceActive: { borderColor: ui.colors.primary, backgroundColor: ui.colors.primarySoft },
  serviceText: { color: ui.colors.text, fontSize: 12, fontWeight: "900", textAlign: "center" },
  serviceTextActive: { color: ui.colors.primaryDark },
  form: { gap: 12 },
  locationActions: { flexDirection: "row", gap: 10 },
  favoriteBlock: { gap: 8 },
  favoriteHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  favoriteTitle: { color: ui.colors.text, fontSize: 12, fontWeight: "900" },
  favoriteSaveButton: { minHeight: 38, paddingHorizontal: 12 },
  favoriteList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  favoriteChip: {
    maxWidth: "100%",
    minHeight: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.bg,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden"
  },
  favoriteApply: { maxWidth: 210, minHeight: 38, justifyContent: "center", paddingLeft: 12, paddingRight: 8 },
  favoriteText: { color: ui.colors.text, fontSize: 12, fontWeight: "900" },
  favoriteDelete: { width: 34, height: 38, alignItems: "center", justifyContent: "center" },
  favoriteEmpty: { color: ui.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  coordinateRow: { flexDirection: "row", gap: 10 },
  fareCard: {
    minHeight: 86,
    borderRadius: 16,
    backgroundColor: ui.colors.primary,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  fareLabel: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "800" },
  fareValue: { marginTop: 4, color: "white", fontSize: 23, fontWeight: "900" },
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
  distanceNote: { color: ui.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  segment: { height: 48, borderRadius: 14, backgroundColor: ui.colors.bg, borderWidth: 1, borderColor: ui.colors.border, flexDirection: "row", padding: 4 },
  segmentItem: { flex: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  segmentItemActive: { backgroundColor: ui.colors.primary },
  segmentText: { color: ui.colors.muted, fontSize: 12, fontWeight: "900" },
  segmentTextActive: { color: "white" },
  nearbyCard: { gap: 12 },
  nearbySummary: { flexDirection: "row", alignItems: "center", gap: 12 },
  nearbyTitle: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  nearbyText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  providerRow: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surfaceAlt,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  providerName: { color: ui.colors.text, fontSize: 14, fontWeight: "900" },
  providerMeta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  issueGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  issue: { width: "31.8%", height: 46, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, alignItems: "center", justifyContent: "center" },
  issueActive: { backgroundColor: ui.colors.primary, borderColor: ui.colors.primary },
  issueText: { color: ui.colors.text, fontSize: 11, fontWeight: "900" },
  issueTextActive: { color: "white" },
  estimate: { gap: 14 },
  estimateRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  estimateTitle: { color: ui.colors.text, fontSize: 19, fontWeight: "900" },
  estimateText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});
