import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Text } from "./Text";

export function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return (parts.length ? parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") : "?");
}

export function Avatar({ name, size = tokens.sizes.avatar, inverse = false }: { name?: string | null; size?: number; inverse?: boolean }) {
  return (
    <View
      style={[styles.base, { width: size, height: size, borderRadius: size / 2 }, inverse ? styles.inverse : styles.normal]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text variant={size >= tokens.sizes.avatarLarge ? "title" : "bodyStrong"} color="primary">
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  normal: { backgroundColor: tokens.color.primarySoft },
  inverse: { backgroundColor: tokens.color.surface, borderWidth: 2, borderColor: tokens.color.onPrimaryMuted }
});
