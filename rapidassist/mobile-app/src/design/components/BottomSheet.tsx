import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";

type Props = {
  children: ReactNode;
  /** Sticky actions pinned to the bottom edge of the sheet. */
  footer?: ReactNode;
  /** Collapsed height (excluding the bottom safe-area inset). */
  peek?: number;
  /** Expanded height as a fraction of the window. */
  maxRatio?: number;
  /** Fixed sheets have no drag handle, size to their content and sit in the layout flow (docked under a map). */
  fixed?: boolean;
  /** Sit flush on top of a tab bar instead of the screen bottom (skips the safe-area inset). */
  aboveTabBar?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Map-screen bottom sheet: 28px top radius, drag handle, two snap points (peek / expanded),
 * scrollable body and an always-visible footer. Height is animated, so the footer never hides.
 */
export function BottomSheet({
  children, footer, peek = tokens.sizes.sheetPeek, maxRatio = 0.86, fixed, aboveTabBar,
  onExpandedChange, contentStyle, accessibilityLabel = "Details", testID
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomInset = aboveTabBar ? 0 : insets.bottom;
  const low = peek + bottomInset;
  const high = Math.max(low, Math.round(windowHeight * maxRatio));
  const height = useRef(new Animated.Value(low)).current;
  const current = useRef(low);
  const [expanded, setExpanded] = useState(false);
  const changed = useRef(onExpandedChange);
  changed.current = onExpandedChange;

  const snap = (open: boolean) => {
    current.current = open ? high : low;
    Animated.spring(height, { toValue: current.current, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
    setExpanded(open);
    changed.current?.(open);
  };
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // Re-snap when the window or peek changes (rotation, web resize, a different stage).
  useEffect(() => { snapRef.current(expanded); }, [low, high]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !fixed && Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => height.setValue(Math.min(high, Math.max(low, current.current - g.dy))),
    onPanResponderRelease: (_, g) => {
      const at = current.current - g.dy;
      snapRef.current(g.vy < -0.3 || (g.vy <= 0.3 && at > (low + high) / 2));
    }
  }), [fixed, high, low, height]);

  return (
    <Animated.View testID={testID} style={[styles.sheet, fixed ? styles.docked : { height }, { paddingBottom: bottomInset }]}>
      {fixed ? <View style={styles.fixedTop} /> : (
        <View {...pan.panHandlers}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${accessibilityLabel.toLowerCase()}`}
            accessibilityState={{ expanded }} onPress={() => { tapFeedback(); snap(!expanded); }} style={styles.handleArea}>
            <View style={styles.handle} />
          </Pressable>
        </View>
      )}
      {fixed ? <View style={[styles.body, contentStyle]}>{children}</View> : (
        <ScrollView style={styles.flex} contentContainerStyle={[styles.body, contentStyle]} scrollEnabled={expanded}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.sheet, borderTopRightRadius: tokens.radius.sheet, overflow: "hidden",
    width: "100%", maxWidth: tokens.sizes.maxContent, alignSelf: "center", marginHorizontal: "auto", ...tokens.shadow.sheet
  },
  docked: { position: "relative", marginTop: -tokens.radius.sheet },
  flex: { flex: 1 },
  handleArea: { alignItems: "center", paddingTop: tokens.space.md, paddingBottom: tokens.space.sm, minHeight: tokens.space.xl },
  handle: { width: tokens.sizes.sheetHandle, height: tokens.sizes.sheetHandleHeight, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.line },
  fixedTop: { height: tokens.space.screen },
  body: { gap: tokens.space.lg, paddingHorizontal: tokens.space.screen, paddingBottom: tokens.space.lg },
  footer: { gap: tokens.space.md, paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.sm, paddingBottom: tokens.space.lg, backgroundColor: tokens.color.surface }
});
