// Default business rules for how RapidAssist earns money.
// Admin can override these from the admin panel (stored in PlatformSettings).
// Rates are snapshotted on every request at creation time, so changing them
// later never changes the commission of an existing request.

const DEFAULT_MONETIZATION = Object.freeze({
  // Share of the provider's commissionable amount kept by the platform.
  commissionRates: Object.freeze({
    car_towing: 0.15, // base towing fee + distance charge
    fuel_delivery: 0.2, // delivery fee only (fuel cost is passed through)
    mechanic: 0.15 // inspection + visit fee + approved extra work
  }),
  // Fixed fee charged to the customer per request; goes 100% to the platform.
  platformFees: Object.freeze({
    car_towing: 250,
    fuel_delivery: 150,
    mechanic: 100
  }),
  // A provider whose dues go above this amount cannot accept new requests.
  providerDebtLimit: 2000,
  // Smallest dues payment a provider can submit.
  minTopupAmount: 100
});

const PRICE_LINE_KINDS = ["service", "fuel_cost", "delivery_fee", "platform_fee", "extra_work"];

module.exports = { DEFAULT_MONETIZATION, PRICE_LINE_KINDS };
