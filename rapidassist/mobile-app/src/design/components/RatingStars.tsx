import { Pressable, StyleSheet, View } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";
import { Icon } from "./Icon";

/** 1–5 star rating; read-only when onChange is omitted. */
export function RatingStars({ value, onChange, size = tokens.sizes.iconLarge + tokens.space.sm }: { value: number; onChange?: (v: number) => void; size?: number }) {
  if (!onChange) {
    return (
      <View style={styles.row} accessibilityLabel={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name={n <= value ? "star" : "star-outline"} size={size} color="star" />)}
      </View>
    );
  }
  return (
    <View style={[styles.row, styles.center]} accessibilityRole="adjustable" accessibilityLabel={`Rating: ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
          accessibilityState={{ selected: n <= value }}
          hitSlop={tokens.space.xs}
          onPress={() => { tapFeedback(); onChange(n); }}
        >
          <Icon name={n <= value ? "star" : "star-outline"} size={size} color={n <= value ? "primary" : "borderStrong"} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: tokens.space.xs },
  center: { justifyContent: "center", gap: tokens.space.md }
});
