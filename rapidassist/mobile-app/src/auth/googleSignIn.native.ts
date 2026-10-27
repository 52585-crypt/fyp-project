import Constants from "expo-constants";
import { Platform } from "react-native";

let configured = false;

export async function getGoogleIdToken(): Promise<string | null> {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (Constants.appOwnership === "expo") {
    throw new Error("Continue with Google requires a development build. It is unavailable in Expo Go.");
  }
  if (!webClientId) throw new Error("Google Sign-In is not configured for this app.");
  if (Platform.OS === "ios" && !iosClientId) throw new Error("Google Sign-In is not configured for iOS.");

  const { GoogleSignin, statusCodes } = await import("@react-native-google-signin/google-signin");

  if (!configured) {
    GoogleSignin.configure({ webClientId, ...(iosClientId ? { iosClientId } : {}) });
    configured = true;
  }

  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  try {
    const result = await GoogleSignin.signIn();
    if (result.type === "cancelled") return null;
    if (!result.data.idToken) throw new Error("Google did not return an ID token. Check the Web client ID.");
    return result.data.idToken;
  } catch (error: any) {
    if (error?.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw error;
  }
}
