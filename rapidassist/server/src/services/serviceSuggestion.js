const { buildSuggestionMessages } = require("../ai/serviceSuggestion.prompt");
const {
  SERVICE_SUGGESTION_JSON_SCHEMA,
  validateServiceSuggestion
} = require("../ai/serviceSuggestion.schema");

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_CHARS = 64_000;

function publicUpstreamError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  error.publicMessage = message;
  return error;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function readJsonResponse(response) {
  let text;
  try {
    text = await response.text();
  } catch {
    throw publicUpstreamError("AI service recommendation is temporarily unavailable.", 503);
  }
  if (text.length > MAX_RESPONSE_CHARS) {
    throw publicUpstreamError("The AI returned an invalid suggestion. Please retry or choose a service manually.", 502);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw publicUpstreamError("The AI returned an invalid response. Please retry or choose a service manually.", 502);
  }
}

function mapGroqFailure(status) {
  if (status === 401 || status === 403) {
    return publicUpstreamError("AI service recommendation is temporarily unavailable.", 503);
  }
  if (status === 429) {
    return publicUpstreamError("AI service recommendation is busy. Please wait and try again.", 503);
  }
  if (status >= 500) {
    return publicUpstreamError("AI service recommendation is temporarily unavailable.", 503);
  }
  return publicUpstreamError("The AI could not process this description. Please retry or choose a service manually.", 502);
}

function createServiceSuggestionService(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const env = options.env || process.env;
  const apiUrl = options.apiUrl || GROQ_CHAT_COMPLETIONS_URL;

  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");

  return async function suggestService(input) {
    const apiKey = String(env.GROQ_API_KEY || "").trim();
    if (!apiKey) {
      throw publicUpstreamError("AI service recommendation is not configured.", 503);
    }

    const model = String(env.GROQ_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const timeoutMs = positiveInteger(env.GROQ_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetchImpl(apiUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          model,
          messages: buildSuggestionMessages(input),
          temperature: 0,
          max_completion_tokens: 400,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "rapidassist_service_suggestion",
              strict: true,
              schema: SERVICE_SUGGESTION_JSON_SCHEMA
            }
          }
        })
      });
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        throw publicUpstreamError("AI suggestion timed out. Please retry or choose a service manually.", 504);
      }
      throw publicUpstreamError("AI service recommendation is temporarily unavailable.", 503);
    } finally {
      clearTimeout(timeout);
    }

    if (!response?.ok) throw mapGroqFailure(Number(response?.status) || 502);
    const payload = await readJsonResponse(response);
    const message = payload?.choices?.[0]?.message;
    if (message?.refusal) {
      throw publicUpstreamError("The AI could not assess this description. Please choose a service manually.", 502);
    }
    if (typeof message?.content !== "string" || !message.content.trim()) {
      throw publicUpstreamError("The AI returned an empty suggestion. Please retry or choose a service manually.", 502);
    }

    let suggestion;
    try {
      suggestion = JSON.parse(message.content);
    } catch {
      throw publicUpstreamError("The AI returned an invalid suggestion. Please retry or choose a service manually.", 502);
    }
    return validateServiceSuggestion(suggestion);
  };
}

const suggestService = createServiceSuggestionService();

module.exports = {
  DEFAULT_MODEL,
  GROQ_CHAT_COMPLETIONS_URL,
  createServiceSuggestionService,
  suggestService
};
