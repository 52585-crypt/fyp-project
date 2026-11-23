import type { Href } from "expo-router";
import type { SafeUser } from "./auth.types";
import { parseRequestId } from "../requests/requestId";

const customerPaths = new Set([
  "/home", "/request", "/request/create", "/tracking", "/history", "/vehicles", "/vehicles/add",
  "/customer/profile", "/customer/notifications"
]);
const categories = new Set(["mechanic", "fuel_delivery", "car_towing"]);

export function legacyRoleDestination(path: string, role: SafeUser["role"]): Href | null {
  const prefix = role === "user" ? "/(user)/customer" : "/(provider)";
  if (path === "/profile" || path === "/notifications") return `${prefix}${path}` as Href;
  const match = /^\/(payment|chat)\/([^/]+)$/.exec(path);
  const id = parseRequestId(match?.[2]);
  return match && id ? `${prefix}/${match[1]}/${id}` as Href : null;
}

export function customerReturnTo(
  path: string,
  params: Record<string, unknown> = {},
  pendingRoute?: { screen?: unknown; params?: Record<string, unknown> }
): string | undefined {
  const requestRoute = /^\/customer\/(chat|payment)\/([^/]+)$/.exec(path);
  if (requestRoute) {
    const id = parseRequestId(requestRoute[2]);
    return id ? `/customer/${requestRoute[1]}/${id}` : undefined;
  }
  if (!customerPaths.has(path)) return undefined;

  // Native links can target a child before its guarded navigator mounts.
  const pending = pendingRoute?.screen === path.slice(1)
    || pendingRoute?.screen === `${path.slice(1)}/index` ? pendingRoute?.params : undefined;
  const requestId = params.requestId ?? pending?.requestId;
  const category = params.category ?? pending?.category;
  if (path === "/tracking" && requestId !== undefined) {
    // Keep malformed explicit targets distinct from a generic Activity visit.
    return `/tracking?requestId=${parseRequestId(requestId) ?? "invalid"}`;
  }
  if ((path === "/request" || path === "/request/create")
    && typeof category === "string" && categories.has(category)) {
    return `${path}?category=${category}`;
  }
  if (path === "/history" && (params.view ?? pending?.view) === "payments") return "/history?view=payments";
  return path;
}

export function resumeAfterSignIn(user: SafeUser, value: unknown): Href | null {
  if (typeof value !== "string" || value.length > 256) return null;
  const [path, query = "", ...extra] = value.split("?");
  if (extra.length) return null;
  const role = user.activeRole ?? user.role;
  const legacy = legacyRoleDestination(path, role);
  const trackingQuery = /^requestId=([a-f\d]{24}|invalid)$/i.exec(query);
  const categoryQuery = /^category=([a-z_]+)$/.exec(query);
  const customer = role === "user" ? customerReturnTo(path, {
    requestId: path === "/tracking" && query ? trackingQuery?.[1] ?? "invalid" : undefined,
    category: categoryQuery?.[1],
    view: query === "view=payments" ? "payments" : undefined
  }) : undefined;
  const destination = legacy ?? (customer as Href | undefined);
  if (!destination) return null;
  if (role === "user" && !user.phone) {
    return { pathname: "/(auth)/complete-profile", params: { returnTo: legacy ? String(legacy).replace("/(user)", "") : customer } };
  }
  return destination;
}
