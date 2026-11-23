import { Redirect, useLocalSearchParams } from "expo-router";
import { providerRoutes } from "../../../src/navigation/routes";
import { parseRequestId } from "../../../src/requests/requestId";

/** Legacy offer link → incoming offer screen. */
export default function LegacyProviderRequest() {
  const id = parseRequestId(useLocalSearchParams<{ requestId?: string }>().requestId);
  return <Redirect href={id ? providerRoutes.incoming(id) : providerRoutes.dashboard} />;
}
