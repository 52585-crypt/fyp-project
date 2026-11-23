import type { Href } from "expo-router";
import { parseRequestId } from "../requests/requestId";

export function notificationDestination(data: Record<string, unknown>): Href {
  const requestId = parseRequestId(data?.requestId);
  switch (data?.route) {
    case "/(provider)/requests":
      if (requestId) return { pathname: "/(provider)/requests/[requestId]", params: { requestId } };
      return "/(provider)/jobs";
    case "/(provider)/chat":
      if (requestId) return { pathname: "/(provider)/chat/[requestId]", params: { requestId } };
      return "/(provider)/jobs";
    case "/(provider)/payment":
      if (requestId) return { pathname: "/(provider)/payment/[requestId]", params: { requestId } };
      return "/(provider)/jobs";
    case "/(provider)/jobs":
      return "/(provider)/jobs";
    case "/(user)/chat":
      if (requestId) return { pathname: "/(user)/customer/chat/[requestId]", params: { requestId } };
      break;
    case "/(user)/payment":
      if (requestId) return { pathname: "/(user)/customer/payment/[requestId]", params: { requestId } };
      break;
  }
  return { pathname: "/(user)/tracking", params: { requestId: requestId ?? "invalid" } };
}
