import { GoogleLogin } from "@react-oauth/google";
import { View } from "react-native";
import { Banner, Button } from "../design/components";
import { useGoogleWebStatus } from "./GoogleOAuthRoot.web";
import type { GoogleSignInButtonProps } from "./GoogleSignInButton";

/** Web: Google renders its own button inside an iframe; we show a kit button while it loads. */
export function GoogleSignInButton({ loading, disabled, onCredential, onError }: GoogleSignInButtonProps) {
  const status = useGoogleWebStatus();
  if (status === "error" || status === "unconfigured") {
    return <Banner tone="warning" message={status === "unconfigured" ? "Google Sign-In is not configured for this app." : "Google Sign-In could not load. Check your connection and reload."} />;
  }
  if (status !== "ready" || loading || disabled) {
    return <Button title={loading ? "Connecting to Google..." : "Continue with Google"} icon="logo-google" variant="outline" disabled />;
  }
  return <View accessibilityLabel="Continue with Google" style={{ alignItems: "center" }}>
    <GoogleLogin ux_mode="popup" text="continue_with" size="large" width="320" onSuccess={({ credential }) => credential ? onCredential(credential) : onError()} onError={onError} />
  </View>;
}
