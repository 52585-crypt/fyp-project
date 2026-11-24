# RapidAssist mobile app — working rules

Expo Router + TypeScript app for customers and providers (mechanic, tow driver,
fuel delivery). Android and Expo Web are both supported targets (see
`../AGENTS.md`). The redesign plan lives in `../docs/mobile-redesign-plan.md`.

## Styling
- All styling comes from `src/design/tokens.ts`. No hard-coded colours, font
  sizes, radii or spacing in screens or components. If a value is missing, add
  a token.
- Use the components in `src/design/components/` first. If one is missing, add
  it to the kit (and to the gallery at `app/(dev)/kit.tsx`) rather than styling
  a one-off in a screen.
- Fonts: Space Grotesk for headings (`hero`, `display`, `title`, `headline`,
  `price`, `figure` presets) and Inter for body copy. Use `tokens.text.*` /
  `tokens.font.*` (each maps to a loaded face), never a raw `fontWeight`.
- Palette (design canvas): indigo #2D0C9E, deep #22087A, mist #EEEAFE,
  amber #FFB21E, ink #15121F, slate #5E5A6B, cloud #F5F4F8, line #E7E4EE,
  green #12805C, red #C8322B. Semantic names (`primary`, `muted`, `border`…)
  map onto these in `tokens.ts`.
- Radius 14 for controls (`radius.control`), 20 for cards (`radius.card`),
  28 for sheets (`radius.sheet`). Primary button height 54, screen padding 20.
- Map-first screens use `MapCanvas` (`src/components/maps/MapCanvas`) with
  `BottomSheet`. MapCanvas renders react-native-maps on Android when
  `GOOGLE_MAPS_ANDROID_API_KEY` is set, Google Maps JS on web when
  `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` is set, and the OSM tile canvas otherwise.

## Data and logic
- API calls stay in `src/requests`, `src/auth`, `src/vehicles` (plus the
  existing `src/payments`, `src/notifications`, `src/verification`,
  `src/locations`, `src/ai` modules). Screens never import axios or
  `src/config/api` directly.
- Request status → screen/stage mapping lives only in `src/requests/stages.ts`
  (`getCustomerStage`, `getProviderStage`). Screens switch on the stage, never
  on raw `request.status` strings.
- Screen files stay under ~300 lines. Move logic into hooks (`useXxx.ts`) next
  to the module that owns the data.
- Never invent backend endpoints. If the backend has no route for a feature,
  show a "Coming soon" state. Only Cash payment is enabled in the UI.
- Keep existing behaviour working: dispatch polling, location sync, chat,
  extra work, reviews, payments, verification.

## Tooling
- Install packages with `npx expo install <pkg>` (never plain `npm install
  <pkg>`), so versions match the Expo SDK.
- Run `npx tsc --noEmit` after every change and fix every error.
- Run `npm test` (node source tests) and `npx jest` (stage tests) before
  committing.
- Verify on both Android and Web; use `.native.tsx` / `.web.tsx` files or
  `Platform.OS` only where behaviour genuinely differs.
