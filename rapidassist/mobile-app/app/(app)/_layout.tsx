import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";

export default function AppLayout() {
  const { isLoading, token } = useAuth();
  if (isLoading) return null;
  if (!token) return <Redirect href="/(auth)/welcome" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

