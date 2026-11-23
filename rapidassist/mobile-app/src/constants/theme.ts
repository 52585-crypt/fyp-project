/** @deprecated Use src/design/tokens.ts. Kept for not-yet-redesigned screens; removed in phase 8. */
import { tokens } from "../design/tokens";

const c = tokens.color;

export const appColors = {
  background: c.bg,
  surface: c.surface,
  surfaceMuted: c.surfaceAlt,
  border: c.border,
  text: c.text,
  muted: c.muted,
  primary: c.primary,
  primaryDark: c.primaryDark,
  primarySoft: c.primarySoft,
  success: c.success,
  warning: c.warning,
  danger: c.danger,
  dangerSoft: c.dangerSoft
} as const;

export const spacing = { xs: tokens.space.xs, sm: tokens.space.sm, md: tokens.space.md, lg: tokens.space.lg, xl: tokens.space.screen, xxl: tokens.space.xl } as const;
export const radii = { sm: tokens.radius.sm, md: tokens.radius.md, lg: tokens.radius.card, xl: tokens.radius.sheet } as const;

export { paperTheme } from "../design/paperTheme";
