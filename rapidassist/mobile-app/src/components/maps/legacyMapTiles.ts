const CARTO_API_KEY = process.env.EXPO_PUBLIC_CARTO_BASEMAP_API_KEY?.trim() || "";

export type LegacyMapTileConfig = {
  baseUrl: string;
  query: string;
  attribution: string;
  usesCarto: boolean;
};

export const LEGACY_MAP_TILES: LegacyMapTileConfig = CARTO_API_KEY
  ? {
      baseUrl: "https://basemaps.cartocdn.com/rastertiles/voyager",
      query: `?key=${encodeURIComponent(CARTO_API_KEY)}`,
      attribution: "OpenStreetMap, CARTO",
      usesCarto: true
    }
  : {
      baseUrl: "https://tile.openstreetmap.org",
      query: "",
      attribution: "OpenStreetMap",
      usesCarto: false
    };

export function legacyMapTileUrl(zoom: number, x: number, y: number) {
  return `${LEGACY_MAP_TILES.baseUrl}/${zoom}/${x}/${y}.png${LEGACY_MAP_TILES.query}`;
}
