import { PaymentSheetError, useStripe } from "@stripe/stripe-react-native";
import { useRef } from "react";
import { PrimaryButton } from "../ui/components";
import { stripeReturnURL } from "./stripeConfig";
import type { StripeCheckoutProps } from "./stripeCheckout.types";

export function StripeCheckout({ createIntent, onResult, onBusyChange, disabled }: StripeCheckoutProps) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const inFlight = useRef(false);

  async function checkout() {
    if (inFlight.current) return;
    inFlight.current = true;
    onBusyChange(true);
    try {
      const clientSecret = await createIntent();
      if (!clientSecret) return;
      const initialized = await initPaymentSheet({
        merchantDisplayName: "RapidAssist (Test Mode)",
        paymentIntentClientSecret: clientSecret,
        returnURL: stripeReturnURL
      });
      if (initialized.error) {
        onResult("failed", "Unable to open Stripe PaymentSheet. Please try again.");
        return;
      }
      const { error } = await presentPaymentSheet();
      if (error?.code === PaymentSheetError.Canceled) onResult("canceled");
      else if (error) onResult("failed", "The card payment could not be completed. Please try again.");
      else onResult("submitted");
    } catch {
      onResult("failed", "Unable to open Stripe checkout. Please try again.");
    } finally {
      inFlight.current = false;
      onBusyChange(false);
    }
  }

  return <PrimaryButton title={disabled ? "Opening Stripe…" : "Pay Now"} icon="card" disabled={disabled} onPress={() => void checkout()} />;
}
