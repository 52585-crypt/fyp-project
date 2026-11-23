import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

type Props = {
  title?: string;
  /** Show a back arrow. Pass a function to override navigation. */
  back?: boolean | (() => void);
  right?: ReactNode;
  left?: ReactNode;
};

/** Screen title bar: back arrow, centred title, optional right slot (e.g. SOS). */
export function Header({ title, back = true, right, left }: Props) {
  const goBack = () => {
    if (typeof back === "function") return back();
    if (router.canGoBack()) router.back(); else router.replace("/");
  };
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {left ?? (back ? <IconButton icon="arrow-back" label="Go back" tone="plain" color="text" onPress={goBack} /> : null)}
      </View>
      <Text variant="headline" align="center" numberOfLines={1} style={styles.title} accessibilityRole="header">{title}</Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row", alignItems: "center", minHeight: tokens.sizes.touchMin + tokens.space.sm,
    paddingHorizontal: tokens.space.md, width: "100%", maxWidth: tokens.sizes.maxContent, alignSelf: "center"
  },
  side: { width: tokens.sizes.touchMin + tokens.space.lg, alignItems: "flex-start" },
  right: { alignItems: "flex-end" },
  title: { flex: 1 }
});
