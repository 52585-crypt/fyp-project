/**
 * RapidAssist design tokens — the single source of truth for styling.
 * Screens and components must not hard-code colours, sizes, radii or fonts.
 */

/** Brand palette from the RapidAssist design canvas. */
const brand = {
  indigo: "#2D0C9E",
  deep: "#22087A",
  mist: "#EEEAFE",
  amber: "#FFB21E",
  ink: "#15121F",
  slate: "#5E5A6B",
  cloud: "#F5F4F8",
  line: "#E7E4EE",
  green: "#12805C",
  red: "#C8322B"
} as const;

/** Semantic colours. Components use these names; each maps onto the brand palette. */
const palette = {
  ...brand,
  primary: brand.indigo,
  primaryDark: brand.deep,
  primarySoft: brand.mist,
  primaryMuted: "#C9BEF5",
  accent: brand.amber,
  accentSoft: "#FFF3D6",
  onAccent: brand.ink,
  bg: brand.cloud,
  surface: "#FFFFFF",
  surfaceAlt: "#EDEBF3",
  border: brand.line,
  borderStrong: "#CFCAD9",
  text: brand.ink,
  muted: brand.slate,
  subtle: "#9893A5",
  success: brand.green,
  successSoft: "#E2F2EB",
  warning: brand.amber,
  warningSoft: "#FFF3D6",
  warningText: "#7A4B00",
  danger: brand.red,
  dangerSoft: "#FAE7E6",
  info: "#2563EB",
  infoSoft: "#DBEAFE",
  onPrimary: "#FFFFFF",
  onPrimaryMuted: "#D9D1FF",
  star: brand.amber,
  overlay: "rgba(21, 18, 31, 0.45)",
  /** Frosted white for controls and labels floating over maps. */
  surfaceGlass: "rgba(255, 255, 255, 0.94)",
  /** Faint white fills/lines on dark banners. */
  onDarkFaint: "rgba(255, 255, 255, 0.2)",
  onDarkLine: "rgba(255, 255, 255, 0.4)",
  shadowSoft: "rgba(21, 18, 31, 0.3)",
  starGlow: "rgba(255, 178, 30, 0.35)",
  heroGlow: "rgba(255, 255, 255, 0.12)",
  /** Translucent indigo halo around the live / search pulse on maps. */
  primaryHalo: "rgba(45, 12, 158, 0.16)",
  /** Map markers for nearby providers, one colour per service, with the glyph colour drawn on top. */
  serviceMechanic: brand.amber,
  onServiceMechanic: brand.ink,
  serviceTowing: "#BE185D",
  onServiceTowing: "#FFFFFF",
  serviceFuel: brand.green,
  onServiceFuel: "#FFFFFF",
  /** The customer's own position: blue dot, halo, and the faint circle (fill + edge) drawn when the fix is approximate. */
  myLocation: "#2563EB",
  myLocationHalo: "rgba(37, 99, 235, 0.22)",
  myLocationAccuracy: "rgba(37, 99, 235, 0.12)",
  myLocationAccuracyEdge: "rgba(37, 99, 235, 0.35)",
  /** The planned trip (e.g. tow pickup → drop-off), drawn dotted under the live route. */
  routePlanned: "rgba(94, 90, 107, 0.6)",
  shadow: brand.ink,
  transparent: "transparent"
} as const;

/** Loaded font faces: Inter for body copy, Space Grotesk for headings. Each weight is its own family. */
const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  displayMedium: "SpaceGrotesk_500Medium",
  displaySemibold: "SpaceGrotesk_600SemiBold",
  displayBold: "SpaceGrotesk_700Bold"
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
  hero: preset(font.displayBold, "hero"),
  display: preset(font.displayBold, "display"),
  title: preset(font.displayBold, "title"),
  headline: preset(font.displaySemibold, "headline"),
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
  price: preset(font.displayBold, "headline"),
  /** Large numerals: fares and ETAs. */
  figure: preset(font.displayBold, "display")
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
  /** Buttons, inputs, chips and other controls. */
  md: 14,
  control: 14,
  card: 20,
  sheet: 28,
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
  /** Below this window width, components switch to their compact layout. */
  compactWidth: 380,
  hairline: 1,
  border: 1.5,
  /** Drag handle on bottom sheets. */
  sheetHandle: 40,
  sheetHandleHeight: 5,
  /** Collapsed height of the map-screen bottom sheet. */
  sheetPeek: 300,
  /** Centre pin on the pickup screen. */
  pin: 44,
  pinStem: 14,
  mapMarker: 22,
  mapMarkerProvider: 34,
  /** Service glyph inside a provider marker. */
  mapMarkerGlyph: 20,
  /** The customer's blue location dot. */
  mapMyLocation: 16
} as const;

const shadow = {
  card: {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1
  },
  sheet: {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16
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
