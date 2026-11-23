import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Text, View } from "react-native";
import { PrimaryButton } from "../ui/components";
import { useGoogleWebStatus } from "./GoogleOAuthRoot.web";
import type { GoogleSignInButtonProps } from "./GoogleSignInButton";

export function GoogleSignInButton({ loading, disabled, onCredential, onError }: GoogleSignInButtonProps) {
  const status = useGoogleWebStatus();
  if (status === "error" || status === "unconfigured") {
    return <Text accessibilityRole="alert">{status === "unconfigured" ? "Google Sign-In is not configured for this app." : "Google Sign-In could not load. Check your connection and reload."}</Text>;
  }
  if (status !== "ready" || loading || disabled) {
    return <PrimaryButton title={loading ? "Connecting to Google..." : "Continue with Google"} icon="logo-google" variant="outline" disabled />;
  }
  return <View accessibilityLabel="Continue with Google">
    <GoogleLogin ux_mode="popup" text="continue_with" size="large" onSuccess={({ credential }) => credential ? onCredential(credential) : onError()} onError={onError} />
  </View>;
}
