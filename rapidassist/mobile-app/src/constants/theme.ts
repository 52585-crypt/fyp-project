import { MD3LightTheme } from "react-native-paper";
import { ui } from "../ui/system";

export const appColors = {
  background: ui.colors.bg,
  surface: ui.colors.surface,
  surfaceMuted: ui.colors.surfaceAlt,
  border: ui.colors.border,
  text: ui.colors.text,
  muted: ui.colors.muted,
  primary: ui.colors.primary,
  primaryDark: ui.colors.primaryDark,
  primarySoft: ui.colors.primarySoft,
  success: ui.colors.success,
  warning: ui.colors.warning,
  danger: ui.colors.danger,
  dangerSoft: ui.colors.dangerSoft
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22
} as const;

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: appColors.primary,
    secondary: appColors.primaryDark,
    background: appColors.background,
    surface: appColors.surface,
    error: appColors.danger
  },
  roundness: 3
};
