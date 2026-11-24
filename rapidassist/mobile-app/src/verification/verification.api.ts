import { api } from "../config/api";
import type { VerificationStatus } from "./verification";

const endpoint = "/api/mechanic-verification";
type VerificationResponse = { ok: true; verification: VerificationStatus & { identityMatch?: { status?: string } | null } };

export type VerificationDraft = {
  biometricConsent: boolean;
  profilePhoto: string | null;
  /** Head-turn liveness selfies: a printed photo or a screen cannot turn its head. */
  profilePhotoLeft: string | null;
  profilePhotoRight: string | null;
  cnicFront: string | null;
};

function readVerificationStatus({ verification }: VerificationResponse): VerificationStatus {
  const { verificationStatus, submissionId, reviewState, reviewNote, reviewedAt, identityMatch } = verification;
  const match = identityMatch?.status;
  return { verificationStatus, submissionId, reviewState, reviewNote, reviewedAt,
    ...(match === "matched" || match === "mismatch" ? { matchResult: match } : {}) };
}

export async function getMechanicVerification(token: string): Promise<VerificationStatus> {
  const { data } = await api.get<VerificationResponse>(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  return readVerificationStatus(data);
}

export async function submitMechanicVerification(token: string, draft: VerificationDraft): Promise<VerificationStatus> {
  const { biometricConsent, profilePhoto, profilePhotoLeft, profilePhotoRight, cnicFront } = draft;
  if (biometricConsent !== true) throw new Error("Biometric processing consent is required.");
  if (!profilePhoto || !profilePhotoLeft || !profilePhotoRight || !cnicFront) {
    throw new Error("Add all four verification photos (three selfies and your CNIC) before submitting.");
  }

  const { data } = await api.post<VerificationResponse>(endpoint, { biometricConsent, profilePhoto, profilePhotoLeft, profilePhotoRight, cnicFront }, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 90_000
  });
  return readVerificationStatus(data);
}
