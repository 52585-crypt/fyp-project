import { router } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { ProfileView, type ProfileRow } from "../../../src/auth/ProfileView";
import { Banner, Button } from "../../../src/design/components";
import { providerRoutes } from "../../../src/navigation/routes";
import { getProviderServiceTitle } from "../../../src/requests/serviceCatalog";
import { useVerification } from "../../../src/verification/VerificationProvider";
import { verificationPresentation } from "../../../src/verification/verification";

const rows: ReadonlyArray<ProfileRow> = [
  { title: "Verification & documents", icon: "shield-checkmark-outline", href: "/verification" },
  { title: "Earnings", icon: "wallet-outline", href: "/earnings" },
  { title: "Inbox", icon: "mail-outline", href: "/inbox" },
  { title: "Change service area", icon: "map-outline", comingSoon: true },
  { title: "Wallet & payouts", icon: "card-outline", comingSoon: true }
];

export default function ProviderProfile() {
  const { user } = useAuth();
  const { status, error } = useVerification();
  const v = status && !error ? verificationPresentation(status) : null;
  return (
    <ProfileView rows={rows} roleLabel={getProviderServiceTitle(user?.mechanicProfile?.serviceCategory)}
      extra={v ? (
        <Banner tone={v.tone === "success" ? "success" : v.tone === "danger" ? "danger" : "warning"} title={`Verification: ${v.title}`} message={v.message}
          action={status?.verificationStatus !== "verified" ? <Button title="Open verification" size="small" variant="secondary" fullWidth={false} onPress={() => router.push(providerRoutes.verification)} /> : null} />
      ) : null} />
  );
}
