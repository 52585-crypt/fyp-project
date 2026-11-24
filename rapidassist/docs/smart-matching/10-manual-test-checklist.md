# Smart Matching — Manual Android Test Checklist

A short manual check of the `SMART_MATCHING_ENABLED` flag on real Android devices or emulators. The client app is unchanged, so this checks that the existing flow still behaves correctly when the server decides offers with the smart engine. Record **Pass / Fail / Notes** for each step.

## Setup

- [ ] **Server:** local dev MongoDB running. Start the server with the flag on:
  ```
  cd rapidassist/server
  SMART_MATCHING_ENABLED=true npm run dev
  ```
- [ ] **App:** `cd rapidassist/mobile-app && npx expo start`, with `EXPO_PUBLIC_API_URL` pointing at the server's LAN address.
- [ ] **Devices:** two Android devices or emulators: **A = customer**, **B1 = provider 1**. A third, **B2 = provider 2**, is needed for the re-offer step.
- [ ] **Providers B1 and B2:** verified accounts with service category **mechanic**, location permission granted, and both physically or emulated **within 8 km** of the pickup. B1 should be closer than B2.

## 1. Enable and verify

- [ ] Server log shows no `invalid config` error and no `WARNING: could not build MongoDB index` line.
- [ ] B1 and B2: open the provider dashboard and **go online**. No location error banner appears within about 20 s, because a GPS fix is sent every 10 s.

## 2. Create a request (customer A)

- [ ] Home → choose **Mechanic** → set the pickup pin within 8 km of both providers → choose the problem → confirm and book.
- [ ] A shows the searching state.
- [ ] Within about 2–4 s the server log shows a `[matching] batch … mechanic: … planned 1, offers created 1, failed 0` line. If it shows the old solver instead, the flag isn't on.
- [ ] **B1** (the closer provider) receives the incoming offer, with a 20 s countdown, **ACCEPT DISPATCH** and **DECLINE**.
- [ ] B2 receives no offer at the same time (one pending offer per request).

## 3. Decline → re-offer

- [ ] On B1, tap **DECLINE**. The offer closes and B1 returns to the dashboard.
- [ ] Within about 2–4 s, **B2** receives the offer.
- [ ] **B1 never receives this request again**, even after waiting a minute.
- [ ] *(Variant, single provider)* If only B1 is online and declines, nobody gets an offer. After 180 s, A shows "no provider" with **Retry search**.
- [ ] *(Variant, expiry)* If B2 lets the countdown run out, the offer disappears on B2 and the request goes to the next eligible provider, or keeps searching.

## 4. Accept

- [ ] On B2, tap **ACCEPT DISPATCH**. B2 opens the job screen.
- [ ] A switches from searching to the assigned or tracking state and shows the provider's name and rating.
- [ ] A double tap on ACCEPT (or accepting on two devices at once) leaves exactly **one** assigned provider.

## 5. Tracking

- [ ] A's tracking map shows B2's live position moving, updating at least every 10 s.
- [ ] B2 advances the status: **on the way → arrived**. A shows "Your provider has arrived at the pickup point."
- [ ] Continue to **inspection started → work started → service finished**. A confirms completion. The job shows as completed on both devices.
- [ ] *(Optional, admin API)* `GET /api/admin/active-jobs` during the job: `matchingDecision.explanation` starts with "Selected by smart matching (Hungarian assignment per service category; …".

## 6. Cancel during search

- [ ] Create a new request on A, and keep the providers offline or out of range so the search continues.
- [ ] On A, tap **Cancel Request**, then **Cancel request** in the confirmation. A shows the request as cancelled.
- [ ] Bring a provider online. That provider **never** receives the cancelled request.
- [ ] *(Race)* Create a request, and while B1 holds the offer, cancel on A. B1's offer disappears and tapping **ACCEPT DISPATCH** shows an error rather than a job. A stays cancelled.

## 7. Disable (rollback)

- [ ] Stop the server and start it **without** the flag: `npm run dev`.
- [ ] Repeat a short version of steps 2 and 4 (create, accept). Offers still arrive and accept works, and the server log shows **no** `[matching]` lines (the existing solver is in use).
- [ ] *(Optional)* Check that an offer created in this run has `algorithmVersion: "batch-mincost-v1"`:
  ```
  mongosh "mongodb://127.0.0.1:27018/rapidassist_dev?directConnection=true" --eval 'db.dispatchoffers.find({}, {algorithmVersion:1}).sort({offeredAt:-1}).limit(1)'
  ```
- [ ] A smart offer left pending while the server restarted can still be accepted or declined normally, or it simply expires.

## Result

| Area | Pass/Fail | Notes |
|---|---|---|
| 1 Enable | | |
| 2 Create request | | |
| 3 Decline → re-offer | | |
| 4 Accept | | |
| 5 Tracking | | |
| 6 Cancel during search | | |
| 7 Disable | | |

Tested by: ____ · Date: ____ · Devices / Android versions: ____ · Server commit: ____
