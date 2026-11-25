# 10-minute demo: book in Blue Area → live tracking → card payment → review → admin heatmap

Everything runs on your laptop against the **local dev database**. Run the setup about 15 minutes before the
demo. The demo itself takes about 10 minutes.

The accounts, all created by `npm run demo:up` (local database only):

| Who | Sign in with | Password |
|---|---|---|
| Customer (app) | phone `03991000001` | `Demo#2026` |
| Provider (app) | phone `03991000002` | `Demo#2026` |
| Admin (admin panel) | email `demo-admin@rapidassist.local` | `DemoAdmin#2026` |

Stripe test card: `4242 4242 4242 4242`, any future expiry (e.g. `12/30`), any CVC (e.g. `123`).

## Setup: six terminals

Paths are from the repository root (`0-fyp-project/rapidassist`).

**Terminal 1 – MongoDB** (skip if it is already running; the payment step needs this replica set):

```bash
~/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6 --bind_ip 127.0.0.1 --port 27018 --replSet rapidassistDev \
  --dbpath ~/.local/share/rapidassist/dev-mongodb --logpath ~/.local/share/rapidassist/dev-mongodb/mongod.log --logappend
```

**Terminal 2 – Stripe webhooks** (forwards Stripe's test events to your local server):

```bash
stripe listen --events payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,payment_intent.processing \
  --forward-to localhost:4001/api/payments/stripe/webhook
```

Use the port your server prints in terminal 3 (4001 with `.env.development.local`). Leave it running.

**Terminal 3 – API server**, started with the webhook secret from `stripe listen` (an environment variable set in
the shell wins over the env files, so you do not need to edit `.env`):

```bash
cd server
STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret) npm run dev
```

**Terminal 4 – demo data** (leave running; it keeps the map providers fresh):

```bash
cd server
npm run demo:up
```

It prints the three accounts above.

**Terminal 5 – app on the web:**

```bash
cd mobile-app
npx expo start --web
```

The app talks to the API at `EXPO_PUBLIC_API_URL` in `mobile-app/.env`. Check that it points at this laptop and
port 4001 (if you changed Wi-Fi, the laptop's LAN IP may have changed).

**Terminal 6 – admin panel:**

```bash
cd admin-panel
VITE_API_BASE_URL=http://localhost:4001 npm run dev
```

If your server env sets `CORS_ORIGIN`, it must include `http://localhost:8081` (app) and `http://localhost:5173`
(admin). With no `CORS_ORIGIN` set, those two are allowed by default in development.

## Two browser windows, two fake locations

The customer and the provider must be **separate browser sessions**: open the customer in a normal Chrome window
and the provider in an **Incognito** window (each keeps its own login).

Your laptop has no GPS, so give each window a location with **Chrome DevTools → Sensors**:

1. In the window, press `F12` (or `Ctrl+Shift+I`) to open DevTools.
2. Press `Ctrl+Shift+P`, type `sensors`, choose **Show Sensors**.
3. Under **Location**, choose **Other…** and type the latitude and longitude:
   - customer: **Blue Area**, `33.7104`, `73.0563`;
   - provider: start at **F-7 Markaz**, `33.7205`, `73.0563` (about 1.1 km away).
4. Keep DevTools open in that tab. The fake location only applies to that tab.
5. When the browser asks for location permission, choose **Allow**.

To move the provider later, type new coordinates into the same Sensors box.

## The demo, minute by minute

**0:00 – Home map (customer window).** Sign in as the customer. Point out:
- the blue dot in Blue Area and demo providers around it (amber spanner = mechanic, pink truck = towing,
  green pump = fuel);
- tap a marker: name, rating, jobs done, distance **band** and "about N min". Explain that the position is snapped
  to a 500 m grid and no exact distance is sent (privacy, see `docs/map-and-dispatch.md` §4).

**1:30 – Provider goes online (incognito window).** Sign in as the provider (`03991000002`). On the dashboard,
switch **Online** on. It needs the fresh browser location from Sensors (F-7 Markaz).

**2:30 – Book (customer window).** Tap **Mechanic**:
- show the **Map | List** toggle (list sorted by distance band, then rating);
- keep the pickup in Blue Area and press **Confirm location**;
- choose a problem (e.g. Battery Jump), confirm the request. The screen shows "Searching".

**3:30 – Accept (provider window).** Within about 2 s the job offer appears with a 20 s countdown. Press
**Accept**. The customer screen switches to the assigned provider. Explain batch dispatch: every 2 s, within
8 km, scored 45 % distance, 25 % rating, 15 % experience, 15 % response speed.

**4:30 – Live tracking.** In the provider window press **Start Navigation**. On the web it opens Google Maps
directions in a new tab (on Android it opens the Maps app). Close that tab, then move the provider towards the
customer by changing Sensors in the provider window, one step every ~15 s:

| Step | Latitude, longitude | What the customer sees |
|---|---|---|
| 1 | `33.7180, 73.0563` | marker glides south, ETA updates (OSRM, at most every 30 s) |
| 2 | `33.7140, 73.0563` | ~400 m away: **"Your provider is nearby"** notification (bell badge, once only) |
| 3 | `33.7110, 73.0563` | almost there |

In the provider window press **I've Arrived**.

**6:30 – Service.** Provider: **Start Inspection** → **Start Repair** → finish the job (**Mark as Completed**).
Customer: **Confirm Completion**.

**7:30 – Card payment (customer window).** On the payment screen choose **Online Payment** → **Pay Now**, then
enter `4242 4242 4242 4242`, `12/30`, `123` and press **Confirm Card Payment**. Terminal 2 shows
`payment_intent.succeeded` and a `[200] POST …/webhook`. The status becomes **Stripe test payment succeeded**.

**8:30 – Review.** Press **Done** and rate the provider (stars and a comment).

**9:00 – Admin heatmap.** Open `http://localhost:5173`, sign in as the admin, then **Request heatmap**. Point out:
- red ~1 km cells show where requests come from; green bubbles show online providers;
- the server only ever sends cell counts, never a customer's pickup point;
- the "Request cells with no provider online" figure shows where more providers are needed.

**10:00 – Done.** Optional extra: on **Profile** switch the language to **اردو** to show the Urdu strings.

## If something goes wrong

| Symptom | Fix |
|---|---|
| No providers on the home map | Terminal 4 (`demo:up`) must be running; map providers vanish after 3 min without it |
| Provider cannot go online | Set the provider tab's location in Sensors (inside Islamabad/Rawalpindi), allow location, retry |
| No offer reaches the provider | Provider online and within 8 km of the pickup? The map-only demo providers never get offers |
| Card payment stays "processing" | Terminal 2 must be running, and terminal 3 must have been started with `$(stripe listen --print-secret)` |
| "Stripe … requires a MongoDB replica set" | Start MongoDB as in terminal 1 (`--replSet rapidassistDev`) |
| ETA shows "About …" | The public OSRM server did not answer; the straight-line estimate is shown instead, which is fine |

## After the demo

Stop the terminals with `Ctrl+C`. To remove the map providers: `cd server && node scripts/seedDemoProviders.js --remove`.
The three demo accounts can stay; `npm run demo:up` resets their passwords each time.
