import { useMemo, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { completeGooglePhone } from "../../src/auth/auth.api";
import { resumeAfterSignIn } from "../../src/auth/customerNavigation";
import { useAuth } from "../../src/auth/AuthProvider";
import { getNetworkErrorMessage } from "../../src/config/api";
import { AuthBrand } from "../../src/auth/AuthBrand";
import { Banner, Button, Input, Screen } from "../../src/design/components";

export default function CompleteProfile() {
  const { token, user, updateUser, logout } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = useMemo(() => phone.trim().length >= 10, [phone]);

  if (!token || !user) return <Redirect href={{ pathname: "/(auth)/login", params: { returnTo } }} />;
  if (user.role !== "user") return <Redirect href="/" />;
  if (user.phone) return <Redirect href={resumeAfterSignIn(user, returnTo) ?? "/home"} />;

  async function onSave() {
    if (!token || saving) return;
    try {
      setSaving(true);
      setError(null);
      const result = await completeGooglePhone(token, phone.trim());
      updateUser(result.user);
      router.replace(resumeAfterSignIn(result.user, returnTo) ?? "/home");
    } catch (e: any) {
      setError(getNetworkErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSignOut() {
    try {
      setSigningOut(true);
      setError(null);
      await logout();
      router.replace("/(auth)/welcome");
    } catch (e: any) {
      setError(getNetworkErrorMessage(e));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Screen footer={<>
      <Button title="Continue" icon="arrow-forward" loading={saving} disabled={!canSave || saving || signingOut} onPress={onSave} />
      <Button title="Sign out" variant="outline" loading={signingOut} disabled={saving || signingOut} onPress={onSignOut} />
    </>}>
      <AuthBrand title="One last step" subtitle="Add a phone number so your roadside provider can reach you when needed." />
      {error ? <Banner tone="danger" message={error} /> : null}
      <Input label="Phone number" icon="call-outline" placeholder="03001234567" keyboardType="phone-pad" autoComplete="tel"
        value={phone} onChangeText={setPhone} error={phone.length > 0 && !canSave ? "Enter at least 10 digits." : null} />
    </Screen>
  );
}
