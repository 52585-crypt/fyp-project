import { canvasPoints, isCoordinate, parseCanvasMessage } from "./MapCanvas.types";

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
});
