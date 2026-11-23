import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { tokens } from "../tokens";

type Props = {
  children: ReactNode;
  /** Rendered above the scroll area (usually <Header />). */
  header?: ReactNode;
  /** Sticky bottom area for primary actions. */
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  /** Tab screens sit above a tab bar, so they skip the bottom inset. */
  edges?: Edge[];
  testID?: string;
};

/** Page scaffold: safe area, background, 20px padding, keyboard handling, optional pull-to-refresh. */
export function Screen({
  children, header, footer, scroll = true, padded = true, refreshing, onRefresh, contentStyle,
  edges = ["top", "bottom", "left", "right"], testID
}: Props) {
  const inner = [styles.content, padded && styles.padded, contentStyle];
  return (
    <SafeAreaView style={styles.safe} edges={edges} testID={testID}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {header}
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={inner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={tokens.color.primary} colors={[tokens.color.primary]} />
            ) : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, inner]}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.color.bg },
  flex: { flex: 1 },
  content: { gap: tokens.space.lg, width: "100%", maxWidth: tokens.sizes.maxContent, alignSelf: "center", paddingBottom: tokens.space.xl },
  padded: { paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.sm },
  footer: {
    gap: tokens.space.md, paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.md, paddingBottom: tokens.space.lg,
    width: "100%", maxWidth: tokens.sizes.maxContent, alignSelf: "center", backgroundColor: tokens.color.bg
  }
});
