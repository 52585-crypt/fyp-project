import React, { useRef, useState } from "react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGoogleSignIn } from "../../src/auth/GoogleSignInOption";
import { GoogleSignInButton } from "../../src/auth/GoogleSignInButton";
import { authDestination, login } from "../../src/auth/auth.api";
import { resumeAfterSignIn } from "../../src/auth/customerNavigation";
import { useAuth } from "../../src/auth/AuthProvider";
import { RATextInput } from "../../src/components/RATextInput";
import { PrimaryButton } from "../../src/ui/components";
import { getNetworkErrorMessage } from "../../src/config/api";
import { tokens } from "../../src/theme/tokens";

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const { role, returnTo } = useLocalSearchParams<{ role?: string; returnTo?: string }>();
  const [provider, setProvider] = useState(role === "mechanic");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const { setSession } = useAuth();
  const { googleLoading, onGoogleSignIn, onGoogleCredential, onGoogleError } = useGoogleSignIn(
    setError, provider ? "mechanic_login" : "customer", undefined, undefined, returnTo
  );

  async function signInWithPhone() {
    if (pending.current || googleLoading || !phone.trim() || !password) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await login({ phone: phone.trim(), password });
      await setSession(token, user);
      router.replace(resumeAfterSignIn(user, returnTo) ?? authDestination(user));
    } catch (failure) {
      setError(getNetworkErrorMessage(failure));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* 1. RapidAssist logo (centered) */}
          <View style={styles.logoWrap}>
            <Image
              source={require("../../assets/icon.png")}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>

          {/* 2. RapidAssist app name */}
          <Text style={styles.appName}>RapidAssist</Text>

          {/* 3. Your Roadside Companion tagline */}
          <Text style={styles.tagline}>Your Roadside Companion</Text>

          {/* 4. Welcome Back! heading */}
          <Text style={styles.heading}>Welcome Back!</Text>

          {/* 5. Sign in to continue with RapidAssist subtitle */}
          <Text style={styles.subtitle}>Sign in to continue with RapidAssist</Text>

          {/* Error Notice */}
          {error ? (
            <View style={styles.errorAlert} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.loginForm}>
            <RATextInput accessibilityLabel="Mobile number" placeholder="Mobile number" icon="call-outline"
              keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone} />
            <RATextInput accessibilityLabel="Password" placeholder="Password" icon="lock-closed-outline"
              secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} onSubmitEditing={signInWithPhone} />
            <PrimaryButton title="Sign in with phone" loading={loading} onPress={signInWithPhone}
              disabled={loading || googleLoading || !phone.trim() || !password} />
          </View>

          <View style={styles.googleButtonWrapper}>
            <Text style={styles.signupText}>Google account type</Text>
            <View style={styles.accountTypes} accessibilityRole="radiogroup">
              {[false, true].map((isProvider) => (
                <Pressable key={String(isProvider)} accessibilityRole="radio"
                  aria-checked={provider === isProvider}
                  accessibilityState={{ checked: provider === isProvider }} disabled={loading || googleLoading}
                  onPress={() => { setProvider(isProvider); setError(null); }}
                  style={[styles.accountType, provider === isProvider && styles.accountTypeSelected]}>
                  <Text style={styles.providerBtnText}>{isProvider ? "Provider" : "Customer"}</Text>
                </Pressable>
              ))}
            </View>
            <GoogleSignInButton
              key={provider ? "provider" : "customer"}
              loading={googleLoading}
              disabled={loading || googleLoading}
              onPress={onGoogleSignIn}
              onCredential={onGoogleCredential}
              onError={onGoogleError}
            />
          </View>

          {/* 7. Don't have an account? Sign up */}
          <View style={styles.signupRow}>
            <Text style={styles.signupText}>
              Don't have an account?{" "}
              <Link href="/(auth)/signup" style={styles.signupLink}>
                Sign up
              </Link>
            </Text>
          </View>

          {/* 8. Register as a Provider */}
          <View style={styles.providerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Register as a Service Provider"
              onPress={() => router.push({ pathname: "/(auth)/signup", params: { role: "mechanic" } })}
              style={({ pressed }) => [styles.providerBtn, pressed ? styles.providerBtnPressed : null]}
            >
              <Text style={styles.providerBtnText}>Register as a Provider</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loginForm: { width: "100%", gap: 10 },
  accountTypes: { flexDirection: "row", gap: 8, marginVertical: 8 },
  accountType: { flex: 1, alignItems: "center", padding: 10, borderWidth: 1, borderRadius: 8, borderColor: tokens.colors.borderStrong },
  accountTypeSelected: { backgroundColor: tokens.colors.brandSoft, borderColor: tokens.colors.brand },
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.surface
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 36
  },
  content: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center"
  },
  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: tokens.colors.brandSoft,
    borderWidth: tokens.borders.standard,
    borderColor: tokens.colors.brand,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: tokens.colors.brand,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }
  },
  logoImage: {
    width: "100%",
    height: "100%"
  },
  appName: {
    marginTop: 14,
    fontSize: 26,
    fontWeight: "900",
    color: tokens.colors.ink,
    letterSpacing: -0.6,
    textAlign: "center"
  },
  tagline: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: tokens.typography.fonts.mono,
    fontWeight: "700",
    color: tokens.colors.brand,
    letterSpacing: 1.2,
    textAlign: "center",
    textTransform: "uppercase"
  },
  heading: {
    marginTop: 36,
    fontSize: 28,
    fontWeight: "900",
    color: tokens.colors.ink,
    letterSpacing: -0.5,
    textAlign: "center"
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: tokens.colors.inkMuted,
    textAlign: "center",
    fontWeight: "500",
    lineHeight: 20
  },
  errorAlert: {
    width: "100%",
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.colors.statusDangerSoft,
    borderWidth: 1,
    borderColor: tokens.colors.statusDanger
  },
  errorText: {
    color: tokens.colors.statusDanger,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center"
  },
  googleButtonWrapper: {
    width: "100%",
    marginTop: 32
  },
  signupRow: {
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  signupText: {
    fontSize: 14,
    color: tokens.colors.inkMuted,
    fontWeight: "500"
  },
  signupLink: {
    color: tokens.colors.brand,
    fontWeight: "800"
  },
  providerRow: {
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  providerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: tokens.radii.pill,
    backgroundColor: tokens.colors.brandSoft,
    borderWidth: tokens.borders.hairline,
    borderColor: tokens.colors.brand
  },
  providerBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }]
  },
  providerBtnText: {
    color: tokens.colors.brand,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3
  }
});
