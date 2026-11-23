/** @deprecated Use src/design/tokens.ts. Removed in phase 8. */
import { tokens } from "../design/tokens";
import { ui } from "../ui/system";

export const colors = {
  ...ui.colors,
  mutedText: ui.colors.muted,
  surfaceMuted: ui.colors.surfaceAlt,
  primaryBorder: tokens.color.primaryMuted
} as const;
