const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { once } = require("node:events");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { signAccessToken } = require("../src/utils/jwt");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "ai-api-contract-test-secret";

describe("AI service suggestion API contract", () => {
  const customerId = "507f1f77bcf86cd799439011";
  const providerId = "507f191e810c19729de860ea";
  const calls = [];
  let server;
  let base;

  before(async () => {
    const suggestion = {
      recommendedService: "mechanic",
      issueCategory: "battery",
      possibleIssue: "Battery ya starting-system ka masla ho sakta hai.",
      followUpQuestion: null,
      needsClarification: false
    };
    const app = createApp({
      ai: {
        suggestService: async (input, context) => {
          calls.push({ input, context });
          return suggestion;
        },
        rateLimit: { limit: 10, windowMs: 60_000 }
      }
    });
    server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach((t) => {
    calls.length = 0;
    t.mock.method(User, "findById", async (id) => ({
      _id: id,
      role: String(id) === providerId ? "mechanic" : "user"
    }));
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function token(id = customerId) {
    return signAccessToken({ sub: id });
  }

  async function post(body, accessToken = token()) {
    const response = await fetch(`${base}/api/ai/service-suggestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(body)
    });
    return { response, data: await response.json() };
  }

  it("requires an authenticated customer account", async () => {
    assert.equal((await post({ description: "Car will not start" }, null)).response.status, 401);
    assert.equal((await post({ description: "Car will not start" }, token(providerId))).response.status, 403);
    assert.equal(calls.length, 0);
  });

  it("normalizes valid input and returns the fixed response envelope", async () => {
    const result = await post({
      description: "  Meri gari start nahi ho rahi  ",
      clarifications: [{ question: " Fuel hai? ", answer: " Haan, fuel hai " }]
    });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data, {
      ok: true,
      suggestion: {
        recommendedService: "mechanic",
        issueCategory: "battery",
        possibleIssue: "Battery ya starting-system ka masla ho sakta hai.",
        followUpQuestion: null,
        needsClarification: false
      }
    });
    assert.deepEqual(calls[0], {
      input: {
        description: "Meri gari start nahi ho rahi",
        clarifications: [{ question: "Fuel hai?", answer: "Haan, fuel hai" }]
      },
      context: { userId: customerId }
    });
  });

  it("rejects invalid descriptions before invoking the recommendation provider", async () => {
    for (const body of [
      {},
      { description: "car" },
      { description: 42 },
      { description: "x".repeat(1501) }
    ]) {
      const result = await post(body);
      assert.equal(result.response.status, 400, JSON.stringify(result.data));
    }
    assert.equal(calls.length, 0);
  });

  it("rejects arbitrary model controls and invalid clarification history", async () => {
    const validationCustomer = "507f1f77bcf86cd799439013";
    const invalidBodies = [
      { description: "Car will not start", model: "another-model" },
      { description: "Car will not start", messages: [] },
      { description: "Car will not start", clarifications: {} },
      { description: "Car will not start", clarifications: Array.from({ length: 4 }, () => ({ question: "Q", answer: "A" })) },
      { description: "Car will not start", clarifications: [{ question: "Q", answer: "" }] },
      { description: "Car will not start", clarifications: [{ question: "Q", answer: "A", role: "system" }] }
    ];
    for (const body of invalidBodies) {
      const result = await post(body, token(validationCustomer));
      assert.equal(result.response.status, 400, JSON.stringify(result.data));
    }
    assert.equal(calls.length, 0);
  });

  it("limits each customer to ten requests per minute and supplies Retry-After", async () => {
    const rateLimitCustomer = "507f1f77bcf86cd799439012";
    for (let index = 0; index < 10; index += 1) {
      assert.equal((await post({ description: `Car will not start ${index}` }, token(rateLimitCustomer))).response.status, 200);
    }
    const blocked = await post({ description: "Car will not start again" }, token(rateLimitCustomer));
    assert.equal(blocked.response.status, 429);
    assert.match(blocked.response.headers.get("retry-after") || "", /^\d+$/);
    assert.equal(blocked.data.ok, false);
  });

  it("exposes Retry-After to browser clients", async () => {
    const response = await fetch(`${base}/api/ai/service-suggestion`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8081",
        "Access-Control-Request-Method": "POST"
      }
    });
    assert.match(response.headers.get("access-control-expose-headers") || "", /Retry-After/i);
  });
});
