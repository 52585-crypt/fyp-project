import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { parseCanvasMessage, type MapCanvasProps } from "./MapCanvas.types";
import { buildTileCanvasHtml, tileCanvasState } from "./tileCanvasHtml";

let nextInstance = 0;

/** OSM tile canvas inside a WebView (Android without a Google Maps key). */
export function TileCanvas(props: MapCanvasProps) {
  const instance = useRef(`canvas-${++nextInstance}`).current;
  const web = useRef<WebView>(null);
  const loaded = useRef(false);
  // The document is built once; later prop changes are pushed in so pan/zoom state survives.
  const html = useMemo(() => buildTileCanvasHtml(instance, props), [instance]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = JSON.stringify(tileCanvasState(props));
  const onCenter = useRef(props.onCenterChange);
  onCenter.current = props.onCenterChange;

  useEffect(() => {
    if (loaded.current) web.current?.injectJavaScript(`window.rapidassistUpdate(${state});true;`);
  }, [state]);

  function onMessage(event: WebViewMessageEvent) {
    const center = parseCanvasMessage(event.nativeEvent.data, instance);
    if (center) onCenter.current?.(center);
  }

  return (
    <View style={[styles.fill, props.style]} testID={props.testID} accessibilityLabel={props.accessibilityLabel}>
      <WebView ref={web} originWhitelist={["*"]} source={{ html }} javaScriptEnabled scrollEnabled={false}
        onLoadEnd={() => { loaded.current = true; web.current?.injectJavaScript(`window.rapidassistUpdate(${state});true;`); }}
        onMessage={onMessage} style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
