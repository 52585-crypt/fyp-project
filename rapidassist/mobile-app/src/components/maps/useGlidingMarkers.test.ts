import { glidePoint, glideProgress, MAP_CANVAS_GLIDE_MS, shouldGlide, type MapCanvasMarker } from "./MapCanvas.types";
import { glideFrame } from "./useGlidingMarkers";

const A = { latitude: 33.7200, longitude: 73.0600 };
const B = { latitude: 33.7180, longitude: 73.0580 }; // ≈ 280 m from A
const FAR = { latitude: 33.6000, longitude: 73.0500 }; // ≈ 13 km from A
const provider = (coordinate: typeof A): MapCanvasMarker => ({ id: "provider", kind: "provider", coordinate });

describe("marker glide", () => {
  it("eases out and lands exactly on the target", () => {
    expect(glideProgress(0)).toBe(0);
    expect(glideProgress(0.5)).toBeCloseTo(0.875);
    expect(glideProgress(1)).toBe(1);
    expect(glideProgress(2)).toBe(1);
    expect(glidePoint(A, B, 1)).toEqual(B);
  });

  it("glides short moves and snaps long jumps", () => {
    expect(shouldGlide(A, B)).toBe(true);
    expect(shouldGlide(A, A)).toBe(false);
    expect(shouldGlide(A, FAR)).toBe(false);
  });

  it("draws a moved marker between the old and new position, then on the new one", () => {
    const shown = new Map(); const glides = new Map();
    expect(glideFrame([provider(A)], shown, glides, 0)[0].coordinate).toEqual(A); // first sighting: no glide
    const mid = glideFrame([provider(B)], shown, glides, 1000)[0].coordinate; // update arrives, glide starts
    expect(mid).toEqual(A);
    const half = glideFrame([provider(B)], shown, glides, 1000 + MAP_CANVAS_GLIDE_MS / 2)[0].coordinate;
    expect(half.latitude).toBeLessThan(A.latitude);
    expect(half.latitude).toBeGreaterThan(B.latitude);
    expect(glideFrame([provider(B)], shown, glides, 1000 + MAP_CANVAS_GLIDE_MS)[0].coordinate).toEqual(B);
    expect(glides.size).toBe(0);
  });

  it("retargets mid-glide from where the marker is drawn, snaps far jumps and forgets removed markers", () => {
    const shown = new Map(); const glides = new Map();
    glideFrame([provider(A)], shown, glides, 0);
    glideFrame([provider(B)], shown, glides, 100);
    const drawn = glideFrame([provider(B)], shown, glides, 100 + MAP_CANVAS_GLIDE_MS / 3)[0].coordinate;
    const C = { latitude: 33.7160, longitude: 73.0560 };
    expect(glideFrame([provider(C)], shown, glides, 100 + MAP_CANVAS_GLIDE_MS / 3)[0].coordinate).toEqual(drawn);
    expect(glides.get("provider").from).toEqual(drawn);
    expect(glideFrame([provider(FAR)], shown, glides, 2000)[0].coordinate).toEqual(FAR);
    glideFrame([], shown, glides, 3000);
    expect(shown.size).toBe(0);
  });
});
