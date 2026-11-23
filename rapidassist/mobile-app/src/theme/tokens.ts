/**
 * @deprecated Legacy token shape kept only so not-yet-redesigned screens compile.
 * Every value is derived from src/design/tokens.ts. Removed in phase 8.
 */
import { Platform } from "react-native";
import { tokens as t } from "../design/tokens";

const c = t.color;

export const tokens = {
  colors: {
    brand: c.primary,
    brandPressed: c.primaryDark,
    brandSoft: c.primarySoft,
    brandDark: c.primaryDark,
    accent: c.warning,
    accentHover: c.warningText,
    accentSoft: c.warningSoft,
    canvas: c.bg,
    canvasSubtle: c.surfaceAlt,
    surface: c.surface,
    surfaceRaised: c.surface,
    surfaceAlt: c.surfaceAlt,
    border: c.border,
    borderSubtle: c.border,
    borderStrong: c.borderStrong,
    borderFocus: c.primary,
    ink: c.text,
    inkMuted: c.muted,
    inkSubtle: c.subtle,
    inkInverse: c.onPrimary,
    statusOnWay: c.info,
    statusOnWaySoft: c.infoSoft,
    statusArrived: c.primary,
    statusArrivedSoft: c.primarySoft,
    statusSuccess: c.success,
    statusSuccessSoft: c.successSoft,
    statusWarning: c.warning,
    statusWarningSoft: c.warningSoft,
    statusDanger: c.danger,
    statusDangerSoft: c.dangerSoft,
    dark: c.primaryDark
  },
  radii: { none: 0, tag: t.radius.xs, sm: t.radius.sm, md: t.radius.md, button: t.radius.md, pill: t.radius.pill },
  borders: { hairline: t.sizes.hairline, standard: t.sizes.border, heavy: 2 },
  spacing: { xs: t.space.xs, sm: t.space.sm, md: t.space.md, lg: t.space.lg, xl: t.space.screen, xxl: t.space.xl, hero: t.space.xxl },
  typography: {
    fonts: {
      display: t.font.bold,
      body: t.font.regular,
      mono: Platform.select({ ios: "Menlo", android: "monospace", web: "ui-monospace, Menlo, monospace" }),
      urdu: Platform.select({ ios: "Noto Nastaliq Urdu", android: "Noto Nastaliq Urdu", web: "'Noto Nastaliq Urdu', Tahoma, sans-serif" })
    },
    sizes: {
      displayLarge: t.size.display, displayMedium: t.size.title, headline: t.size.headline,
      body: t.size.body, bodySmall: t.size.bodySmall, caption: t.size.caption
    },
    lineHeights: {
      displayLarge: t.lineHeight.display, displayMedium: t.lineHeight.title, headline: t.lineHeight.headline,
      body: t.lineHeight.body, bodySmall: t.lineHeight.bodySmall, caption: t.lineHeight.caption
    },
    letterSpacing: { tight: -0.3, normal: 0, stamped: 0.4 }
  },
  touch: { minTarget: t.sizes.touchMin, comfortable: t.sizes.button }
} as const;

export type ThemeTokens = typeof tokens;
