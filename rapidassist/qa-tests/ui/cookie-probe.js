#!/usr/bin/env node
/**
 * Bug-5 pre-check: does the httpOnly auth cookie work from the Expo Web origin (http://localhost:8081)?
 * Logs in with fetch(credentials:"include") and then calls /me with NO Authorization header.
 * Writes results/cookie-probe.json.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("../lib/browser");
const { stackState } = require("../lib/harness");

(async () => {
  stackState();
  const phone = `0377${Date.now().toString().slice(-7)}`;
  await fetch("http://127.0.0.1:4000/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "user", name: "Cookie Probe", phone, password: "Str0ngPass!" }) });
  const browser = await launch();
  const results = {};
  for (const [label, api] of [["same-site (localhost:8081 -> localhost:4000)", "http://localhost:4000"], ["cross-site (localhost:8081 -> 127.0.0.1:4000)", "http://127.0.0.1:4000"]]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:8081/welcome", { waitUntil: "domcontentloaded" });
    results[label] = await page.evaluate(async ({ api, phone }) => {
      const login = await fetch(`${api}/api/auth/login`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "Str0ngPass!" }) });
      const me = await fetch(`${api}/api/auth/me`, { credentials: "include" });
      const poll = await fetch(`${api}/socket.io/?EIO=4&transport=polling`, { credentials: "include" });
      const sid = /"sid":"([^"]+)"/.exec(await poll.text())?.[1];
      // socket.io handshake over polling: CONNECT without an auth token -> server must find the cookie
      await fetch(`${api}/socket.io/?EIO=4&transport=polling&sid=${sid}`, { method: "POST", credentials: "include", body: "40" });
      const connect = await (await fetch(`${api}/socket.io/?EIO=4&transport=polling&sid=${sid}`, { credentials: "include" })).text();
      return { login: login.status, me: me.status, socketHandshake: connect.slice(0, 80) };
    }, { api, phone });
    const cookies = await context.cookies();
    results[label].cookie = cookies.map((c) => ({ name: c.name, domain: c.domain, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite }));
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, "..", "results", "cookie-probe.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
