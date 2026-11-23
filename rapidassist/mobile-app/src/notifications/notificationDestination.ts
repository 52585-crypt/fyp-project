import type { Href } from "expo-router";
import { parseRequestId } from "../requests/requestId";

/**
 * Turns a notification payload into an in-app destination. `data.route` values are the keys the
 * server sends (e.g. "/(user)/tracking"); they are mapped onto the current route tree here so the
 * server does not need to know screen paths. Malformed IDs stay explicit as "invalid".
 */
export function notificationDestination(data: Record<string, unknown>): Href {
  const requestId = parseRequestId(data?.requestId);
  switch (data?.route) {
    case "/(provider)/requests":
      return requestId ? { pathname: "/(provider)/incoming/[id]", params: { id: requestId } } : "/(provider)/(tabs)/dashboard";
    case "/(provider)/chat":
      return requestId ? { pathname: "/(provider)/job/[id]/chat", params: { id: requestId } } : "/(provider)/(tabs)/jobs";
    case "/(provider)/payment":
    case "/(provider)/jobs":
      return requestId ? { pathname: "/(provider)/job/[id]", params: { id: requestId } } : "/(provider)/(tabs)/jobs";
    case "/(user)/chat":
      if (requestId) return { pathname: "/(user)/request/[id]/chat", params: { id: requestId } };
      break;
    case "/(user)/payment":
      if (requestId) return { pathname: "/(user)/request/[id]/pay", params: { id: requestId } };
      break;
  }
  return { pathname: "/(user)/request/[id]", params: { id: requestId ?? "invalid" } };
}
