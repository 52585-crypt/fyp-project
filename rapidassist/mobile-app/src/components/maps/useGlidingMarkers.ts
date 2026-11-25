import { useEffect, useRef, useState } from "react";
import type { Coordinate } from "../../utils/distance";
import { glidePoint, MAP_CANVAS_GLIDE_MS, shouldGlide, type MapCanvasMarker } from "./MapCanvas.types";

type Glide = { from: Coordinate; to: Coordinate; start: number };

const same = (a: Coordinate, b: Coordinate) => a.latitude === b.latitude && a.longitude === b.longitude;

/**
 * Pure step of the glide bookkeeping: given where each marker was last drawn and the running glides, returns the
 * coordinate to draw now for every marker and updates both maps. A new target glides from the currently drawn
 * position (even mid-glide); a first sighting or a jump over the snap distance is drawn at once.
 */
export function glideFrame(markers: MapCanvasMarker[], shown: Map<string, Coordinate>, glides: Map<string, Glide>, now: number) {
  const ids = new Set(markers.map((m) => m.id));
  for (const id of [...shown.keys()]) if (!ids.has(id)) { shown.delete(id); glides.delete(id); }
  return markers.map((m) => {
    let glide = glides.get(m.id);
    const last = shown.get(m.id);
    if ((!glide || !same(glide.to, m.coordinate)) && last && !same(last, m.coordinate)) {
      glide = shouldGlide(last, m.coordinate) ? { from: last, to: m.coordinate, start: now } : undefined;
      if (glide) glides.set(m.id, glide); else glides.delete(m.id);
    }
    let coordinate = m.coordinate;
    if (glide) {
      const t = (now - glide.start) / MAP_CANVAS_GLIDE_MS;
      if (t >= 1) glides.delete(m.id);
      else coordinate = glidePoint(glide.from, glide.to, t);
    }
    shown.set(m.id, coordinate);
    return coordinate === m.coordinate ? m : { ...m, coordinate };
  });
}

/**
 * Markers whose coordinates glide to each new position (live provider updates) instead of jumping, for the
 * react-native-maps and Google Maps JS renderers. Re-renders once per animation frame only while a glide runs.
 * (The OSM tile canvas animates inside its own document; see tileCanvasHtml.ts.)
 */
export function useGlidingMarkers(markers: MapCanvasMarker[]): MapCanvasMarker[] {
  const shown = useRef(new Map<string, Coordinate>()).current;
  const glides = useRef(new Map<string, Glide>()).current;
  const [frame, setFrame] = useState(0);
  const result = glideFrame(markers, shown, glides, Date.now());
  const gliding = glides.size > 0;

  useEffect(() => {
    if (!gliding) return;
    const raf = requestAnimationFrame(() => setFrame((f) => f + 1));
    return () => cancelAnimationFrame(raf);
  }, [gliding, frame]);

  return result;
}
