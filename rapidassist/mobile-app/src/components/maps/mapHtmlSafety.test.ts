import { JSDOM } from "jsdom";
import { buildPreviewHtml } from "../LocationMapPreview.shared";
import { safePoint, scriptJson } from "./mapHtmlSafety";
import { buildTileCanvasHtml, tileCanvasState } from "./tileCanvasHtml";
import { MAP_CANVAS_GLIDE_MS } from "./MapCanvas.types";

const XSS = "<img src=x onerror=alert(1)>";
const BREAKOUT = "</script><script>window.pwned = 1</script>";
const ATTR = "\" onmouseover=\"window.pwned=1";

/** Runs the generated map document with scripts enabled (like the iframe / WebView) and reports what happened. */
function run(html: string) {
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
  const w = dom.window as unknown as Window & { pwned?: number; alert: (m: unknown) => void };
  const alerts: unknown[] = [];
  w.alert = (m) => { alerts.push(m); };
  const doc = w.document;
  return {
    pwned: w.pwned,
    alerts,
    scripts: doc.querySelectorAll("script").length,
    injectedImgs: [...doc.querySelectorAll("img")].filter((i) => i.getAttribute("src") === "x").length,
    handlerAttrs: doc.querySelectorAll("[onerror],[onmouseover],[onload]").length,
    texts: [...doc.querySelectorAll(".lbl,.label,.hint")].map((e) => e.textContent),
    close: () => dom.window.close()
  };
}

describe("map documents treat names, labels and addresses as text", () => {
  it("tile canvas renders hostile marker labels literally and never executes them", () => {
    const html = buildTileCanvasHtml("canvas-test", {
      markers: [
        { id: "p", kind: "pickup", coordinate: { latitude: 31.52, longitude: 74.35 }, label: XSS },
        { id: "q", kind: "provider", coordinate: { latitude: 31.53, longitude: 74.36 }, label: BREAKOUT },
        { id: "r", kind: "destination", coordinate: { latitude: 31.54, longitude: 74.37 }, label: ATTR }
      ]
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("</script><script>");
    const r = run(html);
    expect(r.pwned).toBeUndefined();
    expect(r.alerts).toEqual([]);
    expect(r.scripts).toBe(1);
    expect(r.injectedImgs).toBe(0);
    expect(r.handlerAttrs).toBe(0);
    expect(r.texts).toEqual(expect.arrayContaining([XSS, BREAKOUT, ATTR]));
    r.close();
  });

  it("preview renders hostile provider names, labels and titles literally", () => {
    const html = buildPreviewHtml({
      pickup: { latitude: 31.52, longitude: 74.35 },
      destination: { latitude: 31.54, longitude: 74.37 },
      pickupLabel: XSS,
      destinationLabel: ATTR,
      title: BREAKOUT,
      providers: [{ id: "1", name: XSS, location: { latitude: 31.53, longitude: 74.36 } }]
    });
    expect(html).not.toContain("<img src=x");
    const r = run(html);
    expect(r.pwned).toBeUndefined();
    expect(r.alerts).toEqual([]);
    expect(r.scripts).toBe(1);
    expect(r.injectedImgs).toBe(0);
    expect(r.handlerAttrs).toBe(0);
    expect(r.texts).toEqual(expect.arrayContaining([XSS, ATTR, BREAKOUT]));
    r.close();
  });

  it("forces coordinates through Number() and whitelists marker kinds", () => {
    const hostile = { latitude: "31.5;alert(1)", longitude: 74.3 } as unknown;
    expect(safePoint(hostile)).toBeNull();
    expect(safePoint({ latitude: "31.5", longitude: "74.3" })).toEqual({ latitude: 31.5, longitude: 74.3 });
    const state = tileCanvasState({
      markers: [
        { id: "a", kind: "pickup", coordinate: hostile as never },
        { id: "b", kind: "x onerror" as never, coordinate: { latitude: 1, longitude: 2 } }
      ],
      route: [{ latitude: "</script>" as never, longitude: 1 }, { latitude: 3, longitude: 4 }]
    });
    expect(state.markers).toEqual([{ id: "b", kind: "pickup", coordinate: { latitude: 1, longitude: 2 }, label: undefined, ambient: false }]);
    expect(state.route).toEqual([{ latitude: 3, longitude: 4 }]);
  });

  it("whitelists provider services and keeps ambient provider names as literal accessible text", () => {
    const state = tileCanvasState({
      markers: [
        { id: "a", kind: "provider", service: "towing", ambient: true, coordinate: { latitude: 33.7, longitude: 73.05 } },
        { id: "b", kind: "provider", service: "x\" onerror=\"alert(1)" as never, coordinate: { latitude: 33.7, longitude: 73.05 } },
        { id: "c", kind: "pickup", service: "mechanic", coordinate: { latitude: 33.7, longitude: 73.05 } },
        { id: "d", kind: "provider", ambient: "yes" as never, coordinate: { latitude: 33.7, longitude: 73.05 } }
      ]
    });
    expect(state.markers.map((m) => [m.id, m.service, m.ambient])).toEqual([
      ["a", "towing", true], ["b", undefined, false], ["c", undefined, false], ["d", undefined, false]
    ]);

    const html = buildTileCanvasHtml("canvas-test", {
      markers: [
        { id: "m", kind: "provider", service: "mechanic", ambient: true, label: XSS, coordinate: { latitude: 33.7, longitude: 73.05 } },
        { id: "t", kind: "provider", service: "towing", ambient: true, label: BREAKOUT, coordinate: { latitude: 33.71, longitude: 73.06 } },
        { id: "f", kind: "provider", service: "fuel_delivery", ambient: true, label: ATTR, coordinate: { latitude: 33.69, longitude: 73.04 } },
        { id: "me", kind: "user", coordinate: { latitude: 33.7, longitude: 73.05 } }
      ]
    });
    const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
    const w = dom.window as unknown as Window & { pwned?: number };
    const icons = [...w.document.querySelectorAll("img.svc")];
    expect(w.pwned).toBeUndefined();
    expect(icons).toHaveLength(3);
    expect(icons.every((i) => i.getAttribute("src")!.startsWith("data:image/svg+xml"))).toBe(true);
    expect(new Set(icons.map((i) => i.getAttribute("src"))).size).toBe(3);
    expect(icons.map((i) => i.getAttribute("aria-label"))).toEqual([XSS, BREAKOUT, ATTR]);
    expect(w.document.querySelectorAll(".lbl")).toHaveLength(0);
    expect(w.document.querySelectorAll("[onerror],[onmouseover],[onload]")).toHaveLength(0);
    dom.window.close();
  });

  it("posts a tap on a marker as its id (set as data, never markup) and a drag as a pan", async () => {
    const hostileId = `provider:${BREAKOUT}`;
    const html = buildTileCanvasHtml("canvas-tap", {
      markers: [{ id: hostileId, kind: "provider", service: "towing", ambient: true, label: XSS, coordinate: { latitude: 33.7, longitude: 73.05 } }]
    });
    const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
    const w = dom.window as unknown as Window & { pwned?: number };
    const map = w.document.getElementById("map")!;
    (map as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    const posted: string[] = [];
    w.addEventListener("message", (e) => { const raw = (e.data as { rapidassistMap?: string })?.rapidassistMap; if (raw) posted.push(raw); });
    const pointer = (target: Element, type: string, x: number, y: number) => {
      const e = new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperty(e, "isPrimary", { value: true });
      Object.defineProperty(e, "pointerId", { value: 1 });
      target.dispatchEvent(e);
    };
    const marker = () => w.document.querySelector("img.svc")!;
    expect(marker().getAttribute("data-mid")).toBe(hostileId);

    pointer(marker(), "pointerdown", 100, 100);
    pointer(map, "pointermove", 103, 102); // within touch slop: still a tap
    pointer(map, "pointerup", 103, 102);
    pointer(marker(), "pointerdown", 100, 100);
    pointer(map, "pointermove", 140, 100); // a real drag that started on the marker
    pointer(map, "pointerup", 140, 100);
    await new Promise((r) => setTimeout(r, 20));

    const taps = posted.map((t) => JSON.parse(t)).filter((m) => m.type === "marker");
    expect(taps).toEqual([{ type: "marker", marker: hostileId, id: "canvas-tap" }]);
    expect(w.pwned).toBeUndefined();
    expect(w.document.querySelectorAll("script")).toHaveLength(1);
    dom.window.close();
  });

  it("draws a faint accuracy circle (metres to pixels) only for an approximate customer position", () => {
    const state = tileCanvasState({ markers: [
      { id: "me", kind: "user", accuracyMeters: 800, coordinate: { latitude: 33.7, longitude: 73.05 } },
      { id: "p", kind: "provider", accuracyMeters: 800, coordinate: { latitude: 33.7, longitude: 73.05 } },
      { id: "x", kind: "user", accuracyMeters: "1e3px" as never, coordinate: { latitude: 33.7, longitude: 73.05 } }
    ] });
    expect(state.markers.map((m) => m.accuracyMeters)).toEqual([800, undefined, undefined]);

    const circles = (accuracyMeters?: number) => {
      const dom = new JSDOM(buildTileCanvasHtml("canvas-acc", { focus: { coordinate: { latitude: 33.7, longitude: 73.05 }, requestId: 1 },
        markers: [{ id: "me", kind: "user", accuracyMeters, coordinate: { latitude: 33.7, longitude: 73.05 } }] }),
      { runScripts: "dangerously", pretendToBeVisual: true });
      const found = [...dom.window.document.querySelectorAll(".acc")].map((e) => parseFloat((e as HTMLElement).style.width));
      dom.window.close();
      return found;
    };
    const [width] = circles(800);
    // Zoom 15 at 33.7° N: 156543.03392 × cos(33.7°) / 2^15 ≈ 3.975 m per pixel, so 800 m ≈ 201 px radius.
    expect(width / 2).toBeCloseTo(800 / (156543.03392 * Math.cos(33.7 * Math.PI / 180) / 2 ** 15), 1);
    expect(circles(undefined)).toEqual([]);
  });

  it("glides a moved marker to its new position, snaps long jumps, and redraws no tiles while gliding", async () => {
    // Each update carries a new focus request on the same point, so the camera stays put and screen x is comparable.
    let focusId = 0;
    const props = (latitude: number, longitude: number) => ({
      focus: { coordinate: { latitude: 33.72, longitude: 73.06 }, requestId: ++focusId },
      markers: [{ id: "provider", kind: "provider" as const, label: XSS, coordinate: { latitude, longitude } }]
    });
    const dom = new JSDOM(buildTileCanvasHtml("canvas-glide", props(33.72, 73.06)), { runScripts: "dangerously", pretendToBeVisual: true });
    const w = dom.window as unknown as Window & { rapidassistUpdate: (s: unknown) => void; pwned?: number };
    const left = () => parseFloat((w.document.querySelector(".m.provider") as HTMLElement).style.left);
    const start = left();
    w.rapidassistUpdate(tileCanvasState(props(33.72, 73.062))); // ≈ 190 m east
    const firstTile = w.document.querySelector(".tile");
    const right = (() => { const d = new JSDOM(buildTileCanvasHtml("x", props(33.72, 73.062)), { runScripts: "dangerously", pretendToBeVisual: true });
      const v = parseFloat((d.window.document.querySelector(".m.provider") as HTMLElement).style.left); d.window.close(); return v; })();
    expect(right).toBeGreaterThan(start + 10);
    expect(left()).toBeLessThan(start + (right - start) / 2); // just started: still near the old spot
    await new Promise((r) => setTimeout(r, MAP_CANVAS_GLIDE_MS / 2));
    const mid = left();
    expect(mid).toBeGreaterThan(start);
    expect(mid).toBeLessThan(right);
    expect(w.document.querySelector(".tile")).toBe(firstTile); // only the overlay layer redraws during a glide
    await new Promise((r) => setTimeout(r, MAP_CANVAS_GLIDE_MS));
    expect(left()).toBeCloseTo(right, 3);
    w.rapidassistUpdate(tileCanvasState(props(33.60, 73.05))); // ≈ 13 km: snaps at once
    const snapped = w.document.querySelector(".m.provider") as HTMLElement;
    expect(snapped.style.left).not.toBe(String(right) + "px");
    expect(w.document.querySelector(".lbl")!.textContent).toBe(XSS);
    expect(w.pwned).toBeUndefined();
    dom.window.close();
  });

  it("keeps the camera still for a live update inside the view and refits when a point leaves it", () => {
    const props = (latitude: number, longitude: number) => ({ markers: [
      { id: "provider", kind: "provider" as const, coordinate: { latitude, longitude } },
      { id: "pickup", kind: "pickup" as const, coordinate: { latitude: 33.7104, longitude: 73.0563 } }
    ] });
    const dom = new JSDOM(buildTileCanvasHtml("canvas-camera", props(33.7180, 73.0640)), { runScripts: "dangerously", pretendToBeVisual: true });
    const w = dom.window as unknown as Window & { rapidassistUpdate: (s: unknown) => void };
    const pickup = () => (w.document.querySelector(".m.pickup") as HTMLElement).style.cssText;
    const before = pickup();
    w.rapidassistUpdate(tileCanvasState(props(33.7170, 73.0630))); // moved closer: still in view
    expect(pickup()).toBe(before);
    w.rapidassistUpdate(tileCanvasState(props(33.7700, 73.1200))); // ~8 km away: out of view, so the camera refits
    expect(pickup()).not.toBe(before);
    dom.window.close();
  });

  it("escapes script-breaking characters in embedded JSON", () => {
    const hostile = "</script><!-- & " + String.fromCharCode(0x2028, 0x2029) + " >";
    const out = scriptJson({ s: hostile });
    const separators = String.fromCharCode(0x2028, 0x2029);
    expect(out).not.toMatch(new RegExp("[<>&" + separators + "]"));
    expect(JSON.parse(out)).toEqual({ s: hostile });
  });
});
