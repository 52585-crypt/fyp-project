import { Redirect, Stack, usePathname } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { legacyRoleDestination } from "../../src/auth/customerNavigation";
import { VerificationProvider } from "../../src/verification/VerificationProvider";

export default function ProviderLayout() {
  const { user, token, isLoading } = useAuth();
  const path = usePathname();
  const customerAlias = legacyRoleDestination(path, "user");
  if (customerAlias && isLoading && !user) return null;
  if (customerAlias && !token) {
    return <Redirect href={{ pathname: "/(auth)/login", params: { returnTo: path } }} />;
  }
  if (token && user && (user.activeRole ?? user.role) === "user") {
    if (!user.phone) {
      return <Redirect href={{ pathname: "/(auth)/complete-profile",
        params: { returnTo: customerAlias ? path : undefined } }} />;
    }
    return <Redirect href={customerAlias ?? "/(user)/home"} />;
  }
  return (
    <VerificationProvider key={user?.id ?? "signed-out"} token={user?.role === "mechanic" ? token : null}>
      <Stack screenOptions={{ headerShown: false }} />
    </VerificationProvider>
  );
}
