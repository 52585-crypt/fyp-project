export function formatCurrency(amount: number) {
  const whole = Number.isInteger(amount);
  return `Rs. ${amount.toLocaleString("en-PK", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function compactAddress(address?: string | null) {
  if (!address) return "Location not selected";
  return address.length > 42 ? `${address.slice(0, 39)}...` : address;
}


/** "12:30 PM" from an ISO timestamp; empty string when missing/invalid. */
export function formatTime(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "May 12, 2:45 PM" from an ISO timestamp. */
export function formatDateTime(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${formatTime(iso)}`;
}

/** Clock time `minutes` from now, e.g. "12:45 PM". */
export function clockIn(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  return formatTime(new Date(Date.now() + minutes * 60000).toISOString());
}
