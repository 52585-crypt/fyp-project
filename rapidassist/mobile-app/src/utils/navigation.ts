import { Linking, Platform } from "react-native";
import type { RequestLocation } from "../requests/requests.types";
import { hasOperationalCoordinates } from "../services/locationMapPolicy";

export function canNavigateTo(location?: RequestLocation | null) {
  return hasOperationalCoordinates(location);
}

export async function openExternalNavigation(location: RequestLocation, label = "Destination") {
  if (!hasOperationalCoordinates(location)) throw new Error("This location is unavailable. Refresh it and try again.");
  const destination = `${location.lat},${location.lng}`;
  const encodedLabel = encodeURIComponent(location.addressText || label);
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${destination}&q=${encodedLabel}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;

  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error("No maps app is available on this device.");
  }

  await Linking.openURL(url);
}
