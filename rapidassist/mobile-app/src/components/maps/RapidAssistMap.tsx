import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { MapStatusOverlay } from "./MapStatusOverlay";
import type { RapidAssistMapProps } from "./RapidAssistMap.types";
import { tokens } from "../../design/tokens";

// Android and Web resolve their dedicated platform files. This keeps unsupported
// platforms safe and prevents a native MapLibre import from entering Web bundles.
export function RapidAssistMap({ style, onError, onFallback, testID = "rapidassist-map" }: RapidAssistMapProps) {
  const message = "MapLibre is unavailable on this platform. Use the basic map instead.";
  useEffect(() => {
    onError?.(message);
  }, [onError]);
  return (
    <View style={[styles.root, style]} testID={testID}>
      <MapStatusOverlay status={{ state: "error", message }} onFallback={onFallback} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 240, backgroundColor: tokens.color.surfaceAlt }
});
