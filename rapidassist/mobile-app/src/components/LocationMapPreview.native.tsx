import React, { useMemo } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { buildPreviewHtml, type MapPreviewProps } from "./LocationMapPreview.shared";
export function LocationMapPreview(props: MapPreviewProps) {
  const html = useMemo(() => buildPreviewHtml(props), [props.pickup, props.destination, props.route, props.providers, props.pickupLabel, props.destinationLabel, props.title]);
  return <View style={{ height: 260, borderRadius: 18, overflow: "hidden" }}>
    <WebView originWhitelist={["*"]} source={{ html }} javaScriptEnabled scrollEnabled={false} style={{ flex: 1 }} />
  </View>;
}
