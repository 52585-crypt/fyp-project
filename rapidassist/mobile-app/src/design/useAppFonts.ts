import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";

/** Loads the four Inter weights the design system allows. Ready once loaded or if loading failed (system font fallback). */
export function useAppFonts() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  return loaded || Boolean(error);
}
