import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";
import { Text } from "./Text";

/** Labelled on/off switch (provider Online toggle). */
export function Toggle({ value, onChange, label, onLabel = "Online", offLabel = "Offline", disabled, busy }: {
  value: boolean; onChange: () => void; label: string; onLabel?: string; offLabel?: string; disabled?: boolean; busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: Boolean(disabled), busy: Boolean(busy) }}
      disabled={disabled || busy}
      onPress={() => { tapFeedback(); onChange(); }}
      style={[styles.wrap, value ? styles.wrapOn : null, disabled && { opacity: tokens.opacity.disabled }]}
    >
      <Text variant="captionStrong" color={value ? "success" : "muted"}>{value ? onLabel : offLabel}</Text>
      <View style={[styles.track, value ? styles.trackOn : null]}>
        {busy ? <ActivityIndicator size="small" color={tokens.color.surface} /> : <View style={[styles.thumb, value ? styles.thumbOn : null]} />}
      </View>
    </Pressable>
  );
}

const t = tokens.sizes.stepDot + tokens.space.xs;
const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.sm, paddingLeft: tokens.space.md, paddingRight: tokens.space.xs,
    minHeight: tokens.sizes.buttonSmall, borderRadius: tokens.radius.pill, borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface
  },
  wrapOn: { borderColor: tokens.color.success },
  track: {
    width: t * 1.8, height: t + tokens.space.xs, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.borderStrong,
    padding: tokens.space.xxs, justifyContent: "center"
  },
  trackOn: { backgroundColor: tokens.color.success },
  thumb: { width: t, height: t, borderRadius: t / 2, backgroundColor: tokens.color.surface },
  thumbOn: { alignSelf: "flex-end" }
});
