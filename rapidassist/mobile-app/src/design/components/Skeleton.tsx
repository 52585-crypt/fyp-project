import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View, type DimensionValue } from "react-native";
import { tokens } from "../tokens";

const useNativeDriver = Platform.OS !== "web";

/** Shimmering placeholder block. */
export function Skeleton({ width = "100%", height = tokens.space.lg, radius = tokens.radius.sm }: { width?: DimensionValue; height?: number; radius?: number }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: tokens.motion.pulse / 2, useNativeDriver }),
      Animated.timing(opacity, { toValue: 0.5, duration: tokens.motion.pulse / 2, useNativeDriver })
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width, height, borderRadius: radius, backgroundColor: tokens.color.border, opacity }} />;
}

/** Card-shaped skeleton used while a screen loads. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.card} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <View style={styles.row}>
        <Skeleton width={tokens.sizes.avatar} height={tokens.sizes.avatar} radius={tokens.sizes.avatar / 2} />
        <View style={styles.flex}>
          <Skeleton width="60%" />
          <Skeleton width="40%" height={tokens.space.md} />
        </View>
      </View>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 ? "70%" : "100%"} height={tokens.space.md} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.space.md, padding: tokens.space.lg, borderRadius: tokens.radius.card, backgroundColor: tokens.color.surface,
    borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border
  },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  flex: { flex: 1, gap: tokens.space.sm }
});
