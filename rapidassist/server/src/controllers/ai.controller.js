const DESCRIPTION_MIN_LENGTH = 5;
const DESCRIPTION_MAX_LENGTH = 1500;
const MAX_CLARIFICATIONS = 3;
const QUESTION_MAX_LENGTH = 300;
const ANSWER_MAX_LENGTH = 500;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function requirePlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(message, 400);
  }
  return value;
}

function rejectUnknownFields(value, allowedFields, message) {
  const unknown = Object.keys(value).filter((key) => !allowedFields.includes(key));
  if (unknown.length) throw httpError(message, 400);
}

function normalizeRequiredText(value, fieldName, minLength, maxLength) {
  if (typeof value !== "string") throw httpError(`${fieldName} must be text`, 400);
  const normalized = value.trim();
  if (normalized.length < minLength) {
    throw httpError(`${fieldName} must be at least ${minLength} characters`, 400);
  }
  if (normalized.length > maxLength) {
    throw httpError(`${fieldName} must be at most ${maxLength} characters`, 400);
  }
  return normalized;
}

function validateSuggestionInput(body) {
  const input = requirePlainObject(body, "Request body must be a JSON object");
  rejectUnknownFields(input, ["description", "clarifications"], "Only description and clarifications are allowed");

  const description = normalizeRequiredText(
    input.description,
    "Description",
    DESCRIPTION_MIN_LENGTH,
    DESCRIPTION_MAX_LENGTH
  );
  const rawClarifications = input.clarifications ?? [];
  if (!Array.isArray(rawClarifications)) throw httpError("Clarifications must be an array", 400);
  if (rawClarifications.length > MAX_CLARIFICATIONS) {
    throw httpError(`A maximum of ${MAX_CLARIFICATIONS} clarification answers is allowed`, 400);
  }

  const clarifications = rawClarifications.map((raw, index) => {
    const item = requirePlainObject(raw, `Clarification ${index + 1} must be an object`);
    rejectUnknownFields(item, ["question", "answer"], `Clarification ${index + 1} contains unsupported fields`);
    return {
      question: normalizeRequiredText(item.question, `Clarification ${index + 1} question`, 1, QUESTION_MAX_LENGTH),
      answer: normalizeRequiredText(item.answer, `Clarification ${index + 1} answer`, 1, ANSWER_MAX_LENGTH)
    };
  });

  return { description, clarifications };
}

function createServiceSuggestionController({ suggestService }) {
  if (typeof suggestService !== "function") throw new TypeError("suggestService must be a function");

  return async function serviceSuggestion(req, res, next) {
    try {
      const input = validateSuggestionInput(req.body);
      const suggestion = await suggestService(input, {
        userId: String(req.user._id)
      });
      res.json({ ok: true, suggestion });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  ANSWER_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  MAX_CLARIFICATIONS,
  QUESTION_MAX_LENGTH,
  createServiceSuggestionController,
  validateSuggestionInput
};
