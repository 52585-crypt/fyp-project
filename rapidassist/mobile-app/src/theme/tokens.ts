import { Platform } from "react-native";

export const tokens = {
  colors: {
    // Brand - Highway Green
    brand: "#006341",
    brandPressed: "#00482F",
    brandSoft: "#E8F3EE",
    brandDark: "#003824",

    // Accent - Signal Amber (caution, ETAs, towing alerts)
    accent: "#B45309",
    accentHover: "#92400E",
    accentSoft: "#FEF3C7",

    // Canvas & Neutral Scale (tinted asphalt & roadway slate, not pure lifeless gray)
    canvas: "#F4F5F4",
    canvasSubtle: "#E8EBE9",
    surface: "#FFFFFF",
    surfaceRaised: "#FAFBFA",
    surfaceAlt: "#EFF2F0",

    // Mechanical Borders (crisp keylines for outdoor sunlight)
    border: "#D1D9D4",
    borderSubtle: "#E2E7E4",
    borderStrong: "#9BA8A1",
    borderFocus: "#006341",

    // Text & Ink (high contrast 98% asphalt black)
    ink: "#0F1A15",
    inkMuted: "#4B5E55",
    inkSubtle: "#71837A",
    inkInverse: "#FFFFFF",

    // Semantic Status Tokens
    statusOnWay: "#1D4ED8",
    statusOnWaySoft: "#DBEAFE",
    statusArrived: "#6D28D9",
    statusArrivedSoft: "#EDE9FE",
    statusSuccess: "#15803D",
    statusSuccessSoft: "#DCFCE7",
    statusWarning: "#B45309",
    statusWarningSoft: "#FEF3C7",
    statusDanger: "#DC2626",
    statusDangerSoft: "#FEE2E2",

    // Industrial Dark Accent
    dark: "#12261E"
  },

  radii: {
    none: 0,
    tag: 4,      // Stamped industrial labels
    sm: 6,       // Secondary chips
    md: 8,       // Cards, inputs, sheets
    button: 10,  // Tactile touch buttons
    pill: 999
  },

  borders: {
    hairline: 1,
    standard: 1.5, // Distinctive physical keyline
    heavy: 2
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    hero: 32
  },

  typography: {
    fonts: {
      display: Platform.select({
        ios: "System",
        android: "Roboto",
        web: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }),
      body: Platform.select({
        ios: "System",
        android: "Roboto",
        web: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }),
      mono: Platform.select({
        ios: "Menlo",
        android: "monospace",
        web: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      }),
      urdu: Platform.select({
        ios: "Noto Nastaliq Urdu",
        android: "Noto Nastaliq Urdu",
        web: "'Noto Nastaliq Urdu', 'Noto Sans Arabic', Tahoma, sans-serif"
      })
    },
    sizes: {
      displayLarge: 28,
      displayMedium: 22,
      headline: 17,
      body: 14,
      bodySmall: 12,
      caption: 11
    },
    lineHeights: {
      displayLarge: 34,
      displayMedium: 28,
      headline: 22,
      body: 20,
      bodySmall: 16,
      caption: 14
    },
    letterSpacing: {
      tight: -0.6,
      normal: 0,
      stamped: 0.8 // For uppercase badge marks
    }
  },

  touch: {
    minTarget: 48,
    comfortable: 54
  }
} as const;

export type ThemeTokens = typeof tokens;
