import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useRef, useState, type FormEvent } from "react";
import { stripeTestKey } from "./stripeConfig";
import type { StripeCheckoutProps } from "./stripeCheckout.types";
import { Button } from "../design/components";

let stripePromise: ReturnType<typeof loadStripe> | undefined;

function CardForm({ disabled, onBusyChange, onResult, close }: StripeCheckoutProps & { close: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const submitting = useRef(false);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || submitting.current) return;
    submitting.current = true;
    onBusyChange(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required"
      });
      if (error) onResult("failed", error.message || "The card payment could not be completed.");
      else {
        close();
        onResult("submitted");
      }
    } catch {
      onResult("failed", "Unable to confirm your card payment. Please try again.");
    } finally {
      submitting.current = false;
      onBusyChange(false);
    }
  }

  return <form onSubmit={confirm} style={{ display: "grid", gap: 12 }}>
    <PaymentElement options={{ wallets: { applePay: "never", googlePay: "never" } }} onReady={() => setReady(true)}
      onLoadError={() => { close(); onResult("failed", "Unable to load the Stripe card form."); }} />
    <button type="submit" disabled={!stripe || !elements || !ready || disabled}>
      {disabled ? "Submitting…" : "Confirm Card Payment"}
    </button>
    <button type="button" disabled={disabled} onClick={() => { close(); onResult("canceled"); }}>Cancel</button>
  </form>;
}

export function StripeCheckout(props: StripeCheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const opening = useRef(false);

  async function open() {
    if (opening.current) return;
    opening.current = true;
    props.onBusyChange(true);
    try {
      const secret = await props.createIntent();
      if (!secret) return;
      stripePromise ??= loadStripe(stripeTestKey);
      if (!await stripePromise) throw new Error("Stripe unavailable");
      setClientSecret(secret);
    } catch {
      stripePromise = undefined;
      props.onResult("failed", "Unable to load Stripe. Please try again.");
    } finally {
      opening.current = false;
      props.onBusyChange(false);
    }
  }

  if (!clientSecret || !stripePromise) {
    return <Button title={props.disabled ? "Opening Stripe…" : "Pay Now"} icon="card" disabled={props.disabled} onPress={() => void open()} />;
  }

  return <Elements stripe={stripePromise} options={{ clientSecret }}>
    <CardForm {...props} close={() => setClientSecret(null)} />
  </Elements>;
}
