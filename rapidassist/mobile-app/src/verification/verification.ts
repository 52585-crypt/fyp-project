import type { SafeUser } from "../auth/auth.types";

export type VerificationStatus = {
  verificationStatus: SafeUser["verificationStatus"];
  submissionId: string | null;
  reviewState: "awaiting_review" | "approved" | "rejected" | "resubmission_requested" | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  matchResult?: "matched" | "mismatch";
};

export function verificationPresentation(status: VerificationStatus) {
  if (status.verificationStatus === "verified") {
    return { title: "Approved", tone: "success", message: "Your verification is complete. You can go on duty and accept service requests." } as const;
  }
  if (status.reviewState === "resubmission_requested") {
    return { title: "Resubmission required", tone: "accent", message: "An admin requested new photos. Review the note below, if provided, before submitting again." } as const;
  }
  if (status.reviewState === "rejected" || status.verificationStatus === "rejected") {
    return { title: "Rejected", tone: "danger", message: status.reviewState === "rejected"
      ? "You can send new photos after an admin requests resubmission."
      : "Your verification was rejected. You can submit new evidence for review." } as const;
  }
  if (status.reviewState === "awaiting_review") {
    return { title: "Pending review", tone: "accent", message: "Your photos are with the review team. You can accept service requests after an admin approves your verification." } as const;
  }
  return { title: "Verification required", tone: "accent", message: "Submit a profile photo and your CNIC front to start verification." } as const;
}

export function canSubmitVerification(status: VerificationStatus) {
  return status.verificationStatus !== "verified"
    && status.reviewState !== "awaiting_review"
    && status.reviewState !== "rejected";
}

export function canAcceptServiceRequests(status: VerificationStatus | null) {
  return status?.verificationStatus === "verified";
}

export function shouldCheckSubmissionStatus(error: unknown) {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === undefined || status === 409 || status >= 500;
}
