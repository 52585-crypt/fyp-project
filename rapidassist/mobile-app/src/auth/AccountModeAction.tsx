import { useRef, useState } from "react";
import { router } from "expo-router";
import { getNetworkErrorMessage } from "../config/api";
import { NoticeBanner, PrimaryButton } from "../ui/components";
import { useAuth } from "./AuthProvider";
import { authDestination, changeActiveRole } from "./auth.api";

export function AccountModeAction() {
  const { user, token, setSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  if (!user || !token) return null;
  const activeRole = user.activeRole ?? user.role;
  const target = activeRole === "mechanic" ? "user" : "mechanic";
  if (!user.roles?.includes(target)) {
    const needsGoogleLink = user.authProvider === "local" && !user.hasGoogleSignIn;
    return activeRole === "user" ? (
      <PrimaryButton title="Become a Service Provider" variant="outline" onPress={() =>
        router.push({ pathname: "/(auth)/signup", params: {
          role: "mechanic", ...(needsGoogleLink ? { linkGoogle: "1" } : {})
        } })} />
    ) : null;
  }

  async function switchMode() {
    if (!token || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const session = await changeActiveRole(token, target);
      await setSession(session.token, session.user);
      router.replace(target === "mechanic" && session.user.verificationStatus !== "verified"
        ? "/(provider)/verification" : authDestination(session.user));
    } catch (failure) {
      setError(getNetworkErrorMessage(failure));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return <>
    {error ? <NoticeBanner tone="danger" title="Could not switch modes" message={error} /> : null}
    <PrimaryButton title={target === "mechanic" ? "Switch to Provider" : "Switch to Customer"}
      variant="outline" loading={loading} onPress={switchMode} />
  </>;
}
