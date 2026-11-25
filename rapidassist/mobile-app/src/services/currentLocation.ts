import * as Location from "expo-location";
import { isValidCoordinates, type Coordinate } from "../utils/distance";

export const CURRENT_LOCATION_TIMEOUT_MS = 15_000;
export const MAX_CURRENT_LOCATION_ACCURACY_METERS = 2_000;
/** A fix worse than this (coarse/"approximate" permission, Wi-Fi or IP location) is shown as approximate. */
export const APPROXIMATE_ACCURACY_METERS = 100;

export function isApproximateFix(accuracyMeters: number | null | undefined) {
  return accuracyMeters != null && Number.isFinite(accuracyMeters) && accuracyMeters > APPROXIMATE_ACCURACY_METERS;
}

type PermissionResult = {
  granted: boolean;
  canAskAgain?: boolean;
};

type CurrentPosition = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  };
};

export type ForegroundLocationApi = {
  getForegroundPermissionsAsync: () => Promise<PermissionResult>;
  requestForegroundPermissionsAsync: () => Promise<PermissionResult>;
  hasServicesEnabledAsync: () => Promise<boolean>;
  getCurrentPositionAsync: (options: {
    accuracy: Location.Accuracy;
    mayShowUserSettingsDialog: boolean;
    maximumAge?: number;
    timeout?: number;
  }) => Promise<CurrentPosition>;
};

export type CurrentLocationResult = {
  coordinate: Coordinate;
  accuracyMeters: number | null;
};

function locationError(error: unknown) {
  const value = error as { code?: number | string; message?: string } | null;
  const message = value?.message?.toLowerCase() || "";

  if (value?.code === 1 || message.includes("denied") || message.includes("permission")) {
    return new Error("Location permission was denied. Allow location access in your device or browser settings and try again.");
  }
  if (value?.code === 3 || message.includes("timeout") || message.includes("timed out")) {
    return new Error("The location request timed out. Move to an open area, check GPS, and try again.");
  }
  if (value?.code === 2 || message.includes("unavailable") || message.includes("provider")) {
    return new Error("Your current location is unavailable. Check GPS or browser location support and try again.");
  }
  return new Error(value?.message || "Unable to retrieve your current location.");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("The location request timed out. Move to an open area, check GPS, and try again.")),
      timeoutMs
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export async function getCurrentForegroundLocation(
  api: ForegroundLocationApi = Location,
  timeoutMs = CURRENT_LOCATION_TIMEOUT_MS
): Promise<CurrentLocationResult> {
  let permission: PermissionResult;
  try {
    permission = await api.getForegroundPermissionsAsync();
    if (!permission.granted) {
      if (permission.canAskAgain === false) {
        throw new Error("Location permission was denied. Enable it in your device or browser settings and try again.");
      }
      permission = await api.requestForegroundPermissionsAsync();
    }
  } catch (error) {
    throw locationError(error);
  }

  if (!permission.granted) {
    throw new Error("Location permission was denied. Allow location access in your device or browser settings and try again.");
  }

  let servicesEnabled: boolean;
  try {
    servicesEnabled = await api.hasServicesEnabledAsync();
  } catch (error) {
    throw locationError(error);
  }
  if (!servicesEnabled) {
    throw new Error("Location services are disabled or unavailable. Turn on device GPS or enable browser location support and try again.");
  }

  let position: CurrentPosition;
  try {
    position = await withTimeout(
      api.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
        // Expo Location forwards these standard PositionOptions on Web. This
        // prevents its Web default (`maximumAge: Infinity`) from returning an
        // arbitrarily old cached browser position.
        maximumAge: 0,
        timeout: timeoutMs
      }),
      timeoutMs
    );
  } catch (error) {
    throw locationError(error);
  }

  const coordinate = {
    latitude: position?.coords?.latitude,
    longitude: position?.coords?.longitude
  };
  if (!isValidCoordinates(coordinate)) {
    throw new Error("The location service returned invalid coordinates. Check GPS and try again.");
  }

  const accuracy = position.coords.accuracy;
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) {
    throw new Error("The location service returned invalid GPS accuracy. Check GPS and try again.");
  }
  if (accuracy != null && accuracy > MAX_CURRENT_LOCATION_ACCURACY_METERS) {
    throw new Error(
      `Your location is too imprecise (about ${Math.round(accuracy)} m). Enable precise location, move to an open area, and try again.`
    );
  }

  return { coordinate, accuracyMeters: accuracy };
}

/**
 * A current position for provider location sharing.
 * - maximumAge: 0, because expo-location's web default (Infinity) returns the browser's cached position forever.
 * - Some platforms answer a fresh request for an unchanged position with the original fix timestamp
 *   (stationary desktop/phone location services, emulated geolocation). Since we asked for a current reading,
 *   the position is confirmed current as of the request, so the reported time is never earlier than that.
 *   Without this, a parked provider's fix never "advances", the server treats every update as a duplicate,
 *   and dispatch drops the provider after 180 s while the app still shows Online.
 */
export async function getFreshPosition(accuracy: Location.Accuracy) {
  const requestedAt = Date.now();
  const position = await Location.getCurrentPositionAsync({ accuracy, maximumAge: 0 } as Location.LocationOptions);
  return { ...position, timestamp: Math.max(position.timestamp, requestedAt) };
}
