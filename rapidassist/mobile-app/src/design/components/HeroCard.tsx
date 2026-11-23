import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type Props = {
  title?: string;
  subtitle?: string;
  /** Large decorative icon on the right (stands in for the mockup illustrations). */
  art?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

/** Indigo feature card used for home heroes, assigned-provider cards and payout summaries. */
export function HeroCard({ title, subtitle, art, actionLabel, onAction, children }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.glow} />
      <View style={styles.row}>
        <View style={styles.copy}>
          {title ? <Text variant="title" color="onPrimary">{title}</Text> : null}
          {subtitle ? <Text variant="bodySmall" color="onPrimaryMuted">{subtitle}</Text> : null}
          {actionLabel ? (
            <Button title={actionLabel} onPress={onAction} variant="light" size="small" fullWidth={false} style={styles.action} />
          ) : null}
        </View>
        {art ? (
          <View style={styles.art}><Icon name={art} size={tokens.sizes.avatarLarge} color="onPrimary" /></View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.primary, borderRadius: tokens.radius.card, padding: tokens.space.screen,
    gap: tokens.space.md, overflow: "hidden", ...tokens.shadow.raised
  },
  glow: {
    position: "absolute", right: -tokens.space.xxxl, top: -tokens.space.xxxl, width: tokens.sizes.heroArt,
    height: tokens.sizes.heroArt, borderRadius: tokens.sizes.heroArt / 2, backgroundColor: tokens.color.heroGlow
  },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  copy: { flex: 1, gap: tokens.space.xs },
  action: { marginTop: tokens.space.sm },
  art: {
    width: tokens.sizes.avatarLarge + tokens.space.xl, height: tokens.sizes.avatarLarge + tokens.space.xl,
    borderRadius: tokens.radius.card, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.heroGlow
  }
});
