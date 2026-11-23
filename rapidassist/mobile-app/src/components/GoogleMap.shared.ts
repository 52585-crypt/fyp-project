import type { Coordinate } from "../utils/distance";
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

export const BOOKING_MAP_CENTER: Coordinate = { latitude: 31.5204, longitude: 74.3587 };

export function selectedCoordinateText(coordinate: Coordinate | null) {
  return coordinate ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}` : "Not selected";
}
