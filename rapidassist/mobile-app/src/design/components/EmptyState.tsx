import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/** Friendly placeholder when a list has nothing to show, or a feature is "Coming soon". */
export function EmptyState({ icon = "file-tray-outline", title, message, actionLabel, onAction }: {
  icon?: IconName; title: string; message?: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}><Icon name={icon} size={tokens.sizes.iconLarge} color="primary" /></View>
      <Text variant="headline" align="center">{title}</Text>
      {message ? <Text variant="bodySmall" color="muted" align="center">{message}</Text> : null}
      {actionLabel ? <Button title={actionLabel} onPress={onAction} variant="secondary" size="small" fullWidth={false} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: tokens.space.sm, paddingVertical: tokens.space.xxl, paddingHorizontal: tokens.space.lg },
  icon: {
    width: tokens.sizes.avatarLarge, height: tokens.sizes.avatarLarge, borderRadius: tokens.sizes.avatarLarge / 2,
    backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.xs
  },
  action: { alignSelf: "center", marginTop: tokens.space.sm }
});
