// TypeScript resolves this file; Metro selects .native.ts or .web.ts at runtime.
export async function getGoogleIdToken(_selectAccount?: boolean): Promise<string | null> {
  throw new Error("Google Sign-In requires a supported native build.");
}
