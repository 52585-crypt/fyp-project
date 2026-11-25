/**
 * Shared QA helpers: an HTTP client per account (bearer token + cookie jar), a result recorder,
 * and a scanner that flags secrets (password hashes, Google IDs, face templates) in any API response.
 */
const fs = require("node:fs");
const path = require("node:path");

const STATE_FILE = path.join(__dirname, "..", ".stack.json");

function stackState() {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error("QA stack is not running. Start it first: node qa-tests/lib/start-stack.js");
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

const SECRET_PATTERNS = [
  { name: "passwordHash field", re: /"passwordHash"\s*:/ },
  { name: "bcrypt hash", re: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/ },
  { name: "googleId field", re: /"googleId"\s*:\s*"/ },
  { name: "faceDescriptor field", re: /"faceDescriptor"\s*:/ },
  { name: "providerEnrollment field", re: /"providerEnrollment"\s*:/ }
];

const leaks = [];

class Client {
  constructor(baseUrl, label) {
    this.baseUrl = baseUrl;
    this.label = label;
    this.token = null;
    this.cookies = new Map();
    this.user = null;
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  storeCookies(res) {
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      const [pair, ...attrs] = line.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a) || /max-age=0\b/i.test(a.trim()));
      if (!value || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return raw;
  }

  /**
   * @param {object} opts  auth: "bearer" (default) | "cookie" | "none"; headers; rawBody
   */
  async req(method, url, body, opts = {}) {
    const auth = opts.auth || "bearer";
    const headers = { ...(opts.headers || {}) };
    if (body !== undefined || opts.rawBody !== undefined) headers["Content-Type"] = headers["Content-Type"] || "application/json";
    if (auth === "bearer" && this.token) headers.Authorization = `Bearer ${this.token}`;
    if ((auth === "cookie" || opts.withCookies) && this.cookies.size) headers.Cookie = this.cookieHeader();
    const res = await fetch(this.baseUrl + url, {
      method,
      headers,
      body: opts.rawBody !== undefined ? opts.rawBody : body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = this.storeCookies(res);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.re.test(text)) leaks.push({ client: this.label, method, url, status: res.status, leak: pattern.name });
    }
    return { status: res.status, body: json, text, headers: res.headers, setCookie };
  }

  get(url, opts) { return this.req("GET", url, undefined, opts); }
  post(url, body, opts) { return this.req("POST", url, body ?? {}, opts); }
  patch(url, body, opts) { return this.req("PATCH", url, body ?? {}, opts); }
  del(url, opts) { return this.req("DELETE", url, undefined, opts); }
}

class Recorder {
  constructor(suite) {
    this.suite = suite;
    this.results = [];
    this.counter = 0;
  }

  /**
   * Record one use case. `fn` returns { pass: boolean, actual: string, note?: string }
   * or throws (recorded as FAIL with the error message).
   */
  async check(area, useCase, steps, expected, fn) {
    const id = `${this.suite}-${String(++this.counter).padStart(3, "0")}`;
    let outcome;
    try {
      outcome = await fn();
    } catch (error) {
      outcome = { pass: false, actual: `Threw: ${error.message}` };
    }
    const row = {
      id, area, useCase, steps, expected,
      actual: outcome.actual,
      result: outcome.skip ? "SKIP" : outcome.pass ? "PASS" : "FAIL",
      ...(outcome.note ? { note: outcome.note } : {})
    };
    this.results.push(row);
    const mark = row.result === "PASS" ? "✔" : row.result === "SKIP" ? "–" : "✘";
    console.log(`${mark} [${id}] ${area} :: ${useCase} -> ${row.actual}`);
    return row;
  }

  write(file, extra = {}) {
    const summary = {
      total: this.results.length,
      passed: this.results.filter((r) => r.result === "PASS").length,
      failed: this.results.filter((r) => r.result === "FAIL").length,
      skipped: this.results.filter((r) => r.result === "SKIP").length
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ suite: this.suite, ranAt: new Date().toISOString(), summary, ...extra, results: this.results }, null, 2));
    return summary;
  }
}

/** Status-code expectation helper: pass when status is one of `codes`. */
function expectStatus(res, codes, extra = "") {
  const list = Array.isArray(codes) ? codes : [codes];
  const msg = res.body?.message ? ` "${String(res.body.message).slice(0, 120)}"` : "";
  return { pass: list.includes(res.status), actual: `HTTP ${res.status}${msg}${extra ? ` ${extra}` : ""}` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { Client, Recorder, expectStatus, leaks, sleep, stackState };
