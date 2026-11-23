import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AuthBrand } from "../../src/auth/AuthBrand";
import { GoogleSignInButton } from "../../src/auth/GoogleSignInButton";
import { useLogin } from "../../src/auth/useLogin";
import { Banner, Button, ChipGroup, Input, Screen, Text } from "../../src/design/components";
import { tokens } from "../../src/design/tokens";

export default function Login() {
  const l = useLogin();
  return (
    <Screen>
      <AuthBrand title="Welcome back!" subtitle="Sign in to continue with RapidAssist" />
      {l.error ? <Banner tone="danger" message={l.error} /> : null}
      <Input label="Mobile number" icon="call-outline" placeholder="03001234567" keyboardType="phone-pad" autoComplete="tel"
        value={l.phone} onChangeText={l.setPhone} />
      <Input label="Password" icon="lock-closed-outline" secureTextEntry autoComplete="current-password"
        value={l.password} onChangeText={l.setPassword} onSubmitEditing={l.signInWithPhone} />
      <Button title="Sign in" loading={l.loading} disabled={!l.canSubmit} onPress={l.signInWithPhone} />

      <View style={styles.divider}>
        <View style={styles.line} /><Text variant="captionStrong" color="muted">OR</Text><View style={styles.line} />
      </View>
      <Text variant="bodySmallStrong">Sign in with Google as</Text>
      <ChipGroup columns={2} accessibilityLabel="Google account type" value={l.provider ? "provider" : "customer"}
        onChange={(v) => l.chooseAccountType(v === "provider")}
        options={[{ value: "customer", label: "Customer", icon: "person-outline" }, { value: "provider", label: "Provider", icon: "construct-outline" }]} />
      <GoogleSignInButton key={l.provider ? "provider" : "customer"} loading={l.googleLoading} disabled={l.loading || l.googleLoading}
        onPress={l.onGoogleSignIn} onCredential={l.onGoogleCredential} onError={l.onGoogleError} />

      <View style={styles.links}>
        <Button title="Create an account" variant="ghost" onPress={() => router.push("/(auth)/signup")} />
        <Button title="Register as a Service Provider" variant="ghost"
          onPress={() => router.push({ pathname: "/(auth)/signup", params: { role: "mechanic" } })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  line: { flex: 1, height: tokens.sizes.hairline, backgroundColor: tokens.color.border },
  links: { gap: tokens.space.xs }
});
