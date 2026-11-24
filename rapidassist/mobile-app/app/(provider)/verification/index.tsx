import { Redirect } from "expo-router";
import { Image, StyleSheet, View } from "react-native";
import type { SafeUser } from "../../../src/auth/auth.types";
import { useAuth } from "../../../src/auth/AuthProvider";
import { Badge, Banner, Button, Card, Checkbox, Header, InfoRow, Screen, SkeletonCard, Text } from "../../../src/design/components";
import { tokens } from "../../../src/design/tokens";
import { getProviderServiceTitle } from "../../../src/requests/serviceCatalog";
import { ProviderRegistrationProgress } from "../../../src/verification/ProviderRegistrationProgress";
import { useVerificationFlow, type PhotoKind } from "../../../src/verification/useVerificationFlow";

const photoInfo: Record<PhotoKind, { label: string; subject: string; instructions: string }> = {
  profile: { label: "Selfie: look straight", subject: "selfie", instructions: "Centre your face, look straight at the camera in even light, keep your face uncovered and make sure only you are in the photo." },
  profileLeft: { label: "Selfie: head turned left", subject: "selfie", instructions: "Keep the phone still and turn your head clearly to your left, about a quarter turn, with your whole face still visible." },
  profileRight: { label: "Selfie: head turned right", subject: "selfie", instructions: "Keep the phone still and turn your head clearly to your right, about a quarter turn. Use your real face, not a printed or on-screen photo." },
  cnic: { label: "CNIC front", subject: "CNIC photo", instructions: "Lay your CNIC flat and photograph the entire front. Keep all four corners and the portrait visible. Avoid glare, blur and shadows." }
};
const kinds: PhotoKind[] = ["profile", "profileLeft", "profileRight", "cnic"];

function Preview({ label, uri }: { label: string; uri: string }) {
  return <Image accessibilityLabel={label} source={{ uri }} resizeMode="contain" style={styles.preview} />;
}

function RegistrationSummary({ user }: { user: SafeUser }) {
  const p = user.mechanicProfile;
  const place = p?.liveLocation;
  const docs = [
    { label: "Workshop photo", image: p?.workshopPhotoUrl },
    { label: "Mechanic certificate", image: p?.certificateUrl || user.certificateUrl },
    { label: "Driving licence", image: p?.drivingLicenseUrl }
  ].filter((d) => d.image);
  return (
    <Card>
      <Text variant="headline">Provider registration</Text>
      <InfoRow label="Service" value={getProviderServiceTitle(p?.serviceCategory)} />
      <InfoRow label="Name" value={user.name} />
      <InfoRow label="Mobile number" value={user.phone} />
      {user.email ? <InfoRow label="Email" value={user.email} /> : null}
      {place ? <InfoRow label="Service location" stacked value={place.addressText || (place.lat != null && place.lng != null ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}` : "Not provided")} /> : null}
      <View style={styles.grid}>
        {docs.map((d) => <View key={d.label} style={styles.cell}><Text variant="caption" color="muted">{d.label}</Text><Preview label={d.label} uri={d.image!} /></View>)}
      </View>
    </Card>
  );
}

export default function ProviderVerification() {
  const auth = useAuth();
  const f = useVerificationFlow();
  if (!auth.isLoading && (!auth.token || auth.user?.role !== "mechanic")) return <Redirect href={auth.token ? "/home" : "/(auth)/welcome"} />;
  const p = f.presentation;
  const tone = p?.tone === "success" ? "success" : p?.tone === "danger" ? "danger" : "warning";

  return (
    <Screen header={<Header title={f.editing ? (f.reviewing ? "Review & submit" : "Identity verification") : "Verification"} back={f.toDashboard} />}
      footer={f.editing && !f.reviewing ? (
        <Button title="Review & submit" icon="arrow-forward" disabled={!f.ready || Boolean(f.picking) || Boolean(f.error)} onPress={f.review} />
      ) : f.reviewing ? (
        <>
          <Button title="Submit for review" icon="checkmark-circle" loading={f.submitting} disabled={!f.ready || f.loading || Boolean(f.error)} onPress={f.submit} />
          <Button title="Back to identity verification" variant="outline" disabled={f.submitting} onPress={f.backToIdentity} />
        </>
      ) : (
        <Button title="Back to dashboard" variant="outline" disabled={f.submitting} onPress={f.toDashboard} />
      )}>
      {f.inOnboarding && f.editing ? <ProviderRegistrationProgress currentStep={f.progressStep} /> : null}
      {!f.status && !f.error ? <SkeletonCard lines={2} /> : null}
      {f.error ? <Banner tone="danger" title="Unable to check status" message={f.error}
        action={<Button title="Check again" size="small" variant="secondary" fullWidth={false} loading={f.loading} onPress={f.refresh} />} /> : null}
      {f.actionError && f.editing ? <Banner tone="danger" title="Check your submission" message={f.actionError} /> : null}

      {!f.editing && p && !f.error ? (
        <Card>
          {f.awaitingReview ? <Text variant="headline">Verification submitted</Text> : null}
          <Badge label={f.awaitingReview ? "Pending admin review" : p.title} tone={tone} />
          <Text variant="bodySmall" color="muted">{p.message}</Text>
          {f.status?.matchResult && f.awaitingReview ? (
            <Banner tone={f.status.matchResult === "matched" ? "info" : "warning"}
              title={f.status.matchResult === "matched" ? "AI comparison found a match" : "AI comparison did not find a match"}
              message={f.status.matchResult === "matched" ? "An admin will review your photos and make the final decision." : "An admin will review both photos and can request replacements if needed."} />
          ) : null}
          {f.status?.reviewNote && (p.title === "Rejected" || p.title === "Resubmission required") ? <Banner tone="warning" title="Admin note" message={f.status.reviewNote} /> : null}
          {f.canSubmit ? (
            <Button title={f.status?.reviewState === "resubmission_requested" ? "Start resubmission" : "Continue verification"} icon="arrow-forward"
              disabled={f.loading || f.submitting} onPress={f.startIdentity} />
          ) : <Button title="Refresh status" icon="refresh" variant="outline" loading={f.loading} onPress={f.refresh} />}
        </Card>
      ) : null}

      {f.editing && !f.reviewing ? (
        <>
          <Card>
            <Text variant="headline">Biometric consent</Text>
            <Text variant="bodySmall" color="muted">RapidAssist compares your selfie with the portrait on your CNIC, checks that your three selfies show a real person turning their head, and keeps a numeric face template to detect duplicate provider accounts. Photos are stored privately and an admin makes the final decision.</Text>
            <Checkbox label="I consent to RapidAssist processing facial information in my selfies and CNIC for identity verification and duplicate-account checks."
              checked={f.consent} disabled={Boolean(f.picking)} onChange={f.toggleConsent} />
          </Card>
          {kinds.map((kind) => {
            const info = photoInfo[kind];
            const photo = f.photos[kind];
            return (
              <Card key={kind}>
                <Text variant="headline">{info.label}</Text>
                <Text variant="bodySmall" color="muted">{info.instructions}</Text>
                {photo ? <Preview label={info.label} uri={photo} /> : null}
                <View style={styles.row}>
                  <Button title={`${photo ? "Retake" : "Take"} ${info.subject}`} icon="camera-outline" variant="outline" size="small" fullWidth={false} style={styles.flex}
                    disabled={!f.consent || Boolean(f.picking)} loading={f.picking === kind} onPress={() => f.choosePhoto("camera", kind)} />
                  <Button title={`${photo ? "Replace" : "Choose"} ${info.subject}`} icon="image-outline" variant="outline" size="small" fullWidth={false} style={styles.flex}
                    disabled={!f.consent || Boolean(f.picking)} onPress={() => f.choosePhoto("library", kind)} />
                </View>
              </Card>
            );
          })}
          <Text variant="caption" color="muted">JPEG or PNG, up to 4 MB per photo.</Text>
        </>
      ) : null}

      {f.reviewing ? (
        <>
          {f.inOnboarding && auth.user ? <RegistrationSummary user={auth.user} /> : null}
          <Card>
            <Text variant="headline">Identity photos</Text>
            <View style={styles.grid}>
              {kinds.map((k) => <View key={k} style={styles.cell}><Text variant="caption" color="muted">{photoInfo[k].label}</Text>{f.photos[k] ? <Preview label={photoInfo[k].label} uri={f.photos[k]!} /> : null}</View>)}
            </View>
            <Banner tone="success" title="Consent confirmed" message="You agreed to biometric processing for identity verification and duplicate-account checks." />
            {f.submitting ? <Text variant="bodySmall" color="muted" accessibilityLiveRegion="polite">Submitting your photos. This may take a moment.</Text> : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: tokens.space.sm, flexWrap: "wrap" },
  flex: { flexGrow: 1, flexBasis: tokens.sizes.heroArt },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  cell: { flexGrow: 1, flexBasis: tokens.sizes.heroArt, gap: tokens.space.xs },
  preview: { width: "100%", height: tokens.sizes.map - tokens.space.sm, backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.md }
});
