import { tokens } from "../../design/tokens";
import type { MapCanvasService } from "./MapCanvas.types";

/**
 * Provider marker look per service, shared by all three map renderers: a token colour and a simple line glyph
 * (24×24 viewBox, stroked with round caps). Web and the tile canvas use serviceMarkerSvg(); Android draws the
 * same paths with react-native-svg.
 */
export const SERVICE_MARKERS: Record<MapCanvasService, { fill: string; glyph: string; paths: readonly string[]; title: string }> = {
  mechanic: {
    fill: tokens.color.serviceMechanic,
    glyph: tokens.color.onServiceMechanic,
    title: "Mechanic",
    // Open-ended spanner: C-shaped head with a jaw notch, and a handle.
    paths: ["M17.04 4.27A4.5 4.5 0 1 0 19.73 6.96L16.6 7.4Z", "M12.32 11.68L5 19"]
  },
  towing: {
    fill: tokens.color.serviceTowing,
    glyph: tokens.color.onServiceTowing,
    title: "Tow truck",
    // Flatbed with cab and two wheels.
    paths: ["M3.7 17H3V8h10v9", "M13 10.5h4l3 3.5v3h-1.7", "M7.3 17h7.4",
      "M7.3 17a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0", "M18.3 17a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0"]
  },
  fuel_delivery: {
    fill: tokens.color.serviceFuel,
    glyph: tokens.color.onServiceFuel,
    title: "Fuel delivery",
    // Fuel pump with window and hose.
    paths: ["M5 20V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15", "M4 20h10", "M7 8h4", "M13 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"]
  }
};

/** Self-contained SVG for a provider marker (constants only, no caller text), e.g. for an <img> or a Google Maps icon. */
export function serviceMarkerSvg(service: MapCanvasService, size: number = tokens.sizes.mapMarkerProvider) {
  const look = SERVICE_MARKERS[service];
  const r = size / 2;
  const glyph = tokens.sizes.mapMarkerGlyph;
  const offset = (size - glyph) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="${look.fill}" stroke="${tokens.color.surface}" stroke-width="3"/>`
    + `<g transform="translate(${offset} ${offset}) scale(${glyph / 24})" fill="none" stroke="${look.glyph}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">`
    + look.paths.map((d) => `<path d="${d}"/>`).join("")
    + "</g></svg>";
}

export function serviceMarkerDataUrl(service: MapCanvasService, size?: number) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(serviceMarkerSvg(service, size))}`;
}
