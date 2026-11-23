import { tokens } from "../design/tokens";
import React, { useMemo } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { buildPreviewHtml, type MapPreviewProps } from "./LocationMapPreview.shared";
export function LocationMapPreview(props: MapPreviewProps) {
  const html = useMemo(() => buildPreviewHtml(props), [props.pickup, props.destination, props.route, props.providers, props.pickupLabel, props.destinationLabel, props.title, props.interactive]);
  return <View style={{ flex: 1, minHeight: tokens.sizes.map, overflow: "hidden" }}>
    <WebView originWhitelist={["*"]} source={{ html }} javaScriptEnabled scrollEnabled={false}
      nestedScrollEnabled={props.interactive} style={{ flex: 1 }} />
  </View>;
}
