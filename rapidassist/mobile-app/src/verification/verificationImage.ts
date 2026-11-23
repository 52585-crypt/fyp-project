import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

const maxBytes = 4 * 1024 * 1024;
const maxPixels = 16_000_000;

export async function selectVerificationImage(source: "camera" | "library", kind: "profile" | "cnic") {
  if (source === "camera" && Platform.OS !== "web") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Allow camera access in Settings or choose an existing photo.");
  }

  // Keep the web picker directly within the button event for browser user activation.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    base64: true,
    quality: 0.8,
    exif: false
  };
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({
        ...options,
        cameraType: kind === "profile" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back
      })
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;

  const asset = result.assets[0];
  const base64 = asset?.base64;
  // Expo may encode the selected bytes as JPEG even when the original MIME type differs.
  const mime = base64?.startsWith("/9j/") ? "image/jpeg" : base64?.startsWith("iVBORw0KGgo") ? "image/png" : null;
  if (!base64 || !mime) throw new Error("Choose a JPEG or PNG photo.");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  if (Math.floor(base64.length * 3 / 4) - padding > maxBytes) {
    throw new Error("This photo exceeds 4 MB. Choose a smaller image or retake it.");
  }
  if (asset.width && asset.height && (asset.width < 80 || asset.height < 80 || asset.width * asset.height > maxPixels)) {
    throw new Error("Choose a photo at least 80 × 80 pixels and no more than 16 megapixels.");
  }
  return `data:${mime};base64,${base64}`;
}
