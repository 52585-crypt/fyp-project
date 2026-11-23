import { Redirect, Stack } from "expo-router";

/** Developer-only screens (component gallery, map foundation). Hidden from release builds. */
export default function DevLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
