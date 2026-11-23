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
- Font: Inter. Weights 400 / 500 / 600 / 700 only — use `tokens.font.*`
  (each maps to a loaded Inter face), never a raw `fontWeight` like `"800"`.
- Card radius 18, primary button height 54, screen padding 20, indigo hero
  cards — all expressed as tokens.

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
