# RapidAssist Mobile Redesign: Plan and Claude Code Implementation Guide

This plan covers redesigning the RapidAssist mobile app (`rapidassist/mobile-app`) for
both the **customer** side and the **provider** side (mechanic, tow driver, fuel delivery).
It is split into small phases. Each phase ends with a ready-to-paste prompt for Claude Code,
so you can run one phase per session and review the result before moving on.

---

## 1. Where the app is today

### What works
- Expo Router app with role-based groups: `(auth)`, `(user)`, `(provider)`.
- Real backend integration: requests, accept, status updates, chat, reviews,
  extra-work approval, provider availability and live location, earnings.
- Maps (`LocationMapPicker`, `LocationMapPreview`), geocoding and routing services.

### Problems the redesign must fix

| Problem | Where | Effect |
|---|---|---|
| **Three different colour systems** | `src/theme/colors.ts` (blue), `src/constants/theme.ts` (purple), `src/ui/system.ts` (blue) | Screens look inconsistent; Paper theme is purple, custom UI is blue |
| **Fake bottom navigation** | `BottomNav` in `src/ui/components.tsx` uses `router.replace` + absolute positioning | No tab state, screen remounts on every tap, content hides behind the bar |
| **Huge single-file screens** | `request/index.tsx` (717 lines), `signup.tsx` (802), `tracking/index.tsx` (411), `(app)/request/create.tsx` (1045) | Hard to change, hard for AI tools to edit safely |
| **Whole service journey squeezed into one screen** | `tracking/index.tsx` (customer), `jobs/index.tsx` (provider) | No clear "what happens now" moment for each stage |
| **Dead / duplicate code** | `src/navigation/*` (React Navigation, not used by Expo Router), most of `src/screens/*` (stubs), `src/services/dummyApi.ts`, old `(app)` group, duplicate buttons (`CustomButton`, `RAButton`, `PrimaryButton`) and inputs | Confusing; Claude Code may edit the wrong file |
| **Font weights all 800–900** | everywhere | Everything shouts; no visual hierarchy |

### Target look
The mockups in `rapidassist/ui-images/` are the design reference. They use a deep indigo
primary colour, white cards, a big hero card on home, and a separate screen for each stage
of the journey.

> Note: the folder names are swapped. `ui-images/user side/` contains the **provider**
> mockups and `ui-images/provider side/` contains the **customer** mockups.

---

## 2. Design system (single source of truth)

All screens must use tokens from **one** file: `src/design/tokens.ts`.

### Colours
| Token | Value | Use |
|---|---|---|
| `primary` | `#2D0C9E` | Main buttons, active tab, hero cards, links |
| `primaryDark` | `#200579` | Pressed state, hero gradient end |
| `primarySoft` | `#EEE9FF` | Selected chips, info banners, icon backgrounds |
| `bg` | `#F7F7FB` | Screen background |
| `surface` | `#FFFFFF` | Cards, inputs, sheets |
| `surfaceMuted` | `#F4F2FA` | Secondary blocks, disabled inputs |
| `border` | `#E6E2EF` | Card and input borders |
| `text` | `#151124` | Headings and body |
| `muted` | `#6F6A7C` | Labels, captions |
| `success` / `successSoft` | `#16A34A` / `#DCFCE7` | Completed steps, earnings, online toggle |
| `warning` / `warningSoft` | `#F59E0B` / `#FEF3C7` | Pending approval, ratings star |
| `danger` / `dangerSoft` | `#DC2626` / `#FEE2E2` | Cancel, SOS, decline |

### Typography (Inter via `@expo-google-fonts/inter`)
| Style | Size / weight | Use |
|---|---|---|
| `display` | 28 / 700 | Hero amounts ("Rs. 6,030") |
| `h1` | 22 / 700 | Screen titles |
| `h2` | 17 / 600 | Section titles, card titles |
| `body` | 15 / 400 | Normal text |
| `bodyStrong` | 15 / 600 | Values in rows |
| `caption` | 12 / 500 | Labels, helper text |

### Spacing, radius, elevation
- Spacing: `4, 8, 12, 16, 20, 24, 32`. Screen side padding: `20`.
- Radius: `sm 10`, `md 14` (inputs, buttons), `lg 18` (cards), `xl 24` (hero, sheets), `pill 999`.
- One soft shadow for cards; hero cards use a shadow tinted with `primary`.
- Minimum touch target 48×48. Primary button height 54.

### Component kit (`src/design/components/`)
| Component | Notes |
|---|---|
| `Screen` | SafeArea + optional scroll + header slot; handles bottom inset under tabs |
| `Header` | Back arrow, centred title, optional right action (help, SOS) |
| `Button` | variants: `primary`, `secondary` (outline), `danger-outline`, `ghost`; `loading` state |
| `Input`, `Select`, `TextArea` | label, helper, error text, left icon |
| `Card`, `HeroCard` | HeroCard = indigo gradient card with illustration slot |
| `ListRow` / `InfoRow` | label left, value right (vehicle, location, fee lines) |
| `PriceBreakdown` | lines + divider + bold total in `primary` |
| `StatusTimeline` | vertical (customer "Trip Status") |
| `ProgressStepper` | horizontal (provider "Job Progress") |
| `PersonCard` | avatar, name, rating, vehicle/plate, call + chat buttons |
| `StatTile` | icon + value + label (dashboard stats) |
| `ServiceTile` | icon tile for home "Our Services" grid |
| `Chip` / `ChipGroup` | problem type selection |
| `Banner` | info / warning / success message strip |
| `EmptyState`, `Skeleton`, `ErrorState` | for every list and loading screen |
| `RatingStars` | input and display |
| `MapCard` | wraps existing `LocationMapPreview` with ETA / distance badges |
| `SuccessHero` | check icon, title, subtitle (arrived, job completed) |

---

## 3. New navigation structure

Use real Expo Router `Tabs` instead of the hand-made `BottomNav`.

```text
app/
  _layout.tsx                 # providers, fonts, splash
  index.tsx                   # role redirect
  (auth)/
    welcome.tsx  login.tsx  signup/ (role, details, documents, location steps)
  (user)/
    (tabs)/_layout.tsx        # Tabs: Home · Requests · Support · Profile
    (tabs)/home.tsx
    (tabs)/requests.tsx       # history + active request card on top
    (tabs)/support.tsx
    (tabs)/profile.tsx
    request/new/[service].tsx # service form (towing | fuel | mechanic)
    request/estimate.tsx      # price estimate + confirm
    request/[id]/index.tsx    # live journey (stage-driven, see below)
    request/[id]/chat.tsx
    request/[id]/pay.tsx
    request/[id]/review.tsx
    vehicles/index.tsx  vehicles/add.tsx
  (provider)/
    (tabs)/_layout.tsx        # Tabs: Dashboard · Jobs · Earnings · Inbox · Profile
    (tabs)/dashboard.tsx
    (tabs)/jobs.tsx
    (tabs)/earnings.tsx
    (tabs)/inbox.tsx
    (tabs)/profile.tsx
    incoming/[id].tsx         # new request: details, payout, accept / decline
    job/[id]/index.tsx        # active job (stage-driven)
    job/[id]/chat.tsx
    job/[id]/extra-work.tsx
    job/[id]/complete.tsx     # bill + payment method + mark completed
    verification.tsx
```

### Stage-driven journey screens
The backend already has detailed statuses (`src/requests/requests.types.ts`). Instead of one
route per stage, `request/[id]/index.tsx` and `job/[id]/index.tsx` poll the request and
render a **stage component** picked from the status. This keeps polling in one place and
makes each stage a small file.

| Backend status | Customer stage | Provider stage |
|---|---|---|
| `pending`, `searching_provider` | **Searching** (pulse animation, step list, cancel) | shown on dashboard as *Incoming request* |
| `provider_assigned` | **Provider Assigned** (big person card, ETA / distance / arriving, call · chat · share) | **Job Details** (customer, vehicle, map, fee breakdown, *Start Navigation*) |
| `provider_on_way` | **Live Tracking** (map, ETA badge, trip timeline, SOS) | **On The Way** (map, ETA header, progress stepper, *I've Arrived*) |
| `provider_arrived` | **Provider Arrived** banner on tracking | **Arrived** (success hero, *Start Inspection* / *Confirm Pickup* / *Start Delivery*) |
| `vehicle_loaded` (towing) | **Vehicle Picked Up** (illustration, destination, ETA) | **Towing In Progress** |
| `reached_destination` (towing) | **Reached Destination** (*Confirm Completion*, *Report an Issue*) | waiting for customer |
| `fuel_delivered` (fuel) | **Fuel Delivered** confirm | waiting for customer |
| `inspection_started` (mechanic) | **Inspection** in progress | **Inspection & Extra Work** form |
| `extra_work_requested`, `waiting_user_approval` | **Approve Extra Work** (items, photos, new total) | waiting for approval |
| `work_started`, `in_progress` | **Work In Progress** | **Work In Progress** (*Finish Service*) |
| `service_finished` | **Confirm & Pay** → `pay.tsx` | **Payment & Completion** |
| `completed` | **Review** → `review.tsx` | **Job Completed** (payout hero, summary, customer review) |
| `cancelled` | Cancelled state + *Back to Home* | Cancelled state |

Put the mapping in `src/requests/stages.ts` as a pure function
(`getCustomerStage(request)`, `getProviderStage(request)`) so it can be unit-tested.

### Backend gaps (do not fake silently)
Some mockup features have no backend support yet. Build the UI, but label it clearly or hide it:
- **Online payment** (Visa, EasyPaisa, JazzCash): no payment API. Show *Cash* as the only working
  option; show online methods as "Coming soon".
- **Request expiry countdown** ("Expires in 00:25"): no expiry field. Skip it, or add
  `expiresAt` to the backend in a separate task.
- **Share trip**: use React Native `Share` with a text message; no backend needed.
- **SOS**: open the phone dialler (`tel:15` / `tel:1122`) with a confirmation dialog.
- **Notifications bell**: no notifications API. Hide it until one exists.

---

## 4. Screen-by-screen redesign

### Customer side
1. **Welcome**: illustration, tagline, *Login*, *Create Account*, "Join as a provider" link.
2. **Login / Signup**: signup becomes a stepper (Role → Details → Documents → Location for
   providers; Role → Details for customers). Split the 802-line file into step components.
3. **Home**: greeting + current location row, indigo **HeroCard** "Need help for your vehicle?",
   **Our Services** grid (Tow Truck, Fuel Delivery, Mechanic, Battery Jump, Tyre Change, More),
   and an **active request card** at the top if a request is running.
4. **Service form** (`request/new/[service]`): vehicle (pick a saved vehicle or type one), problem
   chips, pickup location (current location by default), destination for towing,
   fuel type + litres for fuel, issue category for mechanic. Sticky *Get Estimate* button.
5. **Estimate**: map with route, pickup / drop-off, `PriceBreakdown`, note "Final fare may change",
   *Confirm Request*.
6. **Journey** (stage-driven, see table above).
7. **Chat**: bubbles, timestamps, sticky input, call button in the header.
8. **Payment**: bill summary, payment method radio cards, *Confirm Payment*.
9. **Review**: provider card, 5 stars, comment, helpful yes / no, *Submit Review*.
10. **Requests tab**: filters (Active / Completed / Cancelled), request cards with status pill.
11. **Profile**: avatar, details, *My Vehicles*, saved locations, help, logout.

### Provider side
1. **Dashboard**: greeting + **Online toggle**, current area + *Change Area*, 4 `StatTile`s
   (today's jobs, earnings, rating, acceptance rate), quick actions, **Incoming Request** card
   with *View* / *Accept*. If not verified, show a verification banner instead.
2. **Incoming request** (`incoming/[id]`): customer card, service, vehicle, pickup / drop-off,
   distance, issue summary, estimated payout, *Accept* / *Decline*.
3. **Job journey** (stage-driven): Job Details → On The Way → Arrived → Inspection / Towing /
   Delivery → Payment & Completion → Job Completed.
4. **Extra work**: findings text, list of items with prices (+ *Add Item*), photo upload,
   *Send for Approval*.
5. **Jobs tab**: Active / History segments.
6. **Earnings tab**: total hero, period switch (Today / Week / Month), list of completed jobs.
7. **Inbox tab**: list of chats per active / recent job.
8. **Profile**: verification status, service category, vehicle, documents, logout.
9. **Verification**: checklist of submitted documents with status pills.

---

## 5. Implementation phases for Claude Code

### How to work with Claude Code on this
1. **One phase per session.** Start each session with: *"Read `rapidassist/docs/mobile-redesign-plan.md`
   and `rapidassist/mobile-app/CLAUDE.md`, then do Phase N."*
2. **Use plan mode first** (Shift+Tab or ask "plan first") for phases 3–7, approve, then let it build.
3. **Ask it to verify**: run `npx tsc --noEmit` after every phase, and run the app on web
   (`npx expo start --web`) to take screenshots of the changed screens.
4. **Commit after each phase** on its own branch, so a bad phase is easy to revert.
5. **Keep the backend running** (`rapidassist/server`, `npm run dev`) with a demo customer and a
   demo mechanic account, so the journey screens can be tested end to end.
6. When a screen is wrong, attach the mockup image and say exactly what differs.

### Phase 0: Cleanup and guard rails (small)
**Goal:** remove dead code so Claude Code never edits the wrong file.
- Delete `src/navigation/`, the unused stubs in `src/screens/` (keep `common/RequestChatThread.tsx`),
  `src/services/dummyApi.ts`, `CustomButton`, `CustomInput`.
- Move the useful screens from `(app)/vehicles/*` into `(user)/vehicles/*`, then delete `(app)`.
- Check that `src/store` (Redux) is still needed; if only `AuthProvider` is used, remove Redux.
- Add `"typecheck": "tsc --noEmit"` to `package.json`.

> **Prompt:** "Do Phase 0 of `rapidassist/docs/mobile-redesign-plan.md`. Before deleting anything, grep
> for imports to prove it is unused. Run `npm run typecheck` at the end and list what you removed."

### Phase 1: Design tokens and fonts
- Create `src/design/tokens.ts` with the colours, type scale, spacing, radius and shadows from section 2.
- Install `@expo-google-fonts/inter` and `expo-font` with `npx expo install`; load the fonts in `app/_layout.tsx`.
- Point the Paper theme at the new tokens. Make `src/theme/colors.ts`, `src/constants/theme.ts` and
  `src/ui/system.ts` re-export from the tokens for now (temporary, removed in Phase 8).

> **Prompt:** "Do Phase 1 of the redesign plan. Use `npx expo install` for packages. Don't change any
> screen layout yet, only the token source. Typecheck at the end."

### Phase 2: Component kit
- Build every component in section 2 under `src/design/components/`, plus `index.ts` exporting them.
- Add a dev-only `app/(dev)/kit.tsx` screen that shows every component and variant, for visual review.

> **Prompt:** "Do Phase 2 of the redesign plan. Use only `src/design/tokens.ts` for styling. Keep each
> component in its own file, under ~150 lines. Build the `(dev)/kit` gallery screen, run on web and
> screenshot it."

### Phase 3: Navigation shell
- Create the `(tabs)` layouts for customer and provider with `Tabs` from `expo-router`, custom tab bar
  styled with tokens, and icons as in the mockups.
- Move the existing screens into the new routes from section 3 (logic unchanged).
- Remove `BottomNav` and every `screenBottomPadding` hack.
- Add a role guard in each group's `_layout.tsx` (customer can't open provider routes and vice versa).

> **Prompt:** "Plan, then do Phase 3 of the redesign plan. Keep all existing screen logic working, this
> phase is routing only. List every route that moved and update every `router.push` / `href`."

### Phase 4: Auth and onboarding
- Redesign Welcome and Login.
- Split `signup.tsx` into `signup/` step components with a progress indicator; keep the existing
  API calls and validation.

### Phase 5: Customer flow
Do in this order, one session each if needed:
1. **5a** Home + service grid + active request card.
2. **5b** Service form split per category + Estimate screen. Break up `request/index.tsx`; move
   pricing and validation helpers into `src/requests/`.
3. **5c** `stages.ts` mapping (+ unit tests with `jest-expo`) and the stage-driven
   `request/[id]/index.tsx` with Searching, Assigned, Live Tracking, Picked Up, Reached, Fuel
   Delivered, Approve Extra Work, Work In Progress and Cancelled stages.
4. **5d** Chat, Payment (cash only working), Review, Requests tab, Profile, Vehicles.

> **Prompt (5c example):** "Do Phase 5c of the redesign plan. First write `src/requests/stages.ts` with
> the status→stage table from section 3 and unit tests for every status and category. Then build the
> stage components using only `src/design/components`. Reuse the existing polling and API calls from
> `app/(user)/tracking/index.tsx`. Match `ui-images/provider side/` screens 4–8."

### Phase 6: Provider flow
1. **6a** Dashboard (online toggle, stats, incoming request card, verification banner).
2. **6b** Incoming request screen + accept / decline.
3. **6c** Stage-driven `job/[id]/index.tsx`: Job Details, On The Way, Arrived, Towing In Progress,
   Inspection, Work In Progress, Payment & Completion, Job Completed. Reuse the location-sync logic
   from `jobs/index.tsx`.
4. **6d** Extra work screen, Jobs tab, Earnings tab, Inbox tab, Profile, Verification.

### Phase 7: Polish
- Loading skeletons, empty states and error states with *Retry* on every data screen.
- Pull-to-refresh on lists. Haptics on primary actions (`expo-haptics`).
- Small animations: searching pulse, step transitions (`react-native-reanimated`, already in Expo).
- Accessibility: `accessibilityLabel` on icon buttons, contrast check, font scaling not breaking layouts.
- Test on a small Android screen (360 px wide) and an iPhone-sized screen.

### Phase 8: Final cleanup
- Delete `src/ui/`, `src/theme/`, `src/constants/theme.ts`, `RAButton`, `RATextInput` once nothing imports them.
- Delete the `(dev)` gallery or hide it behind `__DEV__`.
- Update `rapidassist/docs/` with new screenshots for the FYP report.

---

## 6. Definition of done (every phase)
- `npm run typecheck` passes with no new errors.
- The app starts with `npx expo start` and the changed screens open without red-box errors.
- No hard-coded colours, font sizes or spacing outside `src/design/tokens.ts`.
- No new screen file over ~300 lines; logic lives in hooks or `src/requests/*`.
- Customer → provider → customer journey still works against the real backend.
- One commit per phase with a clear message.

## 7. Suggested timeline
| Week | Phases |
|---|---|
| 1 | 0, 1, 2 |
| 2 | 3, 4 |
| 3 | 5a–5d |
| 4 | 6a–6d |
| 5 | 7, 8, report screenshots |
