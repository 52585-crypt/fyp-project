import Constants from "expo-constants";
import { Platform } from "react-native";

let configured = false;

export async function getGoogleIdToken(selectAccount = false): Promise<string | null> {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (Constants.appOwnership === "expo") {
    throw new Error("Continue with Google requires a development build. It is unavailable in Expo Go.");
  }
  if (!webClientId) throw new Error("Google Sign-In is not configured for this app.");
  if (Platform.OS === "ios" && !iosClientId) throw new Error("Google Sign-In is not configured for iOS.");

  const sdk = await import("@react-native-google-signin/google-signin").catch(() => {
    throw new Error("Google Sign-In requires a development build with Google Sign-In installed.");
  });
  const { GoogleSignin, statusCodes } = sdk;

  let idToken: string | null;
  try {
    if (!configured) {
      GoogleSignin.configure({ webClientId, ...(iosClientId ? { iosClientId } : {}) });
      configured = true;
    }
    if (Platform.OS === "android") await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    if (selectAccount && GoogleSignin.hasPreviousSignIn()) await GoogleSignin.signOut();
    const result = await GoogleSignin.signIn();
    if (result.type === "cancelled") return null;
    idToken = result.data.idToken;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) return null;
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error("Google Play services are unavailable. Update them and try again.");
    }
    if (code === "10" || code === "DEVELOPER_ERROR") {
      throw new Error("Google Sign-In is not configured for this Android build. Use phone sign-in or contact support.");
    }
    if (code === "7" || code === "NETWORK_ERROR") {
      throw new Error("Google could not connect. Check your internet connection and try again.");
    }
    throw new Error("Google Sign-In could not complete. Please try again.");
  }
  if (!idToken) throw new Error("Google did not return a sign-in credential. Try again or use phone sign-in.");
  return idToken;
}
