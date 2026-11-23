# RapidAssist mobile app: rules for Claude Code

Expo (SDK 54) + Expo Router + TypeScript. Backend: `../server` (Express + MongoDB, port 4000).

## Redesign in progress
Follow `../docs/mobile-redesign-plan.md`. Do only the phase you are asked to do.
Design references: `../ui-images/` (note: `user side/` holds provider mockups and
`provider side/` holds customer mockups).

## Styling rules
- Use tokens from `src/design/tokens.ts` only. No hard-coded colours, font sizes or spacing.
- Use components from `src/design/components/` before writing new UI. If something is missing,
  add it to the kit instead of styling inline in a screen.
- Font weights: 400 / 500 / 600 / 700 only.

## Code rules
- Roles: `user` = customer, `mechanic` = provider (all provider types).
- API calls live in `src/requests/requests.api.ts`, `src/auth/`, `src/vehicles/`. Don't call axios from screens.
- Request status → screen stage mapping lives in `src/requests/stages.ts`. Don't duplicate it in screens.
- Keep screen files under ~300 lines; move logic into hooks (`src/hooks/`) or `src/requests/`.
- Install packages with `npx expo install <pkg>` so versions match the SDK.
- Don't invent backend endpoints. If a feature needs one, show it as "Coming soon" and say so.

## Verify
- `npm run typecheck` (or `npx tsc --noEmit`) after every change.
- `npx expo start --web` to check screens visually.
