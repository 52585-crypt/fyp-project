import { MD3LightTheme } from "react-native-paper";

export const appColors = {
  background: "#F7F7FB",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F2FA",
  border: "#E6E2EF",
  text: "#151124",
  muted: "#6F6A7C",
  primary: "#2D0C9E",
  primaryDark: "#200579",
  primarySoft: "#EEE9FF",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2"
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

