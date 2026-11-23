const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
export const stripeTestKey = key.startsWith("pk_test_") ? key : "";
export const stripeReturnURL = "rapidassist://stripe-redirect";
