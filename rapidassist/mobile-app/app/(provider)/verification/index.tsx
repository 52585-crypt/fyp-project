import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { SafeUser } from "../../../src/auth/auth.types";
import { useAuth } from "../../../src/auth/AuthProvider";
import { getProviderServiceTitle } from "../../../src/requests/serviceCatalog";
import { tokens } from "../../../src/theme/tokens";
import { AppShell, Card, IconBox, NoticeBanner, PrimaryButton, StatusStamp } from "../../../src/ui/components";
import { ProviderRegistrationProgress } from "../../../src/verification/ProviderRegistrationProgress";
import { useVerification } from "../../../src/verification/VerificationProvider";
import { canSubmitVerification, verificationPresentation } from "../../../src/verification/verification";
import { selectVerificationImage } from "../../../src/verification/verificationImage";

const photoInfo = {
  profile: {
    label: "Selfie",
    icon: "person-circle-outline",
    instructions: "Center your face in the frame. Look straight at the camera in even light, keep your face uncovered, and make sure only you are in the photo."
  },
  cnic: {
    label: "CNIC front",
    icon: "card-outline",
    instructions: "Lay your CNIC flat and photograph the entire front. Keep all four corners and the portrait visible. Avoid glare, blur, and shadows."
  }
} as const;

type PhotoKind = keyof typeof photoInfo;
const photoKinds: PhotoKind[] = ["profile", "cnic"];

function PhotoPreview({ label, uri }: { label: string; uri: string }) {
  return <Image accessibilityLabel={label} source={{ uri }} resizeMode="contain" style={styles.preview} />;
}

function RegistrationSummary({ user }: { user: SafeUser }) {
  const profile = user.mechanicProfile;
  const place = profile?.liveLocation;
  const documents = [
    { label: "Workshop photo", image: profile?.workshopPhotoUrl },
    { label: "Mechanic certificate", image: profile?.certificateUrl || user.certificateUrl },
    { label: "Driving licence", image: profile?.drivingLicenseUrl }
  ];
  return (
    <Card style={styles.stack}>
      <Text style={styles.heading}>Provider registration</Text>
      <Text style={styles.body}>Service · {getProviderServiceTitle(profile?.serviceCategory)}</Text>
      <Text style={styles.body}>Name · {user.name}</Text>
      <Text style={styles.body}>Mobile number · {user.phone}</Text>
      {user.email ? <Text style={styles.body}>Email · {user.email}</Text> : null}
      {place ? <Text style={styles.body}>Workshop or service location · {place.addressText ||
        (place.lat != null && place.lng != null ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}` : "Not provided")}</Text> : null}
      <View style={styles.actions}>
        {documents.map(({ label, image }) => image ? (
          <View key={label} style={[styles.action, styles.stack]}>
            <Text style={styles.body}>{label}</Text>
            <PhotoPreview label={label} uri={image} />
          </View>
        ) : null)}
      </View>
    </Card>
  );
}

export default function ProviderVerification() {
  const auth = useAuth();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const inOnboarding = onboarding === "1";
  const { status, loading, error, submitting, refresh, submit } = useVerification();
  const [step, setStep] = useState<"identity" | "review" | null>(inOnboarding ? "identity" : null);
  const [consent, setConsent] = useState(false);
  const [photos, setPhotos] = useState<Record<PhotoKind, string | null>>({ profile: null, cnic: null });
  const [picking, setPicking] = useState<PhotoKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const latestPick = useRef(0);
  const canSubmit = status !== null && canSubmitVerification(status);
  const presentation = status ? verificationPresentation(status) : null;
  const editing = canSubmit && step !== null;
  const reviewing = editing && step === "review";
  const ready = consent && Boolean(photos.profile && photos.cnic);
  const dashboard = () => router.dismissTo("/(provider)/dashboard");

  useEffect(() => {
    if (!status || canSubmitVerification(status)) return;
    latestPick.current += 1;
    setPhotos({ profile: null, cnic: null });
    setPicking(null);
    setConsent(false);
    setStep(null);
  }, [status]);

  function changeStep(next: typeof step) {
    latestPick.current += 1;
    setActionError(null);
    setStep(next);
  }

  function clearPhotos() {
    latestPick.current += 1;
    setPhotos({ profile: null, cnic: null });
    setPicking(null);
  }

  function toggleConsent() {
    if (consent) clearPhotos();
    setActionError(null);
    setConsent(!consent);
  }

  async function choosePhoto(source: "camera" | "library", kind: PhotoKind) {
    if (!consent || picking || submitting) return;
    const attempt = ++latestPick.current;
    setActionError(null);
    // Some browsers leave the picker promise unresolved when the dialog closes.
    if (Platform.OS !== "web") setPicking(kind);
    try {
      const photo = await selectVerificationImage(source, kind);
      if (attempt === latestPick.current && photo) setPhotos((current) => ({ ...current, [kind]: photo }));
    } catch (failure) {
      if (attempt === latestPick.current) {
        setActionError(failure instanceof Error ? failure.message : "Unable to open the photo picker. Try choosing a photo.");
      }
    } finally {
      if (attempt === latestPick.current) setPicking(null);
    }
  }

  async function onSubmit() {
    if (!ready || submitting || loading || error) return;
    setActionError(null);
    try {
      if (await submit({ biometricConsent: consent, profilePhoto: photos.profile, cnicFront: photos.cnic })) {
        clearPhotos();
        setConsent(false);
        changeStep(null);
      }
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "Unable to submit verification. Try again.");
    }
  }

  if (!auth.isLoading && (!auth.token || auth.user?.role !== "mechanic")) {
    return <Redirect href={auth.token ? "/(user)/home" : "/(auth)/welcome"} />;
  }

  const awaitingReview = status?.reviewState === "awaiting_review";
  const match = status?.matchResult;
  return (
    <AppShell title={editing ? (reviewing ? "Review & submit" : "Identity verification") : "Mechanic verification"}>
      <View style={styles.stack}>
        {inOnboarding && editing ? <ProviderRegistrationProgress currentStep={reviewing ? 4 : 3} /> : null}
        {!status && !error ? (
          <Card style={styles.inline}>
            <ActivityIndicator color={tokens.colors.brand} />
            <Text style={styles.body}>Checking verification status…</Text>
          </Card>
        ) : null}
        {error ? <NoticeBanner tone="danger" title="Unable to check status" message={error} /> : null}
        {actionError && editing ? <View accessibilityRole="alert">
          <NoticeBanner tone="danger" title="Check your submission" message={actionError} />
        </View> : null}
        {error && editing ? <PrimaryButton title="Check status again" variant="outline" onPress={refresh} loading={loading} /> : null}

        {!editing && presentation && !error ? (
          <Card style={styles.stack}>
            {awaitingReview ? <Text style={styles.heading}>Verification submitted</Text> : null}
            <View style={styles.inline}>
              <IconBox icon="shield-checkmark" tone={presentation.tone === "accent" ? "warning" : presentation.tone} />
              <StatusStamp label={awaitingReview ? "Pending admin review" : presentation.title} tone={presentation.tone} />
            </View>
            <Text style={styles.body}>{presentation.message}</Text>
            {match && awaitingReview ? (
              <NoticeBanner tone={match === "matched" ? "brand" : "warning"}
                title={match === "matched" ? "AI comparison found a match" : "AI comparison did not find a match"}
                message={match === "matched"
                  ? "An admin will review your photos and make the final decision."
                  : "An admin will review both photos and can request replacements if needed."} />
            ) : null}
            {status?.reviewNote && (presentation.title === "Rejected" || presentation.title === "Resubmission required") ? (
              <NoticeBanner tone="warning" title="Admin note" message={status.reviewNote} />
            ) : null}
            {canSubmit ? (
              <PrimaryButton title={status?.reviewState === "resubmission_requested" ? "Start resubmission" : "Continue verification"}
                icon="arrow-forward" disabled={loading || submitting} onPress={() => changeStep("identity")} />
            ) : null}
          </Card>
        ) : null}

        {editing && !reviewing ? (
          <>
            <Card style={styles.stack}>
              <Text style={styles.heading}>Biometric consent</Text>
              <Text style={styles.body}>RapidAssist compares your selfie with the portrait on the front of your CNIC. Your photos are stored privately, and a RapidAssist admin makes the final decision.</Text>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled: Boolean(picking) }}
                aria-checked={consent} disabled={Boolean(picking)} onPress={toggleConsent}
                style={[styles.consent, consent && styles.consentChecked]}>
                <Ionicons name={consent ? "checkbox" : "square-outline"} size={24} color={tokens.colors.brand} />
                <Text style={[styles.body, styles.flex]}>I consent to RapidAssist processing facial information in my selfie and CNIC for identity verification.</Text>
              </Pressable>
            </Card>
            {photoKinds.map((kind) => {
              const { label, icon, instructions } = photoInfo[kind];
              const photo = photos[kind];
              const subject = kind === "profile" ? "selfie" : "CNIC photo";
              return (
                <Card key={kind} style={styles.stack}>
                  <Text style={styles.heading}>{label}</Text>
                  <Text style={styles.body}>{instructions}</Text>
                  {photo ? <PhotoPreview label={label} uri={photo} /> : <IconBox icon={icon} />}
                  <View style={styles.actions}>
                    <PrimaryButton title={`${photo ? "Retake" : "Take"} ${subject}`} icon="camera-outline" variant="outline"
                      style={styles.action} disabled={!consent || Boolean(picking)} loading={picking === kind}
                      onPress={() => choosePhoto("camera", kind)} />
                    <PrimaryButton title={`${photo ? "Replace" : "Choose"} ${subject}`} icon="image-outline" variant="outline"
                      style={styles.action} disabled={!consent || Boolean(picking)} onPress={() => choosePhoto("library", kind)} />
                  </View>
                </Card>
              );
            })}
            <Text style={styles.caption}>JPEG or PNG, up to 4 MB per photo.</Text>
            <PrimaryButton title="Review & submit" icon="arrow-forward" disabled={!ready || Boolean(picking) || Boolean(error)}
              onPress={() => changeStep("review")} />
          </>
        ) : null}

        {reviewing ? (
          <>
            {inOnboarding && auth.user ? <RegistrationSummary user={auth.user} /> : null}
            <Card style={styles.stack}>
              <Text style={styles.heading}>Identity photos</Text>
              <View style={styles.actions}>
                {photoKinds.map((kind) => (
                  <View key={kind} style={[styles.action, styles.stack]}>
                    <Text style={styles.body}>{photoInfo[kind].label}</Text>
                    {photos[kind] ? <PhotoPreview label={photoInfo[kind].label} uri={photos[kind]} /> : null}
                  </View>
                ))}
              </View>
              <NoticeBanner tone="success" title="Consent confirmed" message="You agreed to biometric processing for identity verification." />
              {submitting ? <Text accessibilityLiveRegion="polite" style={styles.body}>Submitting your photos. This may take a moment.</Text> : null}
              <PrimaryButton title="Submit for review" icon="checkmark-circle" loading={submitting}
                disabled={!ready || loading || Boolean(error)} onPress={onSubmit} />
              <PrimaryButton title="Back to identity verification" variant="outline" disabled={submitting}
                onPress={() => changeStep("identity")} />
            </Card>
          </>
        ) : null}

        {!editing ? <PrimaryButton title="Refresh status" icon="refresh" variant="outline" loading={loading} disabled={submitting} onPress={refresh} /> : null}
        <PrimaryButton title={editing ? "Finish later" : "Back to dashboard"} variant="outline"
          disabled={submitting || Boolean(picking)} onPress={dashboard} />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  stack: { gap: tokens.spacing.md },
  inline: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.md, flexWrap: "wrap" },
  heading: { color: tokens.colors.ink, fontWeight: "800", fontSize: tokens.typography.sizes.headline },
  body: { color: tokens.colors.inkMuted, fontSize: tokens.typography.sizes.body, lineHeight: tokens.typography.lineHeights.body },
  caption: { color: tokens.colors.inkMuted, fontSize: tokens.typography.sizes.bodySmall },
  flex: { flex: 1 },
  consent: { flexDirection: "row", alignItems: "flex-start", gap: tokens.spacing.md, padding: tokens.spacing.md,
    borderRadius: tokens.radii.md, borderWidth: 1, borderColor: tokens.colors.borderStrong },
  consentChecked: { borderColor: tokens.colors.brand, backgroundColor: tokens.colors.brandSoft },
  preview: { width: "100%", height: 190, backgroundColor: tokens.colors.surfaceAlt, borderRadius: tokens.radii.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: tokens.spacing.sm },
  action: { flexGrow: 1, flexBasis: 160, minWidth: 0 }
});
