# RapidAssist: Monetization Implementation Plan

**Model:** Commission per order + customer platform fee + provider wallet (cash debt system)
**Scope:** `RA/server`, `admin-panel`, `mobile-app`

---

## 0. Final business rules (pehle ye freeze karo)

| Rule | Value (default) | Kahan store hoga |
|---|---|---|
| Mechanic commission | 15% (visit fee + approved extra work) | `Service.pricing.commissionRate` |
| Towing commission | 15% (poora towing bill) | `Service.pricing.commissionRate` |
| Fuel commission | 20% sirf delivery fee par (fuel ki qeemat par nahi) | `Service.pricing.commissionRate` + `commissionBase: "delivery_fee"` |
| Customer platform fee | Rs 30 per order | `Service.pricing.platformFee` |
| Provider debt limit | Rs 2,000 | `src/config/monetization.js` (`PROVIDER_DEBT_LIMIT`) |
| Payment method (FYP) | Cash on delivery (abhi wala) | `Order.payment.method` |

### Formulas

```
serviceAmount   = order.pricing.total           // abhi wala total (provider ka kaam)
platformFee     = service.pricing.platformFee   // customer pay karta hai
grandTotal      = serviceAmount + platformFee   // customer ko yahi bill dikhega

commissionBase  = fuel     → deliveryFee
                  towing   → serviceAmount
                  mechanic → visitFee + extraWorkTotal
commission      = round(commissionBase × commissionRate)

providerEarning = serviceAmount − commission
platformRevenue = commission + platformFee
```

**Cash flow:** Customer provider ko `grandTotal` cash deta hai. Provider ke paas platform ka `platformRevenue` aa jata hai, is liye wo amount provider ke wallet se **debit** hoga (balance minus mein jayega).

**Example (mechanic, visit 800 + extra 2000):**
serviceAmount 2800, platformFee 30, grandTotal **2830**, commission 420, providerEarning **2380**, platformRevenue **450**. Is order ke baad provider wallet: −450.

---

## Phase 1: Pricing mein commission add karna (Backend)

**Files:**
- `RA/server/src/data/defaultServices.js`
- `RA/server/src/models/Service.js`
- `RA/server/src/models/Order.js`
- `RA/server/src/utils/orderPricing.js`
- `RA/server/src/controllers/orderController.js`

**Steps:**
1. `Service.pricing` mein add karo: `commissionRate` (Number, 0–1), `platformFee` (Number), `commissionBase` (enum: `service_total`, `delivery_fee`, `visit_plus_extra`).
2. `defaultServices.js` mein upar wali default values daal do. `seedServices.js` dobara chalao taake existing services update ho jayen.
3. `Order.pricing` mein naye fields add karo: `platformFee`, `grandTotal`, `commissionRate`, `commission`, `providerEarning`, `platformRevenue`.
   - **Rate order banate waqt snapshot hogi.** Agar admin baad mein rate change kare to purane orders par asar nahi hoga.
4. `orderPricing.js` mein naya helper `applyMonetization(service, pricing)` banao. Teeno `calculate*Pricing` functions ka result isi helper se guzrega.
5. `createOrder` mein pricing ke baad `applyMonetization` call karo.
6. `respondToExtraWorkRequest` mein jab `extraWorkTotal` badle to commission aur `grandTotal` **dobara calculate** karo, warna mechanic ka commission sirf visit fee par lagega.
7. `mapOrder()` response mein naye fields bhejo.

**Done jab:** naya order banao to response mein `grandTotal`, `commission`, `providerEarning` sahi aayen.

---

## Phase 2: Wallet aur Transaction models

**Naye files:**
- `RA/server/src/models/ProviderWallet.js`
- `RA/server/src/models/WalletTransaction.js`
- `RA/server/src/config/monetization.js`

**ProviderWallet:**
```
provider        ObjectId → User (unique)
balance         Number (negative = platform ka qarz)
totalEarned     Number (lifetime providerEarning)
totalCommission Number (lifetime platformRevenue)
isBlocked       Boolean (debt limit cross ho to true)
```

**WalletTransaction:**
```
provider      ObjectId → User
order         ObjectId → Order (nullable)
type          enum: commission_debit | topup_credit | payout_debit | adjustment
amount        Number (credit +, debit −)
balanceAfter  Number
status        enum: pending | approved | rejected   // top-up ke liye
reference     String  // JazzCash/Easypaisa TID
proofImage    String  // screenshot URL (Cloudinary, upload system already hai)
note          String
```

**Index:** `{ order: 1, type: 1 }` unique (jab `order` null na ho). Is se ek order ka commission **do baar** kabhi nahi katega.

`models/index.js` mein dono export karo.

---

## Phase 3: Settlement (order complete hone par commission katna)

**Naya file:** `RA/server/src/services/walletService.js`

Functions:
- `getOrCreateWallet(providerId)`
- `settleOrder(order)`: `commission_debit` transaction banao (amount = −platformRevenue) aur `$inc` se balance update karo. Agar transaction pehle se hai (duplicate key error) to kuch na karo.
- `refreshBlockStatus(wallet)`: `balance < −PROVIDER_DEBT_LIMIT` ho to `isBlocked = true`, warna false.

**Hook point:** `orderController.js` → `updatePaymentStatus()` ke baad, **jab `payment.status` pehli dafa `"confirmed"` bane** (customer aur provider dono confirm kar dein), tab `settleOrder(order)` call karo. Ye `customerConfirmPayment` aur `providerConfirmPayment` dono mein lagega.

> Note: Local MongoDB standalone hai, is liye multi-document transactions nahi chalengi. Unique index + atomic `$inc` kaafi hai.

---

## Phase 4: Debt limit enforcement

**File:** `orderController.js`
- `listOpenOrders`: agar wallet `isBlocked` hai to empty list ke saath `blocked: true, dues: X` return karo.
- `acceptOrder`: blocked provider ko `403 "Clear your dues of PKR X to accept new orders"`.

---

## Phase 5: Provider wallet APIs

**Naye files:** `controllers/walletController.js`, `routes/walletRoutes.js` → `app.js` mein `app.use("/api/wallet", walletRoutes)`

| Method | Route | Kaam |
|---|---|---|
| GET | `/api/wallet/me` | balance, dues, isBlocked, today/week earnings |
| GET | `/api/wallet/transactions?page=` | history |
| POST | `/api/wallet/topup` | provider dues pay karne ka request: `{ amount, reference, proofImage }` → status `pending` |
| GET | `/api/wallet/earnings` | today/week net earnings (completed orders ke `providerEarning` ka sum) |

> **Gap jo maine dekha:** mobile app `getProviderEarnings` abhi `/api/requests/provider/earnings` call karti hai, lekin server par ye route mounted hi nahi hai. Isay `/api/wallet/earnings` se replace karo.

**FYP ke liye top-up manual rakho:** provider JazzCash/Easypaisa par platform ke number par paise bheje, TID aur screenshot upload kare, aur admin approve kare. Real payment gateway "Future Scope" mein rakho.

---

## Phase 6: Admin APIs + Admin Panel

> **Gap jo maine dekha:** admin panel `/api/admin/dashboard` aur `/api/admin/providers` call karta hai, lekin `RA/server` mein koi admin route nahi hai. Admin routes pehle banane honge (`requireRole("admin")` ke saath).

**Backend:** `controllers/adminController.js`, `routes/adminRoutes.js`

| Method | Route | Kaam |
|---|---|---|
| GET | `/api/admin/revenue?from=&to=` | total platformRevenue, commission, platformFee, order count, service-wise breakdown (Mongo aggregate) |
| GET | `/api/admin/wallets?blocked=true` | providers ki list, dues ke saath |
| GET | `/api/admin/topups?status=pending` | pending top-ups |
| PATCH | `/api/admin/topups/:id` | approve/reject: approve par balance credit aur block status refresh |
| PATCH | `/api/admin/services/:code/pricing` | commissionRate / platformFee change |

**Admin panel (`admin-panel/src/pages/`):**
- `Revenue.jsx`: aaj / hafta / mahina revenue cards, service-wise table, recent commission transactions
- `Payouts.jsx`: pending top-ups (screenshot preview + Approve/Reject), blocked providers ki list
- `Dashboard.jsx` mein "Today's revenue" card add karo
- `App.jsx` mein naye routes aur nav links

---

## Phase 7: Mobile app

**Customer side:**
- Order create screen aur order details par bill breakdown: Service charges, Platform fee, **Total to pay (`grandTotal`)**
- Payment confirm screen par `grandTotal` dikhao (abhi `total` dikhta hai)

**Provider side:**
- `(provider)/earnings/index.tsx`: Net earnings (today/week), Wallet balance, Dues, aur transaction list
- Naya screen `(provider)/wallet/topup.tsx`: amount, TID aur screenshot upload
- Dashboard / requests screen par red banner: *"Dues PKR X: clear karein taake naye orders mil sakein"*
- Order complete screen par: "Customer se PKR 2830 lein · Aapki kamai PKR 2380"
- `requests.types.ts` / API files mein naye fields aur endpoints

---

## Phase 8: Optional (time ho to, warna "Future Scope")

1. **Night/emergency surge:** `Service.pricing.surge = { startHour, endHour, multiplier }`, `createOrder` mein apply
2. **Provider Pro subscription:** `ProviderProfile.isPremium` already mojood hai. Premium ka commission 8% aur open orders mein priority
3. **Online payment:** JazzCash/Easypaisa gateway. Platform paise collect kare aur provider wallet ko **credit** kare (cash ka ulta flow)
4. **Refund/cancellation fee** rules

---

## Testing checklist

- [ ] Fuel 5L petrol: commission sirf Rs 250 delivery fee par (Rs 50), fuel par nahi
- [ ] Mechanic + extra work approve: commission extra work par bhi laga
- [ ] Mechanic + extra work reject: commission sirf visit fee par
- [ ] Payment sirf ek side confirm: koi wallet entry **nahi**
- [ ] Dono confirm: ek `commission_debit` entry; dobara confirm API hit karne par bhi ek hi entry
- [ ] Balance −2001: provider ko open orders nahi milte, accept 403 deta hai
- [ ] Admin top-up approve: balance update aur provider unblock
- [ ] Admin rate change: purane orders ka commission same rehta hai
- [ ] Revenue dashboard ke totals transactions ke sum se match karein

---

## Timeline (suggested)

| Week | Kaam |
|---|---|
| 1 | Phase 1 + 2 (pricing fields, models) |
| 2 | Phase 3 + 4 + 5 (settlement, blocking, wallet APIs) |
| 3 | Phase 6 (admin APIs + Revenue/Payouts pages) |
| 4 | Phase 7 (mobile screens) + testing |
| 5 | Phase 8 optional + documentation / FYP report chapter |
