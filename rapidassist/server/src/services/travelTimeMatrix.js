const DEFAULT_TABLE_URL = "https://router.project-osrm.org/table/v1/driving";
const { isGoogleLocationExpired } = require("./googleLocationPolicy");
const DEFAULT_SPEED_KMH = 25;
const CACHE_MS = 20000;
const MAX_POINTS_PER_REQUEST = 90;
const cache = new Map();

function idOf(value) {
  return String(value?.id ?? value?._id ?? value?.requestId ?? value?.providerId ?? value);
}

function coordinatesOf(value) {
  const location = value.location || value.pickupLocation || value.providerState?.currentLocation || value;
  if (!location || isGoogleLocationExpired(location) || location.lat == null || location.lng == null) return null;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function cacheKey(providers, requests) {
  const point = (value) => {
    const coordinate = coordinatesOf(value);
    return `${idOf(value)}@${coordinate?.lat.toFixed(4)},${coordinate?.lng.toFixed(4)}`;
  };
  return `${providers.map(point).join("|")}=>${requests.map(point).join("|")}`;
}

function fallbackBlock(providers, requests) {
  const result = new Map();
  providers.forEach((provider) => {
    requests.forEach((request) => {
      const from = coordinatesOf(provider);
      const to = coordinatesOf(request);
      if (!from || !to) return;
      const directDistanceKm = distanceKm(from, to);
      result.set(`${idOf(provider)}:${idOf(request)}`, {
        durationSeconds: Math.max(60, Math.round((directDistanceKm / DEFAULT_SPEED_KMH) * 3600)),
        distanceMeters: Math.round(directDistanceKm * 1000),
        source: "haversine_fallback"
      });
    });
  });
  return result;
}

async function fetchBlock(providers, requests, { fetchImpl = global.fetch, timeoutMs = 5000 } = {}) {
  if (process.env.NODE_ENV === "test" || process.env.DISPATCH_ROUTING_MODE === "fallback") {
    return fallbackBlock(providers, requests);
  }
  const all = [...providers, ...requests];
  const coordinates = all.map(coordinatesOf);
  if (coordinates.some((item) => !item)) return fallbackBlock(providers, requests);
  const providerIndexes = providers.map((_, index) => index).join(";");
  const requestIndexes = requests.map((_, index) => providers.length + index).join(";");
  const encodedCoordinates = coordinates.map(({ lng, lat }) => `${lng},${lat}`).join(";");
  const base = process.env.OSRM_TABLE_URL || DEFAULT_TABLE_URL;
  const url = `${base}/${encodedCoordinates}?sources=${providerIndexes}&destinations=${requestIndexes}&annotations=duration,distance`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`OSRM table returned ${response.status}`);
    const data = await response.json();
    if (data.code !== "Ok" || !Array.isArray(data.durations)) throw new Error(data.message || "Invalid OSRM table response");
    const result = new Map();
    providers.forEach((provider, providerIndex) => {
      requests.forEach((request, requestIndex) => {
        const durationSeconds = data.durations?.[providerIndex]?.[requestIndex];
        if (!Number.isFinite(durationSeconds)) return;
        const distanceMeters = data.distances?.[providerIndex]?.[requestIndex];
        result.set(`${idOf(provider)}:${idOf(request)}`, {
          durationSeconds: Math.max(1, Math.round(durationSeconds)),
          distanceMeters: Number.isFinite(distanceMeters) ? Math.round(distanceMeters) : null,
          source: "osrm"
        });
      });
    });
    return result;
  } catch (error) {
    return fallbackBlock(providers, requests);
  } finally {
    clearTimeout(timer);
  }
}

async function getTravelTimeMatrix(providers, requests, options = {}) {
  const validProviders = providers.filter(coordinatesOf);
  const validRequests = requests.filter(coordinatesOf);
  const result = new Map();
  if (!validProviders.length || !validRequests.length) return result;
  const blockSize = Math.max(1, Math.floor(MAX_POINTS_PER_REQUEST / 2));
  for (const providerBlock of chunks(validProviders, blockSize)) {
    for (const requestBlock of chunks(validRequests, blockSize)) {
      const key = cacheKey(providerBlock, requestBlock);
      const cached = cache.get(key);
      let block;
      if (cached?.expiresAt > Date.now()) block = cached.value;
      else {
        block = await fetchBlock(providerBlock, requestBlock, options);
        cache.set(key, { expiresAt: Date.now() + CACHE_MS, value: block });
      }
      block.forEach((value, pairKey) => result.set(pairKey, value));
    }
  }
  return result;
}

module.exports = { getTravelTimeMatrix, fallbackBlock };
