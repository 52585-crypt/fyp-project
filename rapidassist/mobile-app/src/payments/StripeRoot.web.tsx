import { useEffect, type ReactNode } from "react";

export function StripeRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("payment_intent_client_secret")) return;
    url.searchParams.delete("payment_intent");
    url.searchParams.delete("payment_intent_client_secret");
    url.searchParams.delete("redirect_status");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return <>{children}</>;
}
