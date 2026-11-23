import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, Text } from "../design/components";
import { tokens } from "../design/tokens";

/** Indigo brand panel used at the top of auth screens. */
export function AuthBrand({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <View style={styles.hero}>
      <View style={styles.glow} />
      <View style={styles.brandRow}>
        <View style={styles.logo}><Icon name="car-sport" color="primary" size={tokens.sizes.iconLarge} /></View>
        <Text variant="headline" color="onPrimary">RapidAssist</Text>
      </View>
      <Text variant="display" color="onPrimary">{title}</Text>
      {subtitle ? <Text variant="body" color="onPrimaryMuted">{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: tokens.color.primary, borderRadius: tokens.radius.sheet, padding: tokens.space.xl,
    gap: tokens.space.md, overflow: "hidden", ...tokens.shadow.raised
  },
  glow: {
    position: "absolute", right: -tokens.space.xxxl, bottom: -tokens.space.xxxl, width: tokens.sizes.heroArt * 1.4,
    height: tokens.sizes.heroArt * 1.4, borderRadius: tokens.sizes.heroArt, backgroundColor: tokens.color.heroGlow
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm },
  logo: {
    width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center"
  }
});
