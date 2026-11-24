export const SERVICE_LABELS = {
  car_towing: "Car Towing",
  towing: "Towing",
  fuel_delivery: "Fuel Delivery",
  mechanic: "Mechanic"
};

export function serviceTitle(category) {
  return SERVICE_LABELS[category] || "Unknown";
}

export function statusLabel(status) {
  const text = String(status || "unknown").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Maps a request / verification status to a badge tone. */
export function statusTone(status) {
  if (["completed", "verified", "active", "online"].includes(status)) return "success";
  if (["cancelled", "rejected", "blocked"].includes(status)) return "danger";
  if (["pending", "searching_provider", "waiting_user_approval", "extra_work_requested"].includes(status)) return "warning";
  if (["unverified", "offline"].includes(status)) return "neutral";
  return "info";
}

export function formatCurrency(value) {
  return `PKR ${Math.round(Number(value || 0)).toLocaleString()}`;
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export function timeAgo(value) {
  if (!value) return "—";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
  ];
  for (const [unit, size] of units) {
    const amount = Math.floor(seconds / size);
    if (amount >= 1) return `${amount} ${unit}${amount > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

export const COMPLAINT_CATEGORY_LABELS = {
  provider_behavior: "Provider behaviour",
  overcharging: "Overcharging",
  late_arrival: "Late arrival",
  poor_service: "Poor service",
  vehicle_damage: "Vehicle damage",
  payment: "Payment",
  safety: "Safety",
  app_issue: "App issue",
  other: "Other"
};
