import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { successFeedback } from "../../design/haptics";
import { customerRoutes } from "../../navigation/routes";
import { getCurrentForegroundLocation } from "../../services/currentLocation";
import { readableAddress } from "../../services/reverseGeocode";
import { manualMapLocation, normalizeLocation, selectedRequestLocations, type NormalizedLocation } from "../../services/normalizedLocation";
import { useFavoriteLocations } from "../../services/useFavoriteLocations";
import { coordinatesFromUnknown, type Coordinate } from "../../utils/distance";
import { listMyVehicles } from "../../vehicles/vehicles.api";
import type { Vehicle } from "../../vehicles/vehicles.types";
import { buildEstimate } from "../requestEstimate";
import { createRequest, listNearbyProviders } from "../requests.api";
import type { FuelType, MechanicIssueCategory, RequestCategory, RequestPriority } from "../requests.types";
import { useBookingRoute } from "../useBookingRoute";

const label = (prefix: string, c: Coordinate) => `${prefix}: ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`;
const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/** Draft for a new request, shared by the form and estimate screens (see BookingProvider). */
export function useBookingState() {
  const { token } = useAuth();
  const [category, setCategory] = useState<RequestCategory>("car_towing");
  const [pickup, setPickup] = useState<NormalizedLocation | null>(null);
  const [destination, setDestination] = useState<NormalizedLocation | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const manualVehicle = useRef(false);
  const [vehicleType, setVehicleType] = useState<string>("car");
  const [vehicleModel, setVehicleModel] = useState("");
  const [plate, setPlate] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [fuelType, setFuelType] = useState<FuelType>("petrol");
  const [liters, setLiters] = useState("5");
  const [mechanicIssue, setMechanicIssue] = useState<MechanicIssueCategory>("general_inspection");
  const [priority, setPriority] = useState<RequestPriority>("normal");
  const [description, setDescription] = useState("");
  const [locating, setLocating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [cameraFocus, setCameraFocus] = useState<{ coordinate: Coordinate; requestId: number } | null>(null);
  const [nearby, setNearby] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set when the server refuses a booking because this customer already has an open request (409).
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const submission = useRef<{ fingerprint: string; id: string } | null>(null);
  const favorites = useFavoriteLocations(setError);

  const litersNumber = Math.min(50, Math.max(1, Number(liters) || 1));
  const towing = category === "car_towing";
  const route = useBookingRoute(pickup, towing ? destination : null);
  const estimate = buildEstimate(category, route.route?.distanceKm ?? null, fuelType, litersNumber);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const waitingForRoute = towing && Boolean(pickup && destination) && (route.loading || !route.route);

  useFocusEffect(useCallback(() => {
    if (!token) return;
    let active = true;
    listMyVehicles(token).then((items) => {
      if (!active) return;
      setVehicles(items);
      setVehicleId((prev) => manualVehicle.current ? null : items.find((v) => v.id === prev)?.id ?? items[0]?.id ?? null);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [token]));

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!token || !pickup) return setNearby(null);
      try {
        const result = await listNearbyProviders(token, { category, lat: pickup.latitude, lng: pickup.longitude });
        if (!cancelled) setNearby(result.providers.length);
      } catch { if (!cancelled) setNearby(null); }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [category, pickup, token]);

  function chooseVehicle(id: string | null) { manualVehicle.current = !id; setVehicleId(id); }

  function setFromMap(target: "pickup" | "destination", value: unknown) {
    const c = coordinatesFromUnknown(value);
    if (!c) return setError("The map returned invalid coordinates. Your location was not changed.");
    setCameraFocus(null);
    const loc = manualMapLocation(c, label(target === "pickup" ? "Selected location" : "Selected drop-off", c));
    if (loc) (target === "pickup" ? setPickup : setDestination)(loc);
    setError(null);
  }

  /** Pin screen: the map centre is now this target's location. The street address resolves in the background. */
  function pinLocation(target: "pickup" | "destination", coordinate: Coordinate) {
    const loc = manualMapLocation(coordinate, target === "pickup" ? "Pinned pickup" : "Pinned drop-off");
    if (!loc) return setError("The map returned invalid coordinates. Your location was not changed.");
    const set = target === "pickup" ? setPickup : setDestination;
    set(loc);
    setError(null);
    void readableAddress(coordinate).then((text) => {
      if (text) set((v) => v && v.latitude === loc.latitude && v.longitude === loc.longitude ? { ...v, address: text } : v);
    });
  }

  /** Moves the booking map camera to a point (search result, step change). */
  function focusOn(coordinate: Coordinate) {
    setCameraFocus((v) => ({ coordinate, requestId: (v?.requestId || 0) + 1 }));
  }

  async function recenter() {
    try {
      const { coordinate } = await getCurrentForegroundLocation();
      setCurrentLocation(coordinate);
      setCameraFocus((v) => ({ coordinate, requestId: (v?.requestId || 0) + 1 }));
      return coordinate;
    } catch (e) { setError(message(e, "Failed to fetch current location")); return null; }
  }

  /** GPS pickup with reverse-geocoded address (ignored if the user picked another spot meanwhile). */
  async function useCurrentLocation() {
    setLocating(true);
    setError(null);
    try {
      const coordinate = await recenter();
      if (!coordinate) return;
      const loc = normalizeLocation({ ...coordinate, source: "gps" });
      setPickup({ ...loc, address: "Locating address…" });
      const same = (v: NormalizedLocation | null) => v?.source === "gps" && v.latitude === loc.latitude && v.longitude === loc.longitude;
      const readable = await readableAddress(loc);
      setPickup((v) => same(v) ? { ...v!, address: readable || "Current location" } : v);
    } finally { setLocating(false); }
  }

  /** Validates what the estimate screen needs. Returns an error message or null. */
  function validate(): string | null {
    if (!selectedRequestLocations(category, pickup, destination)) {
      return pickup ? "Choose a towing destination." : "Choose the service location on the map or use your current GPS location.";
    }
    if (!selectedVehicle && !vehicleModel.trim() && category !== "fuel_delivery") return "Enter your vehicle model or pick a saved vehicle.";
    return null;
  }

  async function submit() {
    if (!token || submitting) return;
    const locations = selectedRequestLocations(category, pickup, destination);
    if (!locations) return setError(validate());
    if (towing && (!route.route || route.loading)) return setError("A valid road route is required before requesting a tow.");
    setSubmitting(true);
    setError(null);
    setActiveRequestId(null);
    try {
      const input = {
        category, priority, ...locations, description,
        ...(selectedVehicle ? { vehicleId: selectedVehicle.id } : {
          vehicleInfo: { type: vehicleType, model: vehicleModel.trim(), registrationNumber: plate.trim() }
        }),
        issueType: category === "mechanic" ? mechanicIssue : problem,
        fuelDetails: category === "fuel_delivery" ? { fuelType, liters: litersNumber } : undefined,
        mechanicDetails: category === "mechanic" ? { issueCategory: mechanicIssue } : undefined
      };
      const fingerprint = JSON.stringify(input);
      if (submission.current?.fingerprint !== fingerprint) {
        submission.current = { fingerprint, id: `dispatch-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      }
      const request = await createRequest(token, { ...input, clientRequestId: submission.current.id });
      successFeedback();
      router.replace(customerRoutes.request(request.id));
    } catch (e: any) {
      const data = e?.response?.data;
      if (e?.response?.status === 409 && data?.code === "ACTIVE_REQUEST_EXISTS" && typeof data.requestId === "string") {
        setActiveRequestId(data.requestId);
        setError("You already have an active request. Open it to track it, or cancel it before booking another service.");
      } else {
        setError(message(e, "Failed to create request"));
      }
    } finally { setSubmitting(false); }
  }

  return {
    token, category, setCategory, pickup, setPickup, destination, setDestination, towing,
    vehicles, vehicleId, chooseVehicle, selectedVehicle, vehicleType, setVehicleType, vehicleModel, setVehicleModel, plate, setPlate,
    problem, setProblem, fuelType, setFuelType, liters, setLiters, litersNumber, mechanicIssue, setMechanicIssue,
    priority, setPriority, description, setDescription, locating, currentLocation, cameraFocus, nearby,
    error, setError, submitting, activeRequestId, favorites, route, estimate, waitingForRoute,
    setFromMap, pinLocation, focusOn, recenter, useCurrentLocation, validate, submit
  };
}

export type BookingState = ReturnType<typeof useBookingState>;
