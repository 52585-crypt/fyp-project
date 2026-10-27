import React, { useMemo } from "react";
import { View } from "react-native";
import { buildPreviewHtml, type MapPreviewProps } from "./LocationMapPreview.shared";
export function LocationMapPreview(props: MapPreviewProps) {
  const html = useMemo(() => buildPreviewHtml(props), [props.pickup, props.destination, props.route, props.providers, props.pickupLabel, props.destinationLabel, props.title]);
  return <View style={{ height: 260, borderRadius: 18, overflow: "hidden" }}>
    <iframe title={props.title || "Roadside assistance map"} srcDoc={html} sandbox="allow-scripts allow-popups" style={{ border: 0, width: "100%", height: "100%" }} />
  </View>;
}
