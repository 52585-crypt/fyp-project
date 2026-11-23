import { stripeReturnURL } from "../src/payments/stripeConfig";

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (path === stripeReturnURL || path.startsWith(`${stripeReturnURL}?`)) {
    // StripeRoot consumes the callback. Keep the open invoice in focus on a warm return.
    return initial ? "/" : "";
  }
  return path;
}
