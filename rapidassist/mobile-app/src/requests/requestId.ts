export function parseRequestId(value: unknown): string | null {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value) ? value.toLowerCase() : null;
}
