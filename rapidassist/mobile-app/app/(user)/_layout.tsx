import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";

export default function UserLayout() {
  const { token, user } = useAuth();
  if (token && user?.role === "user" && !user.phone) return <Redirect href="/(auth)/complete-profile" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

