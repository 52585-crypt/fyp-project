const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { once } = require("node:events");
const { createApp } = require("../src/app");
const { errorHandler } = require("../src/middleware/error.middleware");
const { User } = require("../src/models/User");
const { signAccessToken } = require("../src/utils/jwt");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "error-handling-test-secret";
process.env.JSON_BODY_LIMIT = "128b";
process.env.CORS_ORIGIN = "https://allowed.example";

describe("API failure responses", () => {
  let server, base;
  before(async () => {
    server = createServer(createApp());
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { await new Promise((resolve) => server.close(resolve)); });

  it("returns JSON for unknown endpoints", async () => {
    const response = await fetch(`${base}/api/missing`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, message: "Endpoint not found" });
  });
  it("rejects malformed JSON with 400 and oversized bodies with 413", async () => {
    for (const [body, status] of [["{broken", 400], [JSON.stringify({ text: "x".repeat(200) }), 413]]) {
      const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      assert.equal(response.status, status);
      const data = await response.json();
      assert.equal(data.ok, false);
      assert.doesNotMatch(data.message, /broken|SyntaxError|stack/);
    }
  });
  it("reports denied origins as 403", async () => {
    const response = await fetch(`${base}/health`, { headers: { Origin: "https://denied.example" } });
    assert.equal(response.status, 403);
  });
  it("rejects invalid and malformed-subject tokens without querying the database", async (t) => {
    const lookup = t.mock.method(User, "findById", () => { throw new Error("Database should not be queried"); });
    for (const token of ["invalid", signAccessToken({ sub: "not-an-object-id" })]) {
      const response = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 401);
    }
    assert.equal(lookup.mock.callCount(), 0);
  });
  it("does not turn a database outage into an invalid session", async (t) => {
    t.mock.method(console, "error", () => {});
    t.mock.method(User, "findById", async () => { throw Object.assign(new Error("private database hostname"), { name: "MongoNetworkError" }); });
    const response = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${signAccessToken({ sub: "507f1f77bcf86cd799439011" })}` } });
    assert.equal(response.status, 503);
    assert.doesNotMatch((await response.json()).message, /private|Unauthorized/);
  });
  it("maps database conflicts and validation failures without leaking internals", (t) => {
    t.mock.method(console, "error", () => {});
    for (const [details, expected] of [[{ code: 11000 }, 409], [{ name: "CastError" }, 400], [{ name: "ValidationError" }, 400], [{ name: "VersionError" }, 409], [{ status: 503 }, 503], [{ statusCode: 999 }, 500]]) {
      const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
      errorHandler(Object.assign(new Error("secret internals"), details), { method: "GET", path: "/test" }, res, () => assert.fail("unexpected next"));
      assert.equal(res.code, expected);
      assert.equal(res.body.ok, false);
      assert.doesNotMatch(res.body.message, /secret/);
    }
  });
  it("delegates errors once response headers have been sent", () => {
    const failure = new Error("stream failed");
    errorHandler(failure, {}, { headersSent: true, status() { assert.fail("double response"); } }, (err) => assert.equal(err, failure));
  });
});
