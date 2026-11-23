import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getToken } from "../auth/auth.storage";
import { updateProviderLocation } from "../requests/requests.api";
import { tokens } from "../design/tokens";

const PROVIDER_LOCATION_TASK = "rapidassist-provider-location";

if (!TaskManager.isTaskDefined(PROVIDER_LOCATION_TASK)) {
  TaskManager.defineTask(PROVIDER_LOCATION_TASK, async ({ data, error }) => {
    if (error) { console.warn("Background location unavailable:", error.message); return; }
    if (!data) return;
    try {
      const locations = (data as { locations?: Location.LocationObject[] }).locations || [];
      const latest = locations.at(-1);
      const token = await getToken();
      if (!latest || !token) return;
      await updateProviderLocation(token, {
        lat: latest.coords.latitude,
        lng: latest.coords.longitude,
        addressText: "Provider live location",
        accuracy: latest.coords.accuracy,
        heading: latest.coords.heading,
        speed: latest.coords.speed,
        capturedAt: new Date(latest.timestamp).toISOString()
      });
    } catch (requestError: any) {
      // 409 means the server already has a newer foreground/background position.
      if (requestError?.response?.status !== 409) console.warn("Background location update failed:", requestError?.message);
    }
  });
}

export async function startProviderBackgroundLocation() {
  if (Platform.OS === "web") return false;
  if (await Location.hasStartedLocationUpdatesAsync(PROVIDER_LOCATION_TASK)) return true;

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) return false;

  await Location.startLocationUpdatesAsync(PROVIDER_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000,
    distanceInterval: 20,
    deferredUpdatesInterval: 15000,
    deferredUpdatesDistance: 20,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "RapidAssist active job",
      notificationBody: "Sharing your location with the assigned customer.",
      notificationColor: tokens.color.primary
    }
  });
  return true;
}

export async function stopProviderBackgroundLocation() {
  if (Platform.OS === "web") return;
  if (await Location.hasStartedLocationUpdatesAsync(PROVIDER_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(PROVIDER_LOCATION_TASK);
  }
}
