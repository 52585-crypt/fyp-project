import { accuracyRadius, canvasPoints, isCoordinate, parseCanvasMarkerTap, parseCanvasMessage } from "./MapCanvas.types";

describe("MapCanvas helpers", () => {
  it("accepts only centre reports from its own canvas instance", () => {
    const msg = (o: object) => JSON.stringify(o);
    expect(parseCanvasMessage(msg({ type: "center", id: "canvas-1", latitude: 31.5, longitude: 74.3 }), "canvas-1"))
      .toEqual({ latitude: 31.5, longitude: 74.3 });
    expect(parseCanvasMessage(msg({ type: "center", id: "canvas-2", latitude: 31.5, longitude: 74.3 }), "canvas-1")).toBeNull();
    expect(parseCanvasMessage(msg({ type: "mapPress", id: "canvas-1", latitude: 31.5, longitude: 74.3 }), "canvas-1")).toBeNull();
    expect(parseCanvasMessage(msg({ type: "center", id: "canvas-1", latitude: 120, longitude: 74.3 }), "canvas-1")).toBeNull();
    expect(parseCanvasMessage("not json", "canvas-1")).toBeNull();
    expect(parseCanvasMessage({ type: "center" }, "canvas-1")).toBeNull();
  });

  it("collects valid marker and route points for the camera", () => {
    const pts = canvasPoints(
      [{ id: "p", kind: "pickup", coordinate: { latitude: 1, longitude: 2 } }, { id: "x", kind: "user", coordinate: { latitude: NaN, longitude: 2 } }],
      [{ latitude: 3, longitude: 4 }]
    );
    expect(pts).toEqual([{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }]);
    expect(isCoordinate({ latitude: 0, longitude: 181 })).toBe(false);
  });

  it("parses marker taps only for this canvas and only as a string id", () => {
    const tap = (m: object) => JSON.stringify({ type: "marker", id: "canvas-1", ...m });
    expect(parseCanvasMarkerTap(tap({ marker: "provider:42" }), "canvas-1")).toBe("provider:42");
    expect(parseCanvasMarkerTap(tap({ marker: "provider:42" }), "canvas-2")).toBeNull();
    expect(parseCanvasMarkerTap(tap({ marker: { toString: 1 } }), "canvas-1")).toBeNull();
    expect(parseCanvasMarkerTap(tap({ marker: "" }), "canvas-1")).toBeNull();
    expect(parseCanvasMarkerTap(JSON.stringify({ type: "center", id: "canvas-1", latitude: 1, longitude: 2 }), "canvas-1")).toBeNull();
    expect(parseCanvasMarkerTap("not json", "canvas-1")).toBeNull();
    expect(parseCanvasMarkerTap({ type: "marker" }, "canvas-1")).toBeNull();
  });

  it("draws an accuracy circle only for the customer's own marker, capped at the coarsest accepted fix", () => {
    expect(accuracyRadius({ kind: "user", accuracyMeters: 800 })).toBe(800);
    expect(accuracyRadius({ kind: "user", accuracyMeters: 9000 })).toBe(2000);
    expect(accuracyRadius({ kind: "user" })).toBeNull();
    expect(accuracyRadius({ kind: "user", accuracyMeters: 0 })).toBeNull();
    expect(accuracyRadius({ kind: "user", accuracyMeters: NaN })).toBeNull();
    expect(accuracyRadius({ kind: "provider", accuracyMeters: 800 })).toBeNull();
  });

  it("keeps ambient markers (nearby providers) out of camera fitting", () => {
    expect(canvasPoints([
      { id: "me", kind: "user", coordinate: { latitude: 33.7, longitude: 73.05 } },
      { id: "provider:1", kind: "provider", service: "towing", ambient: true, coordinate: { latitude: 33.6, longitude: 73.1 } }
    ])).toEqual([{ latitude: 33.7, longitude: 73.05 }]);
  });
});
