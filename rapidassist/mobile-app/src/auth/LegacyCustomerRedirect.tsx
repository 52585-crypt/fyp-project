import { Redirect, useGlobalSearchParams, usePathname, type Href } from "expo-router";
import { canonicalCustomerPath } from "./customerNavigation";

/** Sends an old customer URL (bookmark, older notification) to its current screen, or Home. */
export function LegacyCustomerRedirect() {
  const path = usePathname();
  const params = useGlobalSearchParams();
  return <Redirect href={(canonicalCustomerPath(path, params) ?? "/home") as Href} />;
}
