# RapidAssist: Monetization (Implemented)

**Model:** commission per job + customer service fee + provider wallet (cash dues system)

> The mobile app and admin panel talk to `rapidassist/server` (`/api/requests`, `/api/admin`).
> All backend work is in that server, **not** in `RA/server`.

---

## 1. Business rules (defaults, editable from Admin → Revenue)

| Service | Commission | Commission is taken from | Customer service fee |
|---|---|---|---|
| Car towing | 15% | base towing fee + distance charge | PKR 250 |
| Fuel delivery | 20% | delivery fee only (fuel cost is passed through) | PKR 150 |
| Mechanic | 15% | inspection + visit fee + approved extra work | PKR 100 |

- **Provider dues limit:** PKR 2,000. Above this, the provider cannot accept new jobs.
- **Minimum dues payment:** PKR 100.
- The rate is **snapshotted on each request** when it is created. Changing the settings only affects new requests.

Defaults live in `server/src/config/monetization.js`. Admin overrides are stored in the `PlatformSettings` collection.

### Formulas (`server/src/services/monetization.service.js`)

```
platformFee     = "Service fee" line (paid by customer, 100% platform)
commission      = commissionBase x commissionRate
providerEarning = total - platformFee - commission
platformRevenue = commission + platformFee
```

**Example (mechanic, extra work PKR 2,000 approved):**
bill 3,350, commission 488 (15% of 3,250), service fee 100. The provider keeps **2,762** and the platform gets **588**.

### Cash flow

The customer pays the full bill in cash to the provider. When the customer marks the job **completed**, the platform share (`platformRevenue`) is debited from the provider's wallet, which then has a negative balance (dues). The provider pays the dues by JazzCash, Easypaisa or bank transfer and submits the transaction ID. Admin approves it, and the wallet is credited. If the provider was blocked, they are unblocked.

---

## 2. What was built

### Backend (`rapidassist/server`)

| File | Purpose |
|---|---|
| `src/config/monetization.js` | Default rates, fees and limits |
| `src/models/PlatformSettings.js` | Admin-editable monetization settings |
| `src/models/ProviderWallet.js` | One wallet per provider: balance, earned, paid, isBlocked |
| `src/models/WalletTransaction.js` | `commission_debit`, `topup_credit`, `adjustment`. A unique `(requestId, type)` index means a job is charged only once |
| `src/models/ServiceRequest.js` | Price lines now have a `kind`; new `settlement` sub-document |
| `src/services/monetization.service.js` | Settings, settlement math, recalculation after extra work |
| `src/services/wallet.service.js` | Settle completed job, block/unblock, dues payments, admin review |
| `src/controllers/requests.controller.js` | Service fee line on every estimate, settlement on create, recalculation on extra work, settlement on completion, blocked providers cannot accept jobs and are hidden from customers, earnings are net of the platform share |
| `src/routes/wallet.routes.js` | Provider wallet API |
| `src/routes/admin.routes.js` | Revenue, wallets, dues payments, settings, and extra stats on the dashboard |

Fixes made along the way:
- Rejected mechanic extra work used to stay in the bill total. It is now removed.
- A second extra-work request used to be added on top of the first one. It now replaces the first.

### API

| Method | Route | Who |
|---|---|---|
| GET | `/api/wallet/me` | provider: wallet summary + last 20 transactions |
| GET | `/api/wallet/transactions?page=` | provider |
| POST | `/api/wallet/topup` `{ amount, method, reference, proofImage? }` | provider |
| GET | `/api/requests/provider/earnings` | provider: now net earnings + `wallet` |
| GET | `/api/admin/revenue` | admin: today/7d/30d/all-time, by service, last 14 days, recent commissions |
| GET | `/api/admin/wallets?filter=dues\|blocked\|all` | admin |
| GET | `/api/admin/topups?status=pending\|approved\|rejected\|all` | admin |
| PATCH | `/api/admin/topups/:id` `{ decision: "approve"\|"reject" }` | admin |
| GET/PATCH | `/api/admin/settings/monetization` | admin |

### Admin panel

- **Revenue** page (`/revenue`): revenue cards, revenue by service, a 14-day chart, recent commission entries, and the settings form.
- **Provider Dues** page (`/payouts`): pending payments with a screenshot preview and Approve/Reject buttons, and provider wallets filtered by dues or blocked status.
- **Dashboard:** "Platform revenue" and "Provider dues" cards, and an alert when payments are waiting.

### Mobile app

- **Provider → Earnings:** net earnings, wallet and dues, a Pay Dues form (method, transaction ID, optional screenshot), and wallet history.
- **Provider → Dashboard:** a dues banner. It turns red ("New jobs paused") when the provider is blocked.
- **Provider → Request details:** shows "RapidAssist share" and "Your earning".
- **Customer → Request:** the estimate text shows the service fee. The mechanic estimate is now PKR 1,350.

---

## 3. Testing

Commission math was verified for mechanic (approved and rejected extra work), fuel, towing, and legacy requests that have no line kinds.

Full end-to-end test against a real MongoDB:

```bash
cd rapidassist/server
MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:monetization
```

The test uses its own `rapidassist_monetization_test` database and drops it at the end. It checks:
- Commission per service, and that extra work is handled correctly
- Completing a job twice charges the commission only once
- A provider is blocked above the limit: no open jobs, `accept` returns 403, and they are hidden from customers
- The minimum payment is validated, admin approval unblocks the provider, and approving twice is refused
- Revenue page totals match the dashboard

---

## 4. Known gaps / future scope

1. **Admin routes have no authentication** (this was already the case before this work). Anyone who can reach the API can open `/api/admin/*`. Add an admin role and login before deploying.
2. Online payment gateway (JazzCash/Easypaisa API): the platform would collect payment and *credit* the provider wallet.
3. Night/emergency surge pricing.
4. Provider Pro subscription with a lower commission.
5. Cancellation fee rules.
6. Requests created before this feature have no `settlement`. They are never charged, and their full amount counts as provider earning.
