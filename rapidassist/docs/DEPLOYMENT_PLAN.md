# RapidAssist — Project Analysis & Deployment Plan

_Tayyar ki gayi: 25 Nov 2026_

---

## 1. Project ka overview (analysis)

RapidAssist ek roadside-assistance platform hai (mechanic, fuel delivery, car towing). Repo mein ye hisse hain:

| Folder | Kya hai | Tech | Status |
|---|---|---|---|
| `rapidassist/server` | **Main backend API** (mobile app + admin panel isi se baat karte hain) | Node.js, Express 4, MongoDB (Mongoose 8), JWT + httpOnly cookie, CommonJS | Deploy karna hai |
| `rapidassist/admin-panel` | Admin dashboard + provider verification | React 19, Vite 8, React Router 7, Axios | Deploy karna hai |
| `rapidassist/mobile-app` | Customer + provider app | Expo SDK 54, React Native 0.81, Expo Router, Redux Toolkit | APK / store build banana hai |
| `rapidassist/RA/server` | Purana / alag backend (orders, Cloudinary uploads, face-api + Tesseract identity check) | ESM, tfjs, canvas, sharp | **Mobile/admin is ko use nahi karte** — deploy nahi karna (sirf Cloudinary code reuse karein) |
| `rapidassist/docs` | API & module docs | Markdown | — |

### Main backend ke endpoints
- `GET /health`
- `/api/auth` — register, login, me, logout (phone + password, bcrypt, JWT 7d)
- `/api/vehicles` — CRUD (auth required)
- `/api/requests` — request create, open requests, accept, status flow, chat messages, review, extra-work, provider location/availability/earnings (auth required)
- `/api/admin` — dashboard stats, providers list, provider verification

### Architecture
```
 [Mobile App (Expo APK)] ──HTTPS──┐
                                  ├──> [Express API (server/)] ──> [MongoDB Atlas]
 [Admin Panel (Vite SPA)] ─HTTPS──┘
```
- Real-time features (tracking, chat, provider location) **polling** (`setInterval`) se chal rahe hain. `socket.io-client` mobile mein install hai lekin server par Socket.IO nahi hai — deployment ke liye theek hai, kuch extra nahi chahiye.
- Kuch screens abhi bhi `src/services/dummyApi.ts` ka demo data dikhati hain (LiveTracking, DriverAssigned, PriceEstimate, ReviewRating, MechanicAssigned).

---

## 2. Deploy se PEHLE zaroori fixes (blockers)

> In ke baghair public deploy karna **unsafe** hai ya app chalegi hi nahi.

### 🔴 B1 — Admin API bilkul open hai (CRITICAL security)
- `server/src/app.js:44` → `app.use("/api/admin", adminRoutes)` par **koi auth middleware nahi**.
- `admin-panel/src/pages/AdminLogin.jsx:19` login sirf `/health` call karta hai — koi bhi email/password se login ho jata hai.
- Matlab internet par koi bhi `/api/admin/dashboard` dekh sakta hai aur `PATCH /api/admin/providers/:id/verification` se kisi bhi mechanic ko verify kar sakta hai, aur saare users ke phone + CNIC/selfie images le sakta hai.

**Fix:**
1. `User` model ke `USER_ROLES` mein `"admin"` add karein.
2. `requireAdmin` middleware banayein (`requireAuth` + `req.user.role === "admin"`), aur `app.use("/api/admin", requireAuth, requireAdmin, adminRoutes)`.
3. Admin account ke liye ek seed script (`npm run seed:admin`) jo env se phone/password le. Public `/register` se `role: "admin"` **block** karein.
4. Admin panel login ko real `POST /api/auth/login` se jorein aur role check karein; protected routes par `/api/auth/me` check.

### 🔴 B2 — Mobile app ka API URL hard-coded `http://<host>:4000`
- `mobile-app/src/config/api.ts:22-31` — production APK mein ye kaam nahi karega.

**Fix:** env variable use karein:
```ts
const envUrl = process.env.EXPO_PUBLIC_API_URL;
export const API_BASE_URL = envUrl || computeBaseUrl();
```
Phir `app.json` mein `"usesCleartextTraffic": true` hata dein (HTTPS use hoga).

### 🔴 B3 — CORS + cookies cross-domain
- `server/src/app.js:19` — agar `CORS_ORIGIN` khali ho to **har origin credentials ke saath allowed** hai. Production mein `CORS_ORIGIN` lazmi set karein.
- Admin panel (e.g. `*.vercel.app`) aur API (e.g. `*.onrender.com`) alag domains par honge, is liye cookie ke liye `AUTH_COOKIE_SAMESITE=none` aur `AUTH_COOKIE_SECURE=true` chahiye. (Ya behtar: admin panel bhi mobile ki tarah `Authorization: Bearer <token>` use kare.)

### 🟠 B4 — Images base64 mein MongoDB ke andar save ho rahi hain
- Mechanic signup par 3–6 images (har ek ~2.5 MB tak) seedha User document mein jaati hain, aur JSON limit 12 MB hai.
- MongoDB Atlas free tier (M0) sirf **512 MB** hai → ~50–100 mechanics ke baad bhar jayega, aur admin list queries bhi slow hongi.

**Fix (recommended):** Cloudinary (free tier) par upload karein aur DB mein sirf URL rakhein. `RA/server/src/controllers/uploadController.js` mein Cloudinary ka code pehle se mojood hai — wahan se reuse karein. FYP demo ke liye short-term mein chal sakta hai, lekin admin list queries mein images `select` se exclude karein.

### 🟡 B5 — Repo cleanup
Ye files git mein commit hain jab ke `.gitignore` inhein ignore karta hai:
```
rapidassist/server/backend.log, backend.err.log, backend-admin.log
rapidassist/mobile-app/expo-mobile*.log
rapidassist/ui-images/provider side/Format for Report (1) (1).docx
```
`git rm --cached` karke hata dein. `git-date-test/` folder aur 300 "test: local git date experiment" commits bhi FYP evaluation mein achay nahi lagte — kam az kam folder hata dein.

### 🟡 B6 — Basic hardening (jaldi ho jata hai)
- `helmet` aur `express-rate-limit` (khaas kar `/api/auth/login` aur `/register` par).
- `JWT_SECRET` lamba random (`openssl rand -hex 32`).
- Production mein `morgan("combined")`.
- `package.json` mein `"engines": { "node": ">=20" }`.

---

## 3. Recommended hosting (student / free-tier friendly)

| Component | Service | Plan | Kyun |
|---|---|---|---|
| Database | **MongoDB Atlas** | M0 Free (512 MB) | Pehle se Atlas use ho raha hai |
| Backend API | **Render** Web Service | Free (ya Starter $7/mo demo ke din ke liye) | Git push se auto-deploy, free HTTPS |
| Admin Panel | **Vercel** (ya Netlify) | Hobby Free | Vite SPA ke liye best, free HTTPS + CDN |
| Images | **Cloudinary** | Free | Fix B4 ke liye |
| Mobile App | **Expo EAS Build** | Free tier | Android APK seedha phone par install |

> ⚠️ Render free tier 15 minute idle ke baad so jata hai; pehli request par ~30–60 sec lagte hain. Mobile app ka timeout 60s hai to chal jayega, lekin **FYP demo / viva wale din** ya to Starter plan le lein, ya demo se 5 min pehle `/health` khol kar server jaga lein. (Alternative: Railway ~$5/mo, sleep nahi hota.)

---

## 4. Step-by-step deployment

### Step 0 — Branch & fixes
1. Section 2 ke B1–B3 fixes ek branch par karein, local test karein, `main`/`dev` mein merge karein.

### Step 1 — MongoDB Atlas
1. Cluster (M0) → Database `rapidassist`.
2. **Database Access:** naya user (sirf `readWrite` on `rapidassist`), strong password.
3. **Network Access:** `0.0.0.0/0` (Render free ke IPs fixed nahi hote). Strong password zaroori hai.
4. Connection string copy karein: `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/rapidassist?retryWrites=true&w=majority`

### Step 2 — Backend on Render
1. Render → New → **Web Service** → GitHub repo connect.
2. Settings:
   - **Root Directory:** `rapidassist/server`
   - **Runtime:** Node 20
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
3. Environment variables:
   ```
   NODE_ENV=production
   MONGODB_URI=<atlas string>
   JWT_SECRET=<64-char random>
   JWT_EXPIRES_IN=7d
   CORS_ORIGIN=https://rapidassist-admin.vercel.app
   AUTH_COOKIE_SAMESITE=none
   AUTH_COOKIE_SECURE=true
   JSON_BODY_LIMIT=12mb
   ```
   (`PORT` Render khud deta hai — code `process.env.PORT` already use karta hai.)
4. Deploy → check: `https://<your-api>.onrender.com/health` → `{"ok":true,...}`
5. Admin seed: Render **Shell** mein `npm run seed:admin` (B1 fix ke baad).

### Step 3 — Admin Panel on Vercel
1. Vercel → New Project → same repo.
2. **Root Directory:** `rapidassist/admin-panel`, Framework: **Vite**, Build: `npm run build`, Output: `dist`.
3. Env: `VITE_API_BASE_URL=https://<your-api>.onrender.com`
4. React Router ke liye SPA rewrite — `admin-panel/vercel.json`:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```
   (Netlify par `public/_redirects` mein: `/*  /index.html  200`)
5. Deploy ke baad Vercel URL ko Render ke `CORS_ORIGIN` mein daal kar redeploy.

### Step 4 — Mobile App (Android APK) via EAS
1. `app.json` mein proper naam/ids set karein:
   ```json
   "name": "RapidAssist",
   "slug": "rapidassist",
   "android": { "package": "pk.rapidassist.app", ... },
   "ios": { "bundleIdentifier": "pk.rapidassist.app", ... }
   ```
2. Install & login:
   ```bash
   npm install -g eas-cli
   ```
   ```bash
   cd rapidassist/mobile-app && eas login && eas build:configure
   ```
3. `eas.json` mein `preview` profile APK ke liye:
   ```json
   {
     "build": {
       "preview": {
         "distribution": "internal",
         "android": { "buildType": "apk" },
         "env": { "EXPO_PUBLIC_API_URL": "https://<your-api>.onrender.com" }
       },
       "production": {
         "env": { "EXPO_PUBLIC_API_URL": "https://<your-api>.onrender.com" }
       }
     }
   }
   ```
4. Build:
   ```bash
   eas build -p android --profile preview
   ```
   Build complete hone par link/QR milega — APK download karke phone par install karein.
5. (Optional) Play Store: `eas build -p android --profile production` (AAB) + `eas submit` — Google Play developer account $25 one-time.
6. Baad ke JS-only changes ke liye: `eas update` (OTA) — dobara APK nahi banana parta.

### Step 5 — Smoke test (deploy ke baad checklist)
- [ ] `/health` OK
- [ ] Admin login sirf admin account se hota hai; galat password reject
- [ ] Bina login `GET /api/admin/dashboard` → **401**
- [ ] APK se customer signup/login
- [ ] Mechanic signup images ke saath (timeout na ho)
- [ ] Admin panel se mechanic verify
- [ ] Mechanic online → customer request create → mechanic accept → status flow → chat → complete → review
- [ ] Admin dashboard stats update hon

---

## 5. Post-deployment (optional lekin achha hai)
- **CI:** GitHub Actions — admin panel `npm run lint && npm run build`, server `node --check`. Render/Vercel auto-deploy on push to `main`.
- **Monitoring:** UptimeRobot (free) `/health` ping har 5–10 min (isse Render free bhi kam sota hai).
- **Backups:** Atlas M0 mein automatic backup nahi — demo se pehle `mongodump` le lein.
- **Logs:** Render dashboard logs; errors ke liye Sentry free tier.
- **Custom domain** (optional): `api.rapidassist.pk` → Render, `admin.rapidassist.pk` → Vercel.

---

## 6. Timeline (suggested)

| Din | Kaam |
|---|---|
| 1 | B1 admin auth + B2 mobile env URL + B3 CORS/cookie |
| 2 | B4 Cloudinary images (ya demo ke liye postpone) + B5 cleanup + B6 hardening |
| 3 | Atlas + Render + Vercel setup, smoke test |
| 4 | EAS APK build, phones par end-to-end test, bugs fix |
| 5 | Demo data seed, UptimeRobot, final rehearsal |

## 7. Cost summary
- Sab free tier par: **Rs 0** (Render sleep ke saath).
- Demo month mein smooth chalane ke liye: Render Starter **~$7/mo**.
- Play Store publish karna ho to: **$25 one-time**.
