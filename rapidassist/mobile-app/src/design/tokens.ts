/**
 * RapidAssist design tokens — the single source of truth for styling.
 * Screens and components must not hard-code colours, sizes, radii or fonts.
 */

const palette = {
  primary: "#2D0C9E",
  primaryDark: "#200579",
  primarySoft: "#EEE9FF",
  primaryMuted: "#C9BEF5",
  bg: "#F7F7FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F2F0F8",
  border: "#E6E2EF",
  borderStrong: "#CFC9DE",
  text: "#151124",
  muted: "#6F6A7C",
  subtle: "#9A95A6",
  success: "#16A34A",
  successSoft: "#DCFCE7",
  warning: "#F59E0B",
  warningSoft: "#FEF3C7",
  warningText: "#92400E",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  info: "#2563EB",
  infoSoft: "#DBEAFE",
  onPrimary: "#FFFFFF",
  onPrimaryMuted: "#D9D1FF",
  star: "#F5B301",
  overlay: "rgba(21, 17, 36, 0.45)",
  heroGlow: "rgba(255, 255, 255, 0.12)",
  shadow: "#151124",
  transparent: "transparent"
} as const;

/** Inter faces; each weight is a separately loaded font family. */
const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold"
} as const;

const size = {
  micro: 11,
  caption: 12,
  bodySmall: 13,
  body: 15,
  headline: 17,
  title: 20,
  display: 26,
  hero: 30
} as const;

const lineHeight = {
  micro: 14,
  caption: 16,
  bodySmall: 18,
  body: 21,
  headline: 22,
  title: 26,
  display: 32,
  hero: 36
} as const;

type TextPreset = { fontFamily: string; fontSize: number; lineHeight: number };
const preset = (family: string, key: keyof typeof size): TextPreset => ({
  fontFamily: family,
  fontSize: size[key],
  lineHeight: lineHeight[key]
});

/** Ready-made text styles. Spread into a style: `{ ...tokens.text.title, color }`. */
const text = {
  hero: preset(font.bold, "hero"),
  display: preset(font.bold, "display"),
  title: preset(font.bold, "title"),
  headline: preset(font.semibold, "headline"),
  body: preset(font.regular, "body"),
  bodyMedium: preset(font.medium, "body"),
  bodyStrong: preset(font.semibold, "body"),
  bodySmall: preset(font.regular, "bodySmall"),
  bodySmallMedium: preset(font.medium, "bodySmall"),
  bodySmallStrong: preset(font.semibold, "bodySmall"),
  caption: preset(font.regular, "caption"),
  captionMedium: preset(font.medium, "caption"),
  captionStrong: preset(font.semibold, "caption"),
  micro: preset(font.medium, "micro"),
  button: preset(font.semibold, "body"),
  price: preset(font.bold, "headline")
} as const;

const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  screen: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48
} as const;

const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  card: 18,
  sheet: 24,
  pill: 999
} as const;

const sizes = {
  button: 54,
  buttonSmall: 40,
  input: 52,
  textArea: 104,
  iconTile: 44,
  iconButton: 44,
  icon: 20,
  iconSmall: 16,
  iconLarge: 28,
  avatar: 48,
  avatarLarge: 64,
  tabBar: 64,
  touchMin: 48,
  stepDot: 16,
  timelineDot: 18,
  map: 200,
  mapLarge: 280,
  heroArt: 160,
  successBadge: 72,
  pulse: 168,
  maxContent: 560,
  hairline: 1,
  border: 1.5
} as const;

const shadow = {
  card: {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1
  },
  raised: {
    shadowColor: palette.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6
  }
} as const;

const motion = {
  fast: 150,
  normal: 250,
  pulse: 1400
} as const;

export const tokens = {
  color: palette,
  font,
  size,
  lineHeight,
  text,
  space,
  radius,
  sizes,
  shadow,
  motion,
  opacity: { disabled: 0.5, pressed: 0.85 }
} as const;

export type Tokens = typeof tokens;
export type ColorToken = keyof typeof palette;
export type TextToken = keyof typeof text;
