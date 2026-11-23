import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RapidAssistMap } from "./RapidAssistMap";
import type { RapidAssistMapProps } from "./RapidAssistMap.types";
import { tokens } from "../../design/tokens";

const DEFAULT_FALLBACK_MESSAGE = "The basic OpenStreetMap view is active.";

export type RapidAssistMapWithFallbackProps = RapidAssistMapProps & {
  fallback: React.ReactNode;
};

class MapRendererBoundary extends React.Component<{
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError: (message: string) => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || "MapLibre could not start on this device.");
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RapidAssistMapWithFallback({
  fallback,
  ...props
}: RapidAssistMapWithFallbackProps) {
  const [legacy, setLegacy] = useState(false);
  const [rendererKey, setRendererKey] = useState(0);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  const showFallback = useCallback((message?: string) => {
    setFallbackMessage(message || DEFAULT_FALLBACK_MESSAGE);
    setLegacy(true);
    props.onFallback?.();
  }, [props.onFallback]);

  const retryMapLibre = useCallback(() => {
    setFallbackMessage(null);
    setRendererKey((value) => value + 1);
    setLegacy(false);
  }, []);

  const reportRendererError = useCallback((message: string) => {
    setFallbackMessage(message);
    props.onError?.(message);
  }, [props.onError]);

  const handleRendererCrash = useCallback((message: string) => {
    reportRendererError(message);
    showFallback(message);
  }, [reportRendererError, showFallback]);

  const fallbackContent = (
    <View style={styles.root} testID={`${props.testID || "rapidassist-map"}-fallback`}>
      {fallback}
      <View style={styles.fallbackNotice} accessibilityLiveRegion="polite">
        <Text style={styles.fallbackTitle}>Basic map active</Text>
        <Text numberOfLines={3} style={styles.fallbackMessage}>{fallbackMessage || DEFAULT_FALLBACK_MESSAGE}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try MapLibre again"
          onPress={retryMapLibre}
          style={styles.tryButton}
        >
          <Text style={styles.tryText}>Try MapLibre again</Text>
        </Pressable>
      </View>
    </View>
  );
  if (legacy) {
    return fallbackContent;
  }
  return (
    <MapRendererBoundary
      key={rendererKey}
      fallback={fallbackContent}
      onError={handleRendererCrash}
    >
      <RapidAssistMap
        {...props}
        onFallback={() => showFallback(fallbackMessage || undefined)}
        onError={reportRendererError}
      />
    </MapRendererBoundary>
  );
}

const styles = StyleSheet.create({
  root: { position: "relative" },
  fallbackNotice: {
    position: "absolute",
    top: 10,
    right: 10,
    maxWidth: 230,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    backgroundColor: tokens.color.surfaceGlass,
    borderWidth: 1,
    borderColor: tokens.color.border
  },
  fallbackTitle: { color: tokens.color.text, fontSize: tokens.size.micro, fontFamily: tokens.font.bold },
  fallbackMessage: { color: tokens.color.muted, fontSize: tokens.size.micro, lineHeight: tokens.lineHeight.micro },
  tryButton: {
    alignSelf: "flex-start",
    marginTop: 3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: tokens.color.primary
  },
  tryText: { color: tokens.color.onPrimary, fontSize: tokens.size.micro, fontFamily: tokens.font.bold }
});
