import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Icon, type IconName } from "./Icon";

const useNativeDriver = Platform.OS !== "web";

/** Expanding rings around an icon — "searching for a provider". */
export function Pulse({ icon, active = true }: { icon: IconName; active?: boolean }) {
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(ring, { toValue: 1, duration: tokens.motion.pulse * 1.4, useNativeDriver }));
    loop.start();
    return () => { loop.stop(); ring.setValue(0); };
  }, [active, ring]);
  const size = tokens.sizes.pulse;
  const ringStyle = {
    transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] }) }],
    opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] })
  };
  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessibilityLabel="Searching" accessibilityRole="progressbar">
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ringStyle]} />
      <View style={[styles.outer, { width: size * 0.8, height: size * 0.8, borderRadius: size * 0.4 }]}>
        <View style={[styles.inner, { width: size * 0.56, height: size * 0.56, borderRadius: size * 0.28 }]}>
          <Icon name={icon} size={tokens.sizes.avatar} color="onPrimary" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", alignSelf: "center" },
  ring: { position: "absolute", backgroundColor: tokens.color.primaryMuted },
  outer: { backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center" },
  inner: { backgroundColor: tokens.color.primary, alignItems: "center", justifyContent: "center" }
});
