import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type Props = {
  title: string;
  message?: string;
  icon?: IconName;
  /** "hero" renders inside an indigo card with an amount (provider payout). */
  variant?: "plain" | "hero";
  amountLabel?: string;
  amount?: string;
  footnote?: string;
  tone?: "success" | "primary";
};

/** Big confirmation badge + title (Thank you!, Job Completed, Provider arrived). */
export function SuccessHero({ title, message, icon = "checkmark", variant = "plain", amountLabel, amount, footnote, tone = "success" }: Props) {
  const hero = variant === "hero";
  return (
    <View style={[styles.wrap, hero && styles.hero]} accessible accessibilityRole="summary" accessibilityLabel={[title, message, amount].filter(Boolean).join(". ")}>
      <View style={[styles.badge, { backgroundColor: tokens.color[tone === "success" ? "success" : "primary"] }]}>
        <Icon name={icon} size={tokens.sizes.iconLarge + tokens.space.sm} color="onPrimary" />
      </View>
      <Text variant="title" align="center" color={hero ? "onPrimary" : "text"}>{title}</Text>
      {message ? <Text variant="bodySmall" align="center" color={hero ? "onPrimaryMuted" : "muted"}>{message}</Text> : null}
      {amountLabel ? <Text variant="caption" color={hero ? "onPrimaryMuted" : "muted"}>{amountLabel}</Text> : null}
      {amount ? <Text variant="display" color={hero ? "onPrimary" : "primary"}>{amount}</Text> : null}
      {footnote ? <Text variant="caption" color={hero ? "onPrimaryMuted" : "muted"}>{footnote}</Text> : null}
    </View>
  );
}

const s = tokens.sizes.successBadge;
const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: tokens.space.sm, paddingVertical: tokens.space.lg },
  hero: { backgroundColor: tokens.color.primary, borderRadius: tokens.radius.card, padding: tokens.space.xl, ...tokens.shadow.raised },
  badge: { width: s, height: s, borderRadius: s / 2, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.xs }
});
