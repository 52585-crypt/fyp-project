# RapidAssist Admin Panel

Web console for RapidAssist operators: verify provider documents, monitor service requests and moderate accounts.

Built with React 19, React Router 7 and Vite. No UI library — styles live in `src/styles/` (light + dark theme tokens in `theme.css`, components in `app.css`).

## Features

| Page | What you can do |
|---|---|
| **Dashboard** | KPIs (active requests, pending verifications, revenue, rating), 7-day request chart, service/status breakdowns, verification queue, recent requests. Auto-refreshes every 30 s while the tab is visible. |
| **Provider verification** | Filter by status/service, search by name or phone, view documents in a full-screen viewer, approve / reject (reason required) / move back to pending. Every decision records the admin and time. |
| **Service requests** | Filter by status/service, search by customer, provider, address or number plate, open a request to see people, price breakdown, review and full status timeline, cancel an active request (reason required). |
| **Users & providers** | Search all customers and providers, see request counts, suspend (reason required) or restore accounts. Suspended accounts cannot sign in and providers are taken offline. |

Also: real admin sign-in (httpOnly cookie), protected routes, session-expiry redirect, toasts, confirm dialogs, loading skeletons, empty states, keyboard support, dark mode toggle and a mobile layout.

## Setup

1. Start the API (`../server`) with `MONGODB_URI` and `JWT_SECRET` set.
2. Create an admin account (only once):

   ```bash
   cd ../server
   npm run create-admin -- --name "Admin" --phone 03001234567 --password "a-strong-password"
   ```

   Running it again with the same phone resets that admin's password.
3. Start the panel:

   ```bash
   npm install
   npm run dev
   ```

   Open http://localhost:5173 and sign in with the admin phone and password.

The panel calls the API on port 4000 of the same host by default. Set `VITE_API_BASE_URL` to point elsewhere. In production, set `CORS_ORIGIN` on the server to the panel's URL.

## Admin API (all under `/api/admin`)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ phone, password }`, admins only; sets the auth cookie |
| POST | `/auth/logout` | clears the cookie |
| GET | `/auth/me` | current admin |
| GET | `/dashboard` | stats, breakdowns, 7-day trend, queue, recent requests |
| GET | `/providers` | `status`, `category`, `search`, `page`, `limit` — no images in list |
| GET | `/providers/:id` | full profile with documents + recent jobs |
| PATCH | `/providers/:id/verification` | `{ status, note }` — note required for `rejected` |
| GET | `/users` | `role`, `status` (`active`/`blocked`), `search`, `page` |
| PATCH | `/users/:id/block` | `{ blocked, reason }` |
| GET | `/requests` | `status` (incl. `active`), `category`, `search`, `page` |
| GET | `/requests/:id` | full request with timeline |
| PATCH | `/requests/:id/cancel` | `{ reason }` |

Everything except login/logout requires an `admin` account.
