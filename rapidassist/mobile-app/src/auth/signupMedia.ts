import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Platform } from "react-native";
import type { LiveLocation } from "./signupSteps";

function toDataUri(asset: ImagePicker.ImagePickerAsset) {
  if (!asset.base64) throw new Error("Image conversion failed. Please retake the photo.");
  return `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
}

/** Returns a data URI, null if the user cancelled, or throws a user-facing message. */
export async function captureDocumentPhoto(): Promise<string | null> {
  if (Platform.OS !== "web") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Camera permission is required. Allow camera access and try again.");
  }
  try {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [4, 3], quality: 0.2, base64: true, mediaTypes: ["images"], cameraType: ImagePicker.CameraType.back
    });
    return !result.canceled && result.assets?.[0]?.uri ? toDataUri(result.assets[0]) : null;
  } catch (e: any) {
    throw new Error(e?.message || "Camera is not available on this device. Try the gallery option.");
  }
}

export async function pickDocumentPhoto(): Promise<string | null> {
  if (Platform.OS !== "web") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error("Photo library permission is required");
  }
  try {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.2, base64: true, mediaTypes: ["images"] });
    return !result.canceled && result.assets?.[0]?.uri ? toDataUri(result.assets[0]) : null;
  } catch (e: any) {
    throw new Error(e?.message || "Unable to open your photo library. Please try again.");
  }
}

export async function captureLiveLocation(): Promise<LiveLocation> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error("Location permission is required");
  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  let addressText: string | null = null;
  try {
    const [address] = await Location.reverseGeocodeAsync({ latitude: current.coords.latitude, longitude: current.coords.longitude });
    if (address) addressText = [address.name, address.street, address.city, address.region].filter(Boolean).join(", ") || null;
  } catch {
    addressText = null;
  }
  return { lat: current.coords.latitude, lng: current.coords.longitude, addressText };
}
