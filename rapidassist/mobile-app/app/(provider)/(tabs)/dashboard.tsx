import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useAuth } from "../../../src/auth/AuthProvider";
import { Banner, Button, Card, EmptyState, Icon, Screen, SectionHeader, StatTile, Text, Toggle } from "../../../src/design/components";
import { tokens } from "../../../src/design/tokens";
import { formatCurrency } from "../../../src/utils/format";
import { providerRoutes } from "../../../src/navigation/routes";
import { JobCard } from "../../../src/requests/provider/JobCard";
import { useIncomingOffer } from "../../../src/requests/provider/useIncomingOffer";
import { useProviderDashboard } from "../../../src/requests/provider/useProviderDashboard";
import type { ServiceRequest } from "../../../src/requests/requests.types";
import { getServiceIcon, getServiceTitle } from "../../../src/requests/serviceCatalog";
import { canSubmitVerification, verificationPresentation } from "../../../src/verification/verification";

const quick = [
  { label: "My Jobs", icon: "briefcase-outline", href: providerRoutes.jobs },
  { label: "Earnings", icon: "wallet-outline", href: providerRoutes.earnings },
  { label: "Inbox", icon: "mail-outline", href: providerRoutes.inbox },
  { label: "Profile", icon: "person-outline", href: providerRoutes.profile }
] as const;

function OfferCard({ offer }: { offer: ServiceRequest }) {
  const o = useIncomingOffer(offer.id, offer);
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.icon}><Icon name={getServiceIcon(offer.category)} color="primary" /></View>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{getServiceTitle(offer.category)}</Text>
          <Text variant="caption" color="muted" numberOfLines={1}>{offer.pickupLocation.addressText ?? "Pinned location"}</Text>
          <Text variant="caption" color="muted">{[offer.vehicleInfo.make, offer.vehicleInfo.model].filter(Boolean).join(" ") || "Vehicle"}</Text>
        </View>
        <View style={styles.end}>
          <Text variant="bodyStrong" color="primary">{formatCurrency(offer.estimate.total)}</Text>
          <Text variant="caption" color={o.seconds <= 10 ? "danger" : "muted"}>Expires in {o.seconds}s</Text>
        </View>
      </View>
      {o.error ? <Banner tone="danger" message={o.error} /> : null}
      <View style={styles.row}>
        <Button title="View" variant="outline" size="small" fullWidth={false} style={styles.flex} onPress={() => router.push(providerRoutes.incoming(offer.id))} />
        <Button title="Accept" size="small" fullWidth={false} style={styles.flex} loading={o.busy === "accept"}
          disabled={!o.canAccept || o.expired || Boolean(o.busy)} onPress={o.accept} />
      </View>
    </Card>
  );
}

export default function ProviderDashboard() {
  const { user } = useAuth();
  const d = useProviderDashboard();
  const status = d.verification.status;
  const verify = status && !d.verification.error ? verificationPresentation(status) : null;
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <Screen edges={["top", "left", "right"]} refreshing={d.refreshing} onRefresh={d.refresh}>
      <View style={styles.top}>
        <Text variant="title" style={styles.flex}>Hello{firstName ? `, ${firstName}` : ""} 👋</Text>
        <Toggle label="Online status" value={d.online} busy={d.toggling} disabled={!d.online && !d.canAccept} onChange={d.toggleOnline} />
      </View>
      <View style={styles.area}>
        <Icon name="location" color="primary" size={tokens.sizes.iconSmall} />
        <Text variant="bodySmall" color="muted" style={styles.flex} numberOfLines={1}>
          {d.area ?? user?.providerState?.currentLocation?.addressText ?? (d.online ? "Locating…" : "Go online to share your area")}
        </Text>
      </View>

      {verify && status?.verificationStatus !== "verified" ? (
        <Banner tone={verify.tone === "danger" ? "danger" : "warning"} title={`Verification: ${verify.title}`} message={verify.message}
          action={status && canSubmitVerification(status) ? <Button title="Continue verification" size="small" variant="secondary" fullWidth={false} onPress={() => router.push(providerRoutes.verification)} /> : null} />
      ) : null}
      {d.error || d.dispatchError ? <Banner tone="danger" message={(d.error || d.dispatchError)!} /> : null}

      <View style={styles.grid}>
        <View style={styles.row}>
          <StatTile icon="briefcase-outline" label="Completed jobs" value={String(d.earnings?.completedJobs ?? user?.completedJobs ?? 0)} caption="All time" />
          <StatTile icon="cash-outline" iconColor="success" label="Earnings" value={formatCurrency(d.earnings?.today ?? 0)} caption="Today" />
        </View>
        <View style={styles.row}>
          <StatTile icon="star" iconColor="star" label="Rating" value={user?.ratingCount ? Number(user.ratingAvg ?? 0).toFixed(1) : "New"} caption={`${user?.ratingCount ?? 0} reviews`} />
          <StatTile icon="calendar-outline" label="This week" value={formatCurrency(d.earnings?.week ?? 0)} caption="Earnings" />
        </View>
      </View>

      <SectionHeader title="Quick Actions" />
      <View style={styles.row}>
        {quick.map((q) => (
          <Card key={q.label} style={styles.quick} onPress={() => router.push(q.href)} accessibilityLabel={q.label}>
            <Icon name={q.icon} color="primary" />
            <Text variant="micro" align="center">{q.label}</Text>
          </Card>
        ))}
      </View>

      {d.activeJob ? (
        <>
          <SectionHeader title="Active job" badge="Live" />
          <JobCard request={d.activeJob} cta="Resume" />
        </>
      ) : null}

      <SectionHeader title="Incoming Request" badge={d.offers.length ? "New" : undefined} />
      {d.offers.length ? d.offers.slice(0, 2).map((o) => <OfferCard key={o.id} offer={o} />) : (
        <Card>
          <EmptyState icon={d.online ? "radio-outline" : "moon-outline"}
            title={d.online ? "Waiting for requests" : "You're offline"}
            message={d.online ? "New jobs near you will appear here." : "Go online to start receiving jobs."} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, paddingTop: tokens.space.sm },
  area: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs },
  grid: { gap: tokens.space.sm },
  row: { flexDirection: "row", gap: tokens.space.sm, alignItems: "center" },
  flex: { flex: 1 },
  end: { alignItems: "flex-end", gap: tokens.space.xxs },
  icon: { width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center" },
  quick: { flex: 1, alignItems: "center", gap: tokens.space.xs, paddingVertical: tokens.space.md, paddingHorizontal: tokens.space.xs }
});
