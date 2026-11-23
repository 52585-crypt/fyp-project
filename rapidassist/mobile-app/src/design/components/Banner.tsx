import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { tokens, type ColorToken } from "../tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type BannerTone = "info" | "success" | "warning" | "danger";

const tones: Record<BannerTone, { bg: ColorToken; fg: ColorToken; icon: IconName }> = {
  info: { bg: "primarySoft", fg: "primary", icon: "information-circle-outline" },
  success: { bg: "successSoft", fg: "success", icon: "checkmark-circle-outline" },
  warning: { bg: "warningSoft", fg: "warningText", icon: "warning-outline" },
  danger: { bg: "dangerSoft", fg: "danger", icon: "alert-circle-outline" }
};

/** Inline notice (lavender info panel in mockups). */
export function Banner({ tone = "info", title, message, icon, action }: {
  tone?: BannerTone; title?: string; message?: string; icon?: IconName; action?: ReactNode;
}) {
  const t = tones[tone];
  return (
    <View
      style={[styles.box, { backgroundColor: tokens.color[t.bg] }]}
      accessibilityRole={tone === "danger" || tone === "warning" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
    >
      <Icon name={icon ?? t.icon} color={t.fg} />
      <View style={styles.copy}>
        {title ? <Text variant="bodySmallStrong" color={t.fg}>{title}</Text> : null}
        {message ? <Text variant="bodySmall" color={tone === "info" ? "muted" : t.fg}>{message}</Text> : null}
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: tokens.space.md, padding: tokens.space.md + tokens.space.xxs, borderRadius: tokens.radius.md },
  copy: { flex: 1, gap: tokens.space.xxs }
});
