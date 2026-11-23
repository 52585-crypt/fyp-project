import { tokens } from "../theme/tokens";

export { tokens };

export const ui = {
  tokens,
  colors: {
    bg: tokens.colors.canvas,
    surface: tokens.colors.surface,
    surfaceAlt: tokens.colors.surfaceAlt,
    text: tokens.colors.ink,
    muted: tokens.colors.inkMuted,
    border: tokens.colors.border,
    primary: tokens.colors.brand,
    primaryDark: tokens.colors.brandPressed,
    primarySoft: tokens.colors.brandSoft,
    success: tokens.colors.statusSuccess,
    successSoft: tokens.colors.statusSuccessSoft,
    warning: tokens.colors.accent,
    warningSoft: tokens.colors.accentSoft,
    danger: tokens.colors.statusDanger,
    dangerSoft: tokens.colors.statusDangerSoft,
    dark: tokens.colors.dark
  },
  radius: {
    tag: tokens.radii.tag,
    sm: tokens.radii.sm,
    md: tokens.radii.md,
    lg: tokens.radii.button,
    xl: tokens.radii.pill
  },
  shadow: {
    shadowColor: tokens.colors.ink,
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2
  }
} as const;
