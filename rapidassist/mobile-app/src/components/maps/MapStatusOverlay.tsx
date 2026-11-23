import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import type { RapidAssistMapStatus } from "./RapidAssistMap.types";

export type MapStatusOverlayProps = {
  status?: RapidAssistMapStatus;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onFallback?: () => void;
  loadingMessage?: string;
  errorTitle?: string;
};

export function MapStatusOverlay({
  status,
  loading,
  error,
  onRetry,
  onFallback,
  loadingMessage = "Loading map…",
  errorTitle = "Map unavailable"
}: MapStatusOverlayProps) {
  const resolvedError = status
    ? status.state === "error" ? status.message : null
    : error;
  const resolvedLoading = status ? status.state === "loading" : Boolean(loading);
  const resolvedLoadingMessage = status?.state === "loading" && status.message
    ? status.message
    : loadingMessage;
  if (!resolvedLoading && !resolvedError) return null;
  return (
    <View
      pointerEvents={resolvedError ? "auto" : "none"}
      style={styles.overlay}
      accessibilityLiveRegion="polite"
      accessibilityRole={resolvedError ? "alert" : undefined}
      testID="map-status-overlay"
    >
      <View style={styles.panel}>
        {resolvedLoading && !resolvedError ? <ActivityIndicator accessibilityLabel={resolvedLoadingMessage} color={colors.primary} /> : null}
        <Text style={styles.title}>{resolvedError ? errorTitle : resolvedLoadingMessage}</Text>
        {resolvedError ? <Text style={styles.message}>{resolvedError}</Text> : null}
        {resolvedError && (onRetry || onFallback) ? (
          <View style={styles.actions}>
            {onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading map" onPress={onRetry} style={styles.button}><Text style={styles.buttonText}>Retry</Text></Pressable> : null}
            {onFallback ? <Pressable accessibilityRole="button" accessibilityLabel="Use basic map" onPress={onFallback} style={[styles.button, styles.fallbackButton]}><Text style={styles.fallbackText}>Use basic map</Text></Pressable> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    backgroundColor: "rgba(238, 244, 241, 0.82)"
  },
  panel: {
    maxWidth: 300,
    margin: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: 8
  },
  title: { color: colors.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
  message: { color: colors.mutedText, fontSize: 12, lineHeight: 17, textAlign: "center" },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  button: { borderRadius: 10, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { color: "white", fontSize: 12, fontWeight: "900" },
  fallbackButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  fallbackText: { color: colors.primaryDark, fontSize: 12, fontWeight: "900" }
});
