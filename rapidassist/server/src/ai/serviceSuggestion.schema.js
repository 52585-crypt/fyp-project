const SERVICES = ["mechanic", "fuel_delivery", "car_towing"];
const MECHANIC_ISSUES = ["battery", "engine", "tyre", "brake", "overheating", "general_inspection"];
const REQUIRED_FIELDS = [
  "recommendedService",
  "issueCategory",
  "possibleIssue",
  "followUpQuestion",
  "needsClarification"
];

const SERVICE_SUGGESTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    recommendedService: {
      type: ["string", "null"],
      enum: [...SERVICES, null]
    },
    issueCategory: {
      type: ["string", "null"],
      enum: [...MECHANIC_ISSUES, null]
    },
    possibleIssue: { type: "string", minLength: 1, maxLength: 500 },
    followUpQuestion: { type: ["string", "null"], maxLength: 300 },
    needsClarification: { type: "boolean" }
  },
  required: REQUIRED_FIELDS,
  additionalProperties: false
};

function invalidOutput(reason) {
  const error = new Error(`Invalid Groq service suggestion: ${reason}`);
  error.statusCode = 502;
  error.expose = true;
  error.publicMessage = "The AI returned an invalid suggestion. Please retry or choose a service manually.";
  return error;
}

function normalizedNullableText(value, field, maxLength) {
  if (value === null) return null;
  if (typeof value !== "string") throw invalidOutput(`${field} must be text or null`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw invalidOutput(`${field} has an invalid length`);
  return normalized;
}

function normalizedRequiredText(value, field, maxLength) {
  if (typeof value !== "string") throw invalidOutput(`${field} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw invalidOutput(`${field} has an invalid length`);
  return normalized;
}

function validateServiceSuggestion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidOutput("response must be an object");
  const keys = Object.keys(value);
  if (keys.length !== REQUIRED_FIELDS.length || keys.some((key) => !REQUIRED_FIELDS.includes(key))) {
    throw invalidOutput("response fields do not match the contract");
  }

  const recommendedService = value.recommendedService;
  const issueCategory = value.issueCategory;
  if (recommendedService !== null && !SERVICES.includes(recommendedService)) throw invalidOutput("unsupported service");
  if (issueCategory !== null && !MECHANIC_ISSUES.includes(issueCategory)) throw invalidOutput("unsupported issue category");
  if (typeof value.needsClarification !== "boolean") throw invalidOutput("needsClarification must be boolean");

  const possibleIssue = normalizedRequiredText(value.possibleIssue, "possibleIssue", 500);
  const followUpQuestion = normalizedNullableText(value.followUpQuestion, "followUpQuestion", 300);

  if (recommendedService === "mechanic" && !MECHANIC_ISSUES.includes(issueCategory)) {
    throw invalidOutput("mechanic requires an issue category");
  }
  if (recommendedService !== "mechanic" && issueCategory !== null) {
    throw invalidOutput("only mechanic may include an issue category");
  }
  if (value.needsClarification && (recommendedService !== null || issueCategory !== null || !followUpQuestion)) {
    throw invalidOutput("clarification outcome is inconsistent");
  }
  if (!value.needsClarification && recommendedService === null && followUpQuestion !== null) {
    throw invalidOutput("unsupported outcome cannot include a follow-up question");
  }

  return {
    recommendedService,
    issueCategory,
    possibleIssue,
    followUpQuestion,
    needsClarification: value.needsClarification
  };
}

module.exports = {
  MECHANIC_ISSUES,
  SERVICES,
  SERVICE_SUGGESTION_JSON_SCHEMA,
  validateServiceSuggestion
};
