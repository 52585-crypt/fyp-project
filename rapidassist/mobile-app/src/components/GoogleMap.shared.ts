import type { Coordinate } from "../utils/distance";
import { DEFAULT_CENTER } from "../config/serviceArea";
import type { LocationTarget } from "./LocationMapPicker.shared";

export type MapProvider = { id: string; name: string; distanceKm?: number | null; location: Coordinate };
export type PickerProps = {
  pickup: Coordinate | null; destination: Coordinate | null; route?: Coordinate[]; providers?: MapProvider[];
  activeTarget: LocationTarget; onActiveTargetChange: (target: LocationTarget) => void;
  onPickupChange: (coordinate: Coordinate) => void; onDestinationChange: (coordinate: Coordinate) => void;
  singlePoint?: boolean; pointLabel?: string; pickupLabel?: string; destinationLabel?: string;
  requiresGoogleMap?: boolean;
  selectedProviderId?: string | null;
  onProviderPress?: (providerId: string) => void;
  onCoordinateError?: (message: string) => void;
  currentLocation?: Coordinate | null;
  cameraFocus?: { coordinate: Coordinate; requestId: number } | null;
  onRequestCurrentLocation?: () => Promise<Coordinate | null>;
  mapHeight?: number;
};
export type GoogleMapProps = {
  pickup: Coordinate | null; destination?: Coordinate | null; route?: Coordinate[]; providers?: MapProvider[];
  pickupLabel?: string; destinationLabel?: string; onPress?: (coordinate: Coordinate) => void;
  currentLocation?: Coordinate | null;
  cameraFocus?: { coordinate: Coordinate; requestId: number } | null;
};

// Twin-cities fallback when the user's real location is unknown.
export const BOOKING_MAP_CENTER: Coordinate = { latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude };

export function selectedCoordinateText(coordinate: Coordinate | null) {
  return coordinate ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}` : "Not selected";
}
