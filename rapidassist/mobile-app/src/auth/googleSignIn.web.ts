// Native Google Sign-In is shown only on Android and iOS.
export async function getGoogleIdToken(): Promise<string | null> {
  throw new Error("Google Sign-In is available in the Android and iOS app.");
}
