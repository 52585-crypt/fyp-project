import type { Href } from "expo-router";
import type { SafeUser } from "./auth.types";
import { parseRequestId } from "../requests/requestId";

/** Customer screens that may be resumed after sign-in without parameters. */
const customerStatic = new Set(["/home", "/requests", "/support", "/account", "/notifications", "/vehicles", "/vehicles/add"]);
const categories = new Set(["mechanic", "fuel_delivery", "car_towing"]);
const requestChildren: Record<string, string> = { chat: "chat", pay: "pay", payment: "pay", review: "review" };

type RouteQuery = { requestId?: unknown; category?: unknown; view?: unknown };

/**
 * Maps current and legacy customer URLs (old notifications, bookmarks, deep links) onto the
 * current route tree. Returns undefined for anything that is not a known customer screen.
 * Malformed request IDs become the explicit `/request/invalid` target rather than a generic page.
 */
export function canonicalCustomerPath(path: string, query: RouteQuery = {}): string | undefined {
  const view = query.view === "payments" ? "?view=payments" : "";
  if (path === "/requests" || path === "/history") return `/requests${view}`;
  if (customerStatic.has(path)) return path;
  if (path === "/customer/profile") return "/account";
  if (path === "/customer/notifications") return "/notifications";

  const service = /^\/request\/new\/([a-z_]+)$/.exec(path);
  if (service) return categories.has(service[1]!) ? path : undefined;
  if (path === "/request" || path === "/request/create") {
    return typeof query.category === "string" && categories.has(query.category) ? `/request/new/${query.category}` : "/home";
  }
  if (path === "/tracking") {
    if (query.requestId === undefined) return "/requests";
    return `/request/${parseRequestId(query.requestId) ?? "invalid"}`;
  }

  const live = /^\/request\/([^/]+)(?:\/(chat|pay|review))?$/.exec(path);
  if (live) {
    const id = parseRequestId(live[1]);
    return id ? `/request/${id}${live[2] ? `/${live[2]}` : ""}` : undefined;
  }
  const legacyChild = /^\/customer\/(chat|payment)\/([^/]+)$/.exec(path);
  if (legacyChild) {
    const id = parseRequestId(legacyChild[2]);
    return id ? `/request/${id}/${requestChildren[legacyChild[1]!]}` : undefined;
  }
  return undefined;
}

/** Role-ambiguous legacy links (`/profile`, `/notifications`, `/chat/:id`, `/payment/:id`). */
export function legacyRoleDestination(path: string, role: SafeUser["role"]): Href | null {
  const customer = role === "user";
  if (path === "/profile") return customer ? "/account" : "/profile";
  if (path === "/notifications") return customer ? "/notifications" : "/inbox";
  const match = /^\/(payment|chat)\/([^/]+)$/.exec(path);
  const id = parseRequestId(match?.[2]);
  if (!match || !id) return null;
  if (customer) return `/request/${id}/${requestChildren[match[1]!]}` as Href;
  return (match[1] === "chat" ? `/job/${id}/chat` : `/job/${id}`) as Href;
}

/** Where an unauthenticated customer should land after signing in, or undefined. */
export function customerReturnTo(
  path: string,
  params: Record<string, unknown> = {},
  pendingRoute?: { screen?: unknown; params?: Record<string, unknown> }
): string | undefined {
  // Native links can target a child before its guarded navigator mounts.
  const pending = pendingRoute?.screen === path.slice(1)
    || pendingRoute?.screen === `${path.slice(1)}/index` ? pendingRoute?.params : undefined;
  return canonicalCustomerPath(path, {
    requestId: params.requestId ?? pending?.requestId,
    category: params.category ?? pending?.category,
    view: params.view ?? pending?.view
  });
}

export function resumeAfterSignIn(user: SafeUser, value: unknown): Href | null {
  if (typeof value !== "string" || value.length > 256) return null;
  const [path = "", query = "", ...extra] = value.split("?");
  if (extra.length) return null;
  const role = user.activeRole ?? user.role;
  const legacy = legacyRoleDestination(path, role);
  const trackingQuery = /^requestId=([a-f\d]{24}|invalid)$/i.exec(query);
  const categoryQuery = /^category=([a-z_]+)$/.exec(query);
  const customer = role === "user" ? canonicalCustomerPath(path, {
    requestId: path === "/tracking" && query ? trackingQuery?.[1] ?? "invalid" : undefined,
    category: categoryQuery?.[1],
    view: query === "view=payments" ? "payments" : undefined
  }) : undefined;
  const destination = legacy ?? (customer as Href | undefined);
  if (!destination) return null;
  if (role === "user" && !user.phone) {
    return { pathname: "/(auth)/complete-profile", params: { returnTo: String(destination) } };
  }
  return destination;
}
