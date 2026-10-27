const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createServiceSuggestionService,
  GROQ_CHAT_COMPLETIONS_URL
} = require("../src/services/serviceSuggestion");
const { validateServiceSuggestion } = require("../src/ai/serviceSuggestion.schema");

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof payload === "string" ? payload : JSON.stringify(payload); }
  };
}

function completion(suggestion) {
  return response(200, {
    choices: [{ message: { content: JSON.stringify(suggestion) } }]
  });
}

const mechanicSuggestion = {
  recommendedService: "mechanic",
  issueCategory: "battery",
  possibleIssue: "Battery ya starting-system ka masla ho sakta hai.",
  followUpQuestion: "Kya dashboard lights dim hain?",
  needsClarification: false
};

describe("Groq service recommendation engine", () => {
  it("sends only problem data with strict structured-output settings", async () => {
    let captured;
    const service = createServiceSuggestionService({
      env: { GROQ_API_KEY: "test-secret", GROQ_MODEL: "openai/gpt-oss-20b", GROQ_TIMEOUT_MS: "1000" },
      fetchImpl: async (url, options) => {
        captured = { url, options };
        return completion(mechanicSuggestion);
      }
    });
    const result = await service({
      description: "Meri gari start nahi ho rahi",
      clarifications: [{ question: "Fuel hai?", answer: "Haan" }]
    }, { userId: "private-user-id" });

    assert.deepEqual(result, mechanicSuggestion);
    assert.equal(captured.url, GROQ_CHAT_COMPLETIONS_URL);
    assert.equal(captured.options.headers.Authorization, "Bearer test-secret");
    const body = JSON.parse(captured.options.body);
    assert.equal(body.model, "openai/gpt-oss-20b");
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(body.response_format.json_schema.schema.required, [
      "recommendedService", "issueCategory", "possibleIssue", "followUpQuestion", "needsClarification"
    ]);
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
    assert.match(body.messages[1].content, /Meri gari start nahi ho rahi/);
    assert.doesNotMatch(captured.options.body, /private-user-id/);
  });

  it("accepts clear, clarification, and unsupported outcomes", async () => {
    const cases = [
      mechanicSuggestion,
      {
        recommendedService: null,
        issueCategory: null,
        possibleIssue: "Masla clear nahi hai.",
        followUpQuestion: "Kya tank mein fuel mojood hai?",
        needsClarification: true
      },
      {
        recommendedService: null,
        issueCategory: null,
        possibleIssue: "Please describe a vehicle assistance problem.",
        followUpQuestion: null,
        needsClarification: false
      },
      {
        recommendedService: "fuel_delivery",
        issueCategory: null,
        possibleIssue: "The fuel tank appears to be empty.",
        followUpQuestion: null,
        needsClarification: false
      }
    ];
    for (const expected of cases) assert.deepEqual(validateServiceSuggestion(expected), expected);
  });

  it("rejects malformed and inconsistent model suggestions", () => {
    const invalid = [
      null,
      { ...mechanicSuggestion, recommendedService: "repair" },
      { ...mechanicSuggestion, recommendedService: "fuel_delivery" },
      { ...mechanicSuggestion, issueCategory: null },
      { ...mechanicSuggestion, needsClarification: true },
      { ...mechanicSuggestion, extra: "field" },
      { ...mechanicSuggestion, possibleIssue: " " },
      { ...mechanicSuggestion, possibleIssue: null },
      {
        recommendedService: null,
        issueCategory: null,
        possibleIssue: "Unsupported",
        followUpQuestion: "What happened?",
        needsClarification: false
      }
    ];
    for (const value of invalid) {
      assert.throws(() => validateServiceSuggestion(value), (error) => error.statusCode === 502);
    }
  });

  it("maps missing configuration and Groq HTTP failures to safe errors", async () => {
    let called = false;
    const missingKey = createServiceSuggestionService({ env: {}, fetchImpl: async () => { called = true; } });
    await assert.rejects(missingKey({ description: "Car will not start", clarifications: [] }), (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.expose, true);
      return true;
    });
    assert.equal(called, false);

    for (const [status, expectedStatus] of [[401, 503], [403, 503], [429, 503], [500, 503], [400, 502]]) {
      const service = createServiceSuggestionService({
        env: { GROQ_API_KEY: "test-secret" },
        fetchImpl: async () => response(status, { error: { message: "private upstream details" } })
      });
      await assert.rejects(service({ description: "Car will not start", clarifications: [] }), (error) => {
        assert.equal(error.statusCode, expectedStatus);
        assert.doesNotMatch(error.publicMessage, /private upstream/);
        return true;
      });
    }
  });

  it("handles timeout and network failure without exposing internal errors", async () => {
    const timeoutService = createServiceSuggestionService({
      env: { GROQ_API_KEY: "test-secret", GROQ_TIMEOUT_MS: "5" },
      fetchImpl: (_url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("secret timeout"), { name: "AbortError" })));
      })
    });
    await assert.rejects(timeoutService({ description: "Car will not start", clarifications: [] }), (error) => {
      assert.equal(error.statusCode, 504);
      assert.doesNotMatch(error.publicMessage, /secret/);
      return true;
    });

    const offlineService = createServiceSuggestionService({
      env: { GROQ_API_KEY: "test-secret" },
      fetchImpl: async () => { throw new Error("private DNS name"); }
    });
    await assert.rejects(offlineService({ description: "Car will not start", clarifications: [] }), (error) => {
      assert.equal(error.statusCode, 503);
      assert.doesNotMatch(error.publicMessage, /private DNS/);
      return true;
    });
  });

  it("rejects invalid JSON, empty content, refusals, and invalid output", async () => {
    const payloads = [
      response(200, "not-json"),
      response(200, { choices: [{ message: { content: "" } }] }),
      response(200, { choices: [{ message: { refusal: "cannot comply", content: null } }] }),
      response(200, { choices: [{ message: { content: "not-json" } }] }),
      completion({ ...mechanicSuggestion, recommendedService: "fuel_delivery" })
    ];
    for (const upstreamResponse of payloads) {
      const service = createServiceSuggestionService({
        env: { GROQ_API_KEY: "test-secret" },
        fetchImpl: async () => upstreamResponse
      });
      await assert.rejects(service({ description: "Car will not start", clarifications: [] }), (error) => error.statusCode === 502);
    }
  });
});
