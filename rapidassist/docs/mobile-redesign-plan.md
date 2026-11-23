# RapidAssist mobile redesign plan

Scope: `rapidassist/mobile-app` (Expo Router + TypeScript), customer side and
provider side (mechanic, tow driver, fuel delivery), on **Android and Expo Web**.
Working rules: `mobile-app/CLAUDE.md`.

Mockups: `ui-images/provider side/` = **customer** screens (towing, fuel,
mechanic flows); `ui-images/user side/` = **provider** screens (mechanic, fuel
rider, tow driver workflows).

## Progress

| Phase | Status |
|---|---|
| 0. Cleanup | in progress |
| 1. Tokens & fonts | todo |
| 2. Component kit + gallery | todo |
| 3. Navigation (tabs, guards) | todo |
| 4. Auth redesign | todo |
| 5. Customer flow | todo |
| 6. Provider flow | todo |
| 7. Polish | todo |
| 8. Final cleanup | todo |

## Current problems (measured 2026-11-23)

1. **Three overlapping theme layers.** `src/theme/tokens.ts` (green "Highway"
   brand), `src/ui/system.ts` (re-maps it), `src/constants/theme.ts` and
   `src/theme/colors.ts` (re-map again with their own spacing/radii). None
   match the indigo mockups.
2. **Hard-coded styling.** 90 hex colours across 20 `.tsx` files; 195
   `fontWeight: "800"/"900"` usages; system fonts instead of Inter.
3. **Oversized screens.** `signup.tsx` 1335 lines, `(app)/request/create.tsx`
   986, `provider/dashboard.tsx` 602, `user/request/index.tsx` 598,
   `user/tracking/index.tsx` 514 — business logic mixed with layout.
4. **Fake navigation.** Bottom tabs are hand-drawn `BottomNav` /
   `BottomNavigation` components that `router.push`, rebuilt in 18 places; no
   real tab state, back-stack resets on every tab tap.
5. **Duplicate route trees.** `(app)` duplicates `(user)` (home, request
   create); `src/navigation/` + `src/screens/*` are unused React Navigation
   stubs; `dummyApi.ts`, `CustomButton`, `CustomInput` are dead.
6. **Status logic scattered.** Each screen interprets `request.status`
   strings itself; no single place says which screen a status shows.
7. **Two component kits.** `src/ui/components.tsx` and
   `src/ui/customer/components.tsx` both export `PrimaryButton`, cards,
   badges with different looks.

## Design tokens (`src/design/tokens.ts`)

| Group | Tokens |
|---|---|
| colour | primary `#2D0C9E`, primaryDark `#200579`, primarySoft `#EEE9FF`, bg `#F7F7FB`, surface `#FFFFFF`, border `#E6E2EF`, text `#151124`, muted `#6F6A7C`, success `#16A34A`, warning `#F59E0B`, danger `#DC2626`, plus soft tints (successSoft, warningSoft, dangerSoft), onPrimary, overlay |
| font | Inter 400 `regular`, 500 `medium`, 600 `semibold`, 700 `bold` (each a loaded face) |
| type scale | display 26/32, title 20/26, headline 17/22, body 15/21, bodySmall 13/18, caption 12/16, micro 11/14 |
| space | 4, 8, 12, 16, 20 (screen padding), 24, 32 |
| radius | sm 10, md 14, card 18, pill 999 |
| size | button 54, input 52, icon tile 44, avatar 48, tabBar 64, touch min 48 |
| shadow | card (subtle), raised (hero/sheet) |

## Component kit (`src/design/components/`)

Screen, Header, Button (primary / outline / danger-outline / ghost), Input,
Select, TextArea, Card, HeroCard, InfoRow, PriceBreakdown, StatusTimeline,
ProgressStepper, PersonCard, StatTile, ServiceTile, ChipGroup, Banner,
EmptyState, Skeleton, ErrorState, RatingStars, MapCard, SuccessHero.
Gallery: `app/(dev)/kit.tsx` (only reachable in `__DEV__`).

## New route structure

```
app/
  _layout.tsx                 root providers + fonts
  index.tsx                   role redirect
  (auth)/ welcome, login, signup (wizard), complete-profile
  (user)/                     role guard: customer
    (tabs)/ _layout (Tabs) home, requests, support, profile
    request/new/[service].tsx service form (car_towing | fuel_delivery | mechanic)
    request/estimate.tsx      price estimate + confirm (creates request)
    request/[id].tsx          stage-driven live request
    chat/[id].tsx  pay/[id].tsx  review/[id].tsx
    vehicles/index.tsx  vehicles/add.tsx
  (provider)/                 role guard: mechanic
    (tabs)/ _layout (Tabs) dashboard, jobs, earnings, inbox, profile
    incoming/[id].tsx         offer: Accept / Decline
    job/[id].tsx              stage-driven active job
    job/extra-work/[id].tsx   mechanic extra work request
    chat/[id].tsx  verification/index.tsx
  (dev)/ kit.tsx, map-foundation.tsx   __DEV__ only
```

Legacy URLs (`/tracking`, `/history`, `/request`, `/jobs`, `/requests/:id`)
redirect to the new routes so notification deep links keep working.

## Status → stage mapping (`src/requests/stages.ts`)

Backend transitions (`server/src/controllers/requests.controller.js`):
`provider_assigned → provider_on_way → provider_arrived → (towing:
vehicle_loaded → reached_destination | fuel: fuel_delivered | mechanic:
inspection_started → [extra_work_requested →] work_started) → service_finished
→ completed` (customer confirms). Either side may cancel before close.

### Customer — `getCustomerStage(request)`

| Status | Stage | Screen content |
|---|---|---|
| pending, searching_provider (dispatch searching/offered) | `searching` | Pulse, progress checklist, Cancel |
| searching_provider (dispatch unavailable) | `no_provider` | Retry search / Cancel |
| provider_assigned | `assigned` | Provider hero, ETA/distance tiles, Call/Chat/Share, Track |
| provider_on_way | `tracking` | Map, provider card, timeline, SOS, Cancel |
| provider_arrived | `arrived` | "Provider has arrived" success hero |
| vehicle_loaded | `vehicle_picked_up` | Tow illustration, destination, ETA |
| reached_destination | `reached_destination` | Waiting for driver to finish |
| fuel_delivered | `fuel_delivered` | Fuel delivered, waiting for finish |
| inspection_started, work_started, in_progress, waiting_user_approval | `in_progress` | Work in progress timeline |
| extra_work_requested | `approve_extra_work` | Extra work lines, old/new total, Reject / Approve |
| service_finished | `confirm_completion` | Confirm completion (→ completed) |
| completed | `completed` | Pay (cash) → Review |
| cancelled | `cancelled` | Cancelled state, Book again |

### Provider — `getProviderStage(request)`

| Status | Stage | Primary action |
|---|---|---|
| (open offer, not assigned) | `incoming` | Accept / Decline (`incoming/[id]`) |
| provider_assigned | `job_details` | Start Navigation → provider_on_way |
| provider_on_way | `on_the_way` | Arrived → provider_arrived |
| provider_arrived | `arrived` | towing: Confirm pickup → vehicle_loaded; fuel: Start delivery (local safety checklist) → fuel_delivered; mechanic: Start inspection → inspection_started |
| inspection_started | `inspection` | Request extra work / Continue → work_started |
| extra_work_requested | `awaiting_approval` | Waiting for customer |
| vehicle_loaded, work_started, in_progress | `in_progress` | towing: Reached destination; else Finish work → service_finished |
| reached_destination, fuel_delivered | `payment_completion` | Bill, Cash, Mark as completed → service_finished |
| service_finished | `awaiting_customer` | Waiting for customer confirmation |
| completed | `job_completed` | Payout card, cash collected, review, Back to dashboard |
| cancelled | `cancelled` | Back to dashboard |

## "Coming soon" (no backend route)

Online payment (UI shows Cash only), push-notification settings, support chat,
extra-work photo upload, delivered-quantity edits, provider wallet, change
service area, acceptance rate. In-app notification inbox stays real
(`/api/notifications`).

## Phases

0. **Cleanup** — delete `src/navigation`, stub `src/screens/*` (keep
   `common/RequestChatThread.tsx`), `dummyApi`, `CustomButton`, `CustomInput`;
   move `(app)/vehicles` → `(user)/vehicles`, remove `(app)`; add `typecheck`
   script.
1. **Tokens & fonts** — `src/design/tokens.ts`, load Inter, Paper theme from
   tokens, old theme files re-export tokens.
2. **Component kit** + `(dev)/kit.tsx` gallery.
3. **Navigation** — expo-router `Tabs` for both roles, role guards, links.
4. **Auth** — Welcome, Login; signup wizard (customer: Role → Details;
   provider: + Service category → Documents → Location).
5. **Customer flow** — home, request form + estimate, `stages.ts` + jest-expo
   tests, stage-driven `request/[id]`, chat/pay/review, Requests, Profile,
   Vehicles.
6. **Provider flow** — dashboard, incoming offer, `getProviderStage` + tests,
   stage-driven `job/[id]`, extra work, Jobs/Earnings/Inbox/Profile,
   Verification.
7. **Polish** — skeletons, empty/error + Retry, pull-to-refresh, haptics,
   searching pulse, a11y labels, 360px layouts.
8. **Final cleanup** — delete `src/ui`, `src/theme`, `constants/theme.ts`,
   `RAButton`, `RATextInput`; dev kit behind `__DEV__`; no stray hex.

After each phase: `npx tsc --noEmit`, tests, commit. After 2/4/5/6/7: web
screenshots (Playwright) compared with mockups.

## Platform notes

Shared: all of `src/design`, `src/requests/stages.ts`, screens. Platform
files kept: maps (`*.native.tsx` / `*.web.tsx`), Google sign-in, Stripe root,
print invoice. Haptics are no-ops on web. SOS uses `tel:` links (dialer on
Android, `tel:` handler on web).
