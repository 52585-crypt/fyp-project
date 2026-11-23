import { StyleSheet, View } from "react-native";
import { formatCurrency } from "../../utils/format";
import { tokens } from "../tokens";
import { Text } from "./Text";

export type PriceLineItem = { label: string; amount: number };

type Props = {
  title?: string;
  lines: ReadonlyArray<PriceLineItem>;
  total: number;
  totalLabel?: string;
  note?: string;
};

/** Bill summary: line items, divider, highlighted total. */
export function PriceBreakdown({ title, lines, total, totalLabel = "Total", note }: Props) {
  return (
    <View style={styles.wrap}>
      {title ? <Text variant="bodyStrong">{title}</Text> : null}
      {lines.map((line, i) => (
        <View key={`${line.label}-${i}`} style={styles.row}>
          <Text variant="bodySmall" color="muted" style={styles.flex}>{line.label}</Text>
          <Text variant="bodySmallMedium">{formatCurrency(line.amount)}</Text>
        </View>
      ))}
      <View style={styles.divider} />
      <View style={styles.row} accessible accessibilityLabel={`${totalLabel}: ${formatCurrency(total)}`}>
        <Text variant="bodyStrong" style={styles.flex}>{totalLabel}</Text>
        <Text variant="price" color="primary">{formatCurrency(total)}</Text>
      </View>
      {note ? <Text variant="caption" color="muted">{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.sm + tokens.space.xxs },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  flex: { flex: 1 },
  divider: { height: tokens.sizes.hairline, backgroundColor: tokens.color.border, marginVertical: tokens.space.xs }
});
