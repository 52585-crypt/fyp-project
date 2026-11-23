import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { RapidAssistMapStatus } from "./RapidAssistMap.types";
import { tokens } from "../../design/tokens";

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
        {resolvedLoading && !resolvedError ? <ActivityIndicator accessibilityLabel={resolvedLoadingMessage} color={tokens.color.primary} /> : null}
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
    backgroundColor: tokens.color.surfaceGlass
  },
  panel: {
    maxWidth: 300,
    margin: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    gap: 8
  },
  title: { color: tokens.color.text, fontSize: tokens.size.body, fontFamily: tokens.font.bold, textAlign: "center" },
  message: { color: tokens.color.muted, fontSize: tokens.size.caption, lineHeight: tokens.lineHeight.bodySmall, textAlign: "center" },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  button: { borderRadius: 10, backgroundColor: tokens.color.primary, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { color: tokens.color.onPrimary, fontSize: tokens.size.caption, fontFamily: tokens.font.bold },
  fallbackButton: { backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border },
  fallbackText: { color: tokens.color.primaryDark, fontSize: tokens.size.caption, fontFamily: tokens.font.bold }
});
