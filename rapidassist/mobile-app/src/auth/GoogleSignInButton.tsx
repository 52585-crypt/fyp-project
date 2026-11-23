import React from "react";
import { PrimaryButton } from "../ui/components";
import { tokens } from "../theme/tokens";

export type GoogleSignInButtonProps = {
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  onCredential: (credential: string) => void;
  onError: () => void;
  style?: any;
};

export function GoogleSignInButton({ loading, disabled, onPress, style }: GoogleSignInButtonProps) {
  return (
    <PrimaryButton
      title={loading ? "Connecting to Google…" : "Continue with Google"}
      icon="logo-google"
      variant="outline"
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        {
          width: "100%",
          height: 54,
          minHeight: 54,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: tokens.colors.brand,
          backgroundColor: tokens.colors.surface
        },
        style
      ]}
    />
  );
}
