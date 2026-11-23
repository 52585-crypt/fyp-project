import { configureFonts, MD3LightTheme } from "react-native-paper";
import { tokens } from "./tokens";

const c = tokens.color;

/** react-native-paper theme driven entirely by design tokens. */
export const paperTheme = {
  ...MD3LightTheme,
  fonts: configureFonts({ config: { fontFamily: tokens.font.regular } }),
  colors: {
    ...MD3LightTheme.colors,
    primary: c.primary,
    onPrimary: c.onPrimary,
    primaryContainer: c.primarySoft,
    onPrimaryContainer: c.primaryDark,
    secondary: c.primaryDark,
    background: c.bg,
    surface: c.surface,
    surfaceVariant: c.surfaceAlt,
    outline: c.border,
    onSurface: c.text,
    onSurfaceVariant: c.muted,
    error: c.danger
  },
  roundness: tokens.radius.sm / 4
};
