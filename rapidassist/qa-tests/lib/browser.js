/** Playwright helpers: launches the locally installed Google Chrome (no Chromium download needed). */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

const SHOTS = path.join(__dirname, "..", "screenshots");

function chromePath() {
  const candidates = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("No Chrome/Chromium found. Set CHROME_PATH or run: npx playwright install chromium");
  return found;
}

async function launch() {
  return chromium.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
}

/** Tracks console errors / failed API calls for one page. */
function watch(page) {
  const log = { consoleErrors: [], pageErrors: [], apiFailures: [], api4xx: [] };
  page.on("console", (m) => { if (m.type() === "error") log.consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => log.pageErrors.push(String(e.message).slice(0, 300)));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) log.apiFailures.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    else if (r.url().includes("/api/") && r.status() >= 400) log.api4xx.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return log;
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(path.join(__dirname, ".."), file);
}

/**
 * Test-harness only: send the app's API traffic (HTTP + WebSocket) for `fromOrigin` to `toOrigin`.
 * Used because the Expo dev web bundle embeds EXPO_PUBLIC_API_URL from mobile-app/.env (a LAN address),
 * and the QA run must not edit that developer file.
 */
async function redirectApi(context, fromOrigin, toOrigin) {
  const WebSocket = require("ws");
  const escaped = fromOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await context.route(new RegExp(`^${escaped}/`), async (route) => {
    const url = route.request().url().replace(fromOrigin, toOrigin);
    try {
      const response = await route.fetch({ url, maxRedirects: 0 });
      await route.fulfill({ response });
    } catch {
      await route.abort("connectionrefused");
    }
  });
  const wsFrom = fromOrigin.replace(/^http/, "ws");
  const wsTo = toOrigin.replace(/^http/, "ws");
  await context.routeWebSocket(new RegExp(`^${wsFrom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`), (ws) => {
    const upstream = new WebSocket(ws.url().replace(wsFrom, wsTo), { headers: { Origin: "http://localhost:8081" } });
    const pending = [];
    upstream.on("open", () => { while (pending.length) upstream.send(pending.shift()); });
    upstream.on("message", (data, isBinary) => ws.send(isBinary ? data : data.toString()));
    upstream.on("close", () => ws.close());
    upstream.on("error", () => ws.close());
    ws.onMessage((m) => (upstream.readyState === WebSocket.OPEN ? upstream.send(m) : pending.push(m)));
    ws.onClose(() => upstream.close());
  });
}

module.exports = { launch, watch, shot, redirectApi, SHOTS };
