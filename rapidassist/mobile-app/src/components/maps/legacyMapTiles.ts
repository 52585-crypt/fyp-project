const CARTO_API_KEY = process.env.EXPO_PUBLIC_CARTO_BASEMAP_API_KEY?.trim() || "";

export type LegacyMapTileConfig = {
  baseUrl: string;
  query: string;
  attribution: string;
  usesCarto: boolean;
};

/**
 * Raster tiles for the non-Google maps (tile canvas, previews, legacy pickers).
 * CARTO Voyager, not tile.openstreetmap.org: OSM's volunteer servers block app/localhost traffic
 * (403 "not following the tile usage policy"). Tiles are rendered manually, so the plain host is used
 * instead of the {s} subdomain template. The key is optional and only sent when configured.
 */
export const LEGACY_MAP_TILES: LegacyMapTileConfig = {
  baseUrl: "https://basemaps.cartocdn.com/rastertiles/voyager",
  query: CARTO_API_KEY ? `?key=${encodeURIComponent(CARTO_API_KEY)}` : "",
  attribution: "© OpenStreetMap contributors © CARTO",
  usesCarto: true
};

export function legacyMapTileUrl(zoom: number, x: number, y: number) {
  return `${LEGACY_MAP_TILES.baseUrl}/${zoom}/${x}/${y}.png${LEGACY_MAP_TILES.query}`;
}
