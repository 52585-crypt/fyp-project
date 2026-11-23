import { useRoute } from "@react-navigation/native";
import { Redirect, Stack, useGlobalSearchParams, usePathname } from "expo-router";
import { useRef } from "react";
import { useAuth } from "../../src/auth/AuthProvider";
import { customerReturnTo } from "../../src/auth/customerNavigation";

export default function UserLayout() {
  const { isLoading, token, user } = useAuth();
  const route = useRoute();
  const path = usePathname();
  const params = useGlobalSearchParams();
  const lastDestination = useRef<string | undefined>(undefined);
  const destination = customerReturnTo(path, params, route.params);
  if (destination) lastDestination.current = destination;
  const returnTo = destination ?? lastDestination.current;

  if (isLoading && !user) return null;
  if (!token || !user) {
    if (path === "/login") return null;
    return <Redirect href={{ pathname: "/(auth)/login", params: { returnTo } }} />;
  }
  if ((user.activeRole ?? user.role) === "mechanic") return <Redirect href="/(provider)/dashboard" />;
  if (!user.phone) {
    if (path === "/complete-profile") return null;
    return <Redirect href={{ pathname: "/(auth)/complete-profile", params: { returnTo } }} />;
  }
  return <Stack key={user.id} screenOptions={{ headerShown: false }} />;
}
