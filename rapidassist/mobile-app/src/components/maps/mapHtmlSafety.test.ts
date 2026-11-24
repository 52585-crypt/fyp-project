import { JSDOM } from "jsdom";
import { buildPreviewHtml } from "../LocationMapPreview.shared";
import { safePoint, scriptJson } from "./mapHtmlSafety";
import { buildTileCanvasHtml, tileCanvasState } from "./tileCanvasHtml";

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
    expect(state.markers).toEqual([{ id: "b", kind: "pickup", coordinate: { latitude: 1, longitude: 2 }, label: undefined }]);
    expect(state.route).toEqual([{ latitude: 3, longitude: 4 }]);
  });

  it("escapes script-breaking characters in embedded JSON", () => {
    const hostile = "</script><!-- & " + String.fromCharCode(0x2028, 0x2029) + " >";
    const out = scriptJson({ s: hostile });
    const separators = String.fromCharCode(0x2028, 0x2029);
    expect(out).not.toMatch(new RegExp("[<>&" + separators + "]"));
    expect(JSON.parse(out)).toEqual({ s: hostile });
  });
});
