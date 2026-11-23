import React, { useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { authDestination, loginWithGoogle, type GoogleIntent } from "./auth.api";
import { resumeAfterSignIn } from "./customerNavigation";
import type { GoogleMechanicProfile } from "./auth.types";
import { useAuth } from "./AuthProvider";
import { getGoogleIdToken } from "./googleSignIn";
import { getNetworkErrorMessage } from "../config/api";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { Text } from "../design/components/Text";
import { tokens } from "../design/tokens";

export function useGoogleSignIn(
  setError: (message: string | null) => void,
  intent: GoogleIntent = "customer",
  onRegistrationRequired?: (profile: GoogleMechanicProfile, idToken: string, enrollmentTicket?: string) => void,
  exchangeGoogleIdToken = loginWithGoogle,
  returnTo?: string
) {
  const { setSession } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const busy = useRef(false);
  const currentIntent = useRef(intent);
  currentIntent.current = intent;

  async function signIn(credential?: string) {
    if (busy.current || currentIntent.current !== intent) return;
    busy.current = true;
    try {
      setGoogleLoading(true);
      setError(null);
      const idToken = credential || await getGoogleIdToken(intent !== "customer");
      if (currentIntent.current !== intent) return;
      if (!idToken) {
        setError("Google sign-in was cancelled.");
        return;
      }
      const data = await exchangeGoogleIdToken(idToken, intent);
      if (currentIntent.current !== intent) return;
      if ("registrationRequired" in data) {
        onRegistrationRequired?.(data.profile, idToken, data.enrollmentTicket);
        return;
      }
      await setSession(data.token, data.user);
      router.replace(resumeAfterSignIn(data.user, returnTo) ?? authDestination(data.user, intent === "mechanic_register"));
    } catch (error) {
      if (currentIntent.current === intent) setError(getNetworkErrorMessage(error));
    } finally {
      busy.current = false;
      setGoogleLoading(false);
    }
  }

  return {
    googleLoading,
    onGoogleSignIn: () => signIn(),
    onGoogleCredential: (credential: string) => signIn(credential),
    onGoogleError: () => setError("Google Sign-In was unsuccessful. Please try again.")
  };
}

export function GoogleSignInOption({ loading, disabled, onPress, onCredential, onError }: { loading: boolean; disabled: boolean; onPress: () => void; onCredential: (credential: string) => void; onError: () => void }) {
  return <>
    <View style={styles.separator}>
      <View style={styles.separatorLine} />
      <Text variant="captionStrong" color="muted">OR</Text>
      <View style={styles.separatorLine} />
    </View>
    <GoogleSignInButton loading={loading} disabled={disabled} onPress={onPress} onCredential={onCredential} onError={onError} />
  </>;
}

const styles = StyleSheet.create({
  separator: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, marginVertical: tokens.space.xs },
  separatorLine: { flex: 1, height: tokens.sizes.hairline, backgroundColor: tokens.color.border }
});
