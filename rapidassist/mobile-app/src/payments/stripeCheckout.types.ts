export type CheckoutResult = "submitted" | "canceled" | "failed";

export type StripeCheckoutProps = {
  createIntent: () => Promise<string | null>;
  onResult: (result: CheckoutResult, message?: string) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
};
