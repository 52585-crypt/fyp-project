import { Button } from "../design/components";

export type GoogleSignInButtonProps = {
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  onCredential: (credential: string) => void;
  onError: () => void;
};

/** Native: launches the Google SDK via onPress. */
export function GoogleSignInButton({ loading, disabled, onPress }: GoogleSignInButtonProps) {
  return (
    <Button
      title={loading ? "Connecting to Google…" : "Continue with Google"}
      icon="logo-google"
      variant="outline"
      disabled={disabled || loading}
      onPress={onPress}
    />
  );
}
