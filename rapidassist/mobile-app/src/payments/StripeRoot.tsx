import { StripeProvider, useStripe } from "@stripe/stripe-react-native";
import { useEffect, type ReactNode } from "react";
import { Linking } from "react-native";
import { stripeReturnURL, stripeTestKey } from "./stripeConfig";

function StripeRedirectHandler() {
  const { handleURLCallback } = useStripe();
  useEffect(() => {
    function handle(url: string | null) {
      if (url?.startsWith(stripeReturnURL)) void handleURLCallback(url).catch(() => {});
    }
    void Linking.getInitialURL().then(handle).catch(() => {});
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => subscription.remove();
  }, [handleURLCallback]);
  return null;
}

export function StripeRoot({ children }: { children: ReactNode }) {
  if (!stripeTestKey) return <>{children}</>;
  return <StripeProvider publishableKey={stripeTestKey} urlScheme="rapidassist">
    <StripeRedirectHandler />
    <>{children}</>
  </StripeProvider>;
}
