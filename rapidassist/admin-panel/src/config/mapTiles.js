// Raster base map for the admin maps. CARTO Voyager requires an API key; set VITE_CARTO_BASEMAP_API_KEY
// (the same key as the mobile app's EXPO_PUBLIC_CARTO_BASEMAP_API_KEY). Without it CARTO answers with
// "API key required" placeholder tiles, but the overlays still draw.
const CARTO_KEY = (import.meta.env.VITE_CARTO_BASEMAP_API_KEY || "").trim();

export const MAP_TILES = {
  baseUrl: "https://basemaps.cartocdn.com/rastertiles/voyager",
  query: CARTO_KEY ? `?key=${encodeURIComponent(CARTO_KEY)}` : ""
};
