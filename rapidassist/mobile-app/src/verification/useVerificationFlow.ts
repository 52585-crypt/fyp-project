import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useVerification } from "./VerificationProvider";
import { canSubmitVerification, verificationPresentation } from "./verification";
import { selectVerificationImage } from "./verificationImage";

export type PhotoKind = "profile" | "cnic";
type Step = "identity" | "review" | null;

/**
 * Identity verification (selfie + CNIC front) state. Photos require biometric consent first;
 * withdrawing consent clears them; a stale picker result never overwrites a newer one.
 */
export function useVerificationFlow() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const inOnboarding = onboarding === "1";
  const v = useVerification();
  const [step, setStep] = useState<Step>(inOnboarding ? "identity" : null);
  const [consent, setConsent] = useState(false);
  const [photos, setPhotos] = useState<Record<PhotoKind, string | null>>({ profile: null, cnic: null });
  const [picking, setPicking] = useState<PhotoKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const latestPick = useRef(0);

  const canSubmit = v.status !== null && canSubmitVerification(v.status);
  const presentation = v.status ? verificationPresentation(v.status) : null;
  const editing = canSubmit && step !== null;
  const reviewing = editing && step === "review";
  const ready = consent && Boolean(photos.profile && photos.cnic);

  useEffect(() => {
    if (!v.status || canSubmitVerification(v.status)) return;
    latestPick.current += 1;
    setPhotos({ profile: null, cnic: null });
    setPicking(null);
    setConsent(false);
    setStep(null);
  }, [v.status]);

  function goTo(next: Step) { latestPick.current += 1; setActionError(null); setStep(next); }
  function clearPhotos() { latestPick.current += 1; setPhotos({ profile: null, cnic: null }); setPicking(null); }

  function toggleConsent() {
    if (consent) clearPhotos();
    setActionError(null);
    setConsent(!consent);
  }

  async function choosePhoto(source: "camera" | "library", kind: PhotoKind) {
    if (!consent || picking || v.submitting) return;
    const attempt = ++latestPick.current;
    setActionError(null);
    // Some browsers leave the picker promise unresolved when the dialog closes.
    if (Platform.OS !== "web") setPicking(kind);
    try {
      const photo = await selectVerificationImage(source, kind);
      if (attempt === latestPick.current && photo) setPhotos((c) => ({ ...c, [kind]: photo }));
    } catch (failure) {
      if (attempt === latestPick.current) setActionError(failure instanceof Error ? failure.message : "Unable to open the photo picker. Try choosing a photo.");
    } finally {
      if (attempt === latestPick.current) setPicking(null);
    }
  }

  async function submit() {
    if (!ready || v.submitting || v.loading || v.error) return;
    setActionError(null);
    try {
      if (await v.submit({ biometricConsent: consent, profilePhoto: photos.profile, cnicFront: photos.cnic })) {
        clearPhotos();
        setConsent(false);
        goTo(null);
      }
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "Unable to submit verification. Try again.");
    }
  }

  return {
    ...v, inOnboarding, step, consent, photos, picking, actionError, canSubmit, presentation, editing, reviewing, ready,
    progressStep: reviewing ? 4 : 3,
    awaitingReview: v.status?.reviewState === "awaiting_review",
    toggleConsent, choosePhoto, submit,
    startIdentity: () => goTo("identity"), review: () => goTo("review"), backToIdentity: () => goTo("identity"),
    toDashboard: () => router.dismissTo("/dashboard")
  };
}
