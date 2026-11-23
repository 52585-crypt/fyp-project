import { Redirect, Stack, usePathname } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { legacyRoleDestination } from "../../src/auth/customerNavigation";
import { VerificationProvider } from "../../src/verification/VerificationProvider";

/** Role guard: only provider (mechanic-role) accounts may use provider screens. */
export default function ProviderLayout() {
  const { user, token, isLoading } = useAuth();
  const path = usePathname();
  // A role-ambiguous legacy link (e.g. /profile) that a customer may also hold.
  const customerAlias = legacyRoleDestination(path, "user");
  if (isLoading && !user) return null;
  if (!token || !user) {
    return customerAlias
      ? <Redirect href={{ pathname: "/(auth)/login", params: { returnTo: path } }} />
      : <Redirect href="/(auth)/welcome" />;
  }
  if ((user.activeRole ?? user.role) === "user") {
    if (!user.phone) {
      return <Redirect href={{ pathname: "/(auth)/complete-profile", params: { returnTo: customerAlias ? path : undefined } }} />;
    }
    return <Redirect href={customerAlias ?? "/home"} />;
  }
  return (
    <VerificationProvider key={user.id} token={user.role === "mechanic" ? token : null}>
      <Stack screenOptions={{ headerShown: false }} />
    </VerificationProvider>
  );
}
