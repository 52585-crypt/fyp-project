import type { MechanicIssueCategory, RequestCategory } from "../requests/requests.types";

export type ServiceSuggestionClarification = {
  question: string;
  answer: string;
};

export type ServiceSuggestionRequest = {
  description: string;
  clarifications: ServiceSuggestionClarification[];
};

export type ServiceSuggestion = {
  recommendedService: RequestCategory | null;
  issueCategory: MechanicIssueCategory | null;
  possibleIssue: string;
  followUpQuestion: string | null;
  needsClarification: boolean;
};

export type ServiceSuggestionResponse = {
  ok: true;
  suggestion: ServiceSuggestion;
};

export type ServiceSuggestionStatus =
  | "idle"
  | "loading"
  | "clarification"
  | "suggested"
  | "applied"
  | "unsupported"
  | "error";

