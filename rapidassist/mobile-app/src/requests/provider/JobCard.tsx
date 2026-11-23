import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Badge, Card, Icon, Text, type BadgeTone } from "../../design/components";
import { tokens } from "../../design/tokens";
import { providerRoutes } from "../../navigation/routes";
import { formatCurrency, formatDateTime } from "../../utils/format";
import { getServiceIcon, getServiceTitle } from "../serviceCatalog";
import { getProviderStage, type ProviderStage } from "../stages";
import type { ServiceRequest } from "../requests.types";

const labels: Partial<Record<ProviderStage, [string, BadgeTone]>> = {
  job_completed: ["Completed", "success"], cancelled: ["Cancelled", "danger"], awaiting_customer: ["Awaiting customer", "warning"],
  awaiting_approval: ["Awaiting approval", "warning"], incoming: ["New", "primary"]
};

/** Compact job row for Jobs, Earnings and the dashboard. */
export function JobCard({ request, cta }: { request: ServiceRequest; cta?: string }) {
  const stage = getProviderStage(request);
  const [label, tone] = labels[stage] ?? ["In progress", "primary"];
  return (
    <Card onPress={() => router.push(providerRoutes.job(request.id))} accessibilityLabel={`${getServiceTitle(request.category)} job, ${label}`}>
      <View style={styles.row}>
        <View style={styles.icon}><Icon name={getServiceIcon(request.category)} color="primary" /></View>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{getServiceTitle(request.category)}</Text>
          <Text variant="caption" color="muted" numberOfLines={1}>{request.pickupLocation.addressText ?? "Pinned location"}</Text>
        </View>
        <Badge label={label} tone={tone} />
      </View>
      <View style={styles.meta}>
        <Text variant="caption" color="muted">{formatDateTime(request.completedAt ?? request.createdAt)}</Text>
        <Text variant="bodySmallStrong" color="primary">{cta ?? formatCurrency(request.estimate.total)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  icon: { width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: tokens.space.xxs },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }
});
