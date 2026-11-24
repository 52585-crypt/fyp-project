import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { parseCanvasMessage, type MapCanvasProps } from "./MapCanvas.types";
import { buildTileCanvasHtml, tileCanvasState } from "./tileCanvasHtml";

let nextInstance = 0;

/** OSM tile canvas inside a sandboxed iframe (web without a Google Maps key). */
export function TileCanvas(props: MapCanvasProps) {
  const instance = useRef(`canvas-${++nextInstance}`).current;
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => buildTileCanvasHtml(instance, props), [instance]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = JSON.stringify(tileCanvasState(props));
  const onCenter = useRef(props.onCenterChange);
  onCenter.current = props.onCenterChange;

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ rapidassistMapState: state }, "*");
  }, [state]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const center = parseCanvasMessage((event.data as { rapidassistMap?: unknown } | null)?.rapidassistMap, instance);
      if (center) onCenter.current?.(center);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [instance]);

  return (
    <View style={[styles.fill, props.style]} testID={props.testID} accessibilityLabel={props.accessibilityLabel}>
      <iframe ref={frame} title={props.accessibilityLabel || "Map"} srcDoc={html} sandbox="allow-scripts allow-popups"
        onLoad={() => frame.current?.contentWindow?.postMessage({ rapidassistMapState: state }, "*")}
        style={{ border: 0, width: "100%", height: "100%" }} />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
