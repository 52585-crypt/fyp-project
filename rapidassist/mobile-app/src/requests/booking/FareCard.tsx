import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, PriceBreakdown, Text } from "../../design/components";
import { tapFeedback } from "../../design/haptics";
import { tokens } from "../../design/tokens";
import { formatCurrency } from "../../utils/format";
import type { PriceLine } from "../requests.types";

type Props = { estimate: { lines: PriceLine[]; total: number } | null; pending?: boolean };

/** Fare panel on the problem screen: the backend prices every request, so the fare is a fixed amount with its breakdown. */
export function FareCard({ estimate, pending }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={styles.row}>
          <Text variant="captionStrong" color="onPrimaryMuted" style={styles.flex}>YOUR FARE</Text>
          <View style={styles.tag}><Text variant="micro" color="onAccent">Fixed price</Text></View>
        </View>
        <Text variant="figure" color="onPrimary" accessibilityLiveRegion="polite">
          {estimate ? formatCurrency(estimate.total) : pending ? "Calculating…" : "—"}
        </Text>
        <Text variant="caption" color="onPrimaryMuted">Pay cash after the job. Extra parts or waiting time need your approval first.</Text>
        {estimate ? (
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={open ? "Hide fare breakdown" : "Show fare breakdown"}
            onPress={() => { tapFeedback(); setOpen((v) => !v); }} style={styles.toggle}>
            <Text variant="captionStrong" color="onPrimary">{open ? "Hide breakdown" : "See breakdown"}</Text>
            <Icon name={open ? "chevron-up" : "chevron-down"} color="onPrimary" size={tokens.sizes.iconSmall} />
          </Pressable>
        ) : null}
      </View>
      {open && estimate ? (
        <View style={styles.breakdown}><PriceBreakdown lines={estimate.lines} total={estimate.total} totalLabel="Fare" /></View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.sm },
  hero: { gap: tokens.space.xs, padding: tokens.space.lg, borderRadius: tokens.radius.card, backgroundColor: tokens.color.deep },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  flex: { flex: 1 },
  tag: { paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.xxs, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.amber },
  toggle: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs, alignSelf: "flex-start", minHeight: tokens.sizes.touchMin },
  breakdown: { padding: tokens.space.lg, borderRadius: tokens.radius.card, borderWidth: tokens.sizes.hairline, borderColor: tokens.color.line }
});
