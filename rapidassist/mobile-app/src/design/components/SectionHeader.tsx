import { Pressable, StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Badge } from "./Badge";
import { Text } from "./Text";

/** Section title with optional trailing link or badge. */
export function SectionHeader({ title, action, onAction, badge }: { title: string; action?: string; onAction?: () => void; badge?: string }) {
  return (
    <View style={styles.row}>
      <Text variant="headline" accessibilityRole="header" style={styles.flex}>{title}</Text>
      {badge ? <Badge label={badge} tone="primary" /> : null}
      {action ? (
        <Pressable accessibilityRole="link" onPress={onAction} hitSlop={tokens.space.md}>
          <Text variant="bodySmallStrong" color="primary">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  flex: { flex: 1 }
});
