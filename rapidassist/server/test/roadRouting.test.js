const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getDrivingRouteMetrics } = require("../src/services/roadRouting");

test("server obtains authoritative towing distance from OSRM coordinates", async () => {
  let requestedUrl = "";
  const result = await getDrivingRouteMetrics(
    { lat: 33.6844, lng: 73.0479 },
    { lat: 33.7001, lng: 73.0612 },
    {
      routeUrl: "https://routing.test/route/v1/driving",
      fetchImpl: async (url) => {
        requestedUrl = url;
        return { ok: true, json: async () => ({ code: "Ok", routes: [{ distance: 6450, duration: 780 }] }) };
      }
    }
  );
  assert.match(requestedUrl, /73\.0479,33\.6844;73\.0612,33\.7001/);
  assert.deepEqual(result, { distanceKm: 6.45, durationMinutes: 13 });
});

test("server rejects unavailable and invalid routes instead of pricing a fallback distance", async () => {
  await assert.rejects(
    getDrivingRouteMetrics({ lat: 91, lng: 73 }, { lat: 33, lng: 73 }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    getDrivingRouteMetrics(
      { lat: 33, lng: 73 },
      { lat: 34, lng: 74 },
      { fetchImpl: async () => ({ ok: true, json: async () => ({ code: "NoRoute", routes: [] }) }) }
    ),
    (error) => error.statusCode === 422 && /No driving route/.test(error.message)
  );
});

test("request pricing does not read client-provided distanceKm", () => {
  const controller = fs.readFileSync(path.resolve(__dirname, "../src/controllers/requests.controller.js"), "utf8");
  const estimateBody = controller.slice(controller.indexOf("function estimateFor"), controller.indexOf("function validateServiceDetails"));
  assert.doesNotMatch(estimateBody, /body\.distanceKm/);
  assert.match(controller, /await getDrivingRouteMetrics\(pickupLocation, destinationLocation\)/);
});
