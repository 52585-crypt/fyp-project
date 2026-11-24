import type { Coordinate } from "../../utils/distance";

/**
 * Helpers for the generated map documents (web iframes with allow-same-origin, Android WebViews).
 * Data only ever enters those documents as JSON inside <script> and is rendered with textContent,
 * never as markup. These helpers make that a guarantee rather than a convention.
 */

const LINE_SEPARATOR = new RegExp("\\u2028", "g");
const PARAGRAPH_SEPARATOR = new RegExp("\\u2029", "g");

/** JSON safe to embed in a <script> element: no `</script>`, comment or HTML-entity breakout, no line terminators. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATOR, "\\u2028")
    .replace(PARAGRAPH_SEPARATOR, "\\u2029");
}

/** A coordinate forced through Number(); null when either value is not a finite, in-range number. */
export function safePoint(value: unknown): Coordinate | null {
  const c = value as { latitude?: unknown; longitude?: unknown } | null | undefined;
  const latitude = Number(c?.latitude);
  const longitude = Number(c?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function safePoints(values: unknown): Coordinate[] {
  return Array.isArray(values) ? values.map(safePoint).filter((p): p is Coordinate => p !== null) : [];
}

/** Optional display text (labels, names): always a plain string, or undefined. */
export function safeText(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
