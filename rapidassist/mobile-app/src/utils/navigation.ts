import { Linking, Platform } from "react-native";
import type { RequestLocation } from "../requests/requests.types";
import { hasOperationalCoordinates } from "../services/locationMapPolicy";
import { t } from "../i18n/translate";

export function canNavigateTo(location?: RequestLocation | null) {
  return hasOperationalCoordinates(location);
}

export type NavigationLinks = {
  /** Native turn-by-turn deep link (Android: Google Maps navigation; iOS: Apple Maps), or null on web. */
  app: string | null;
  /** Google Maps directions in a browser or the Maps app; always works as the fallback. */
  web: string;
};

/** Driving-directions links to a location for the given platform. Coordinates only, never the address text. */
export function navigationLinks(location: { lat: number; lng: number }, platform: string = Platform.OS): NavigationLinks {
  const destination = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
  const web = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  if (platform === "android") return { app: `google.navigation:q=${destination}&mode=d`, web };
  if (platform === "ios") return { app: `http://maps.apple.com/?daddr=${destination}&dirflg=d`, web };
  return { app: null, web };
}

/**
 * Opens driving directions: the native navigation deep link first, then the Google Maps web URL when no app
 * handles it. openURL is tried directly (not canOpenURL), because Android 11+ reports undeclared schemes as
 * unsupported even when Google Maps is installed.
 */
export async function openExternalNavigation(location: RequestLocation, opener: Pick<typeof Linking, "openURL"> = Linking, platform: string = Platform.OS) {
  if (!hasOperationalCoordinates(location)) throw new Error("This location is unavailable. Refresh it and try again.");
  const links = navigationLinks(location, platform);
  if (links.app) {
    try {
      await opener.openURL(links.app);
      return links.app;
    } catch {
      // No app for the deep link: fall through to the web URL.
    }
  }
  try {
    await opener.openURL(links.web);
    return links.web;
  } catch {
    throw new Error(t("providerNav", "noMapsApp"));
  }
}
