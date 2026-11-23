import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Text } from "./Text";

/** Label + control + hint/error wrapper shared by Input, Select and TextArea. */
export function Field({ label, optional, hint, error, children }: {
  label?: string; optional?: boolean; hint?: string; error?: string | null; children: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="bodySmallStrong">
          {label}{optional ? <Text variant="bodySmall" color="muted"> (Optional)</Text> : null}
        </Text>
      ) : null}
      {children}
      {error ? <Text variant="caption" color="danger" accessibilityLiveRegion="polite">{error}</Text>
        : hint ? <Text variant="caption" color="muted">{hint}</Text> : null}
    </View>
  );
}

export const fieldStyles = StyleSheet.create({
  box: {
    minHeight: tokens.sizes.input, borderRadius: tokens.radius.md, borderWidth: tokens.sizes.hairline,
    borderColor: tokens.color.border, backgroundColor: tokens.color.surface, paddingHorizontal: tokens.space.md,
    flexDirection: "row", alignItems: "center", gap: tokens.space.sm, minWidth: 0
  },
  focused: { borderColor: tokens.color.primary, borderWidth: tokens.sizes.border },
  invalid: { borderColor: tokens.color.danger },
  input: {
    flex: 1, minWidth: 0, ...tokens.text.body, color: tokens.color.text, paddingVertical: tokens.space.md,
    // The box border already shows focus; drop the browser's default outline on web.
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null)
  }
});

const styles = StyleSheet.create({ wrap: { gap: tokens.space.xs + tokens.space.xxs, minWidth: 0 } });
