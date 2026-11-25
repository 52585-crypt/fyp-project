import { useEffect, useState } from "react";
import { hasOperationalCoordinates } from "../services/locationMapPolicy";
import { getDrivingRouteMetrics } from "../services/routing";
import type { Coordinate } from "../utils/distance";
import type { ServiceRequest } from "./requests.types";

const EMPTY: Coordinate[] = [];

/**
 * The planned tow trip (pickup → drop-off road route and its length) for a towing request once the vehicle is
 * loaded. Fetched once per pickup/drop-off pair; empty for other categories or when OSRM is unavailable.
 */
export function useTowTrip(request: ServiceRequest | null) {
  const loaded = request?.category === "car_towing" && ["vehicle_loaded", "reached_destination"].includes(request.status);
  const from = loaded && hasOperationalCoordinates(request?.pickupLocation) ? request!.pickupLocation : null;
  const to = loaded && hasOperationalCoordinates(request?.destinationLocation) ? request!.destinationLocation : null;
  const key = from && to ? `${from.lat},${from.lng};${to.lat},${to.lng}` : "";
  const [trip, setTrip] = useState<{ key: string; route: Coordinate[]; km: number | null }>({ key: "", route: EMPTY, km: null });

  useEffect(() => {
    if (!key || !from || !to) return;
    let active = true;
    getDrivingRouteMetrics({ latitude: from.lat, longitude: from.lng }, { latitude: to.lat, longitude: to.lng })
      .then((m) => { if (active) setTrip({ key, route: m.coordinates, km: m.distanceKm }); })
      .catch(() => { if (active) setTrip({ key, route: EMPTY, km: null }); });
    return () => { active = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return trip.key === key && key ? { route: trip.route, km: trip.km } : { route: EMPTY, km: null };
}
