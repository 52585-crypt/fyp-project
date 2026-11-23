import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, Card, Icon, Text, type BadgeTone } from "../../design/components";
import { tokens } from "../../design/tokens";
import { customerRoutes } from "../../navigation/routes";
import { formatCurrency, formatDateTime } from "../../utils/format";
import { getServiceIcon, getServiceTitle } from "../serviceCatalog";
import { getCustomerStage, type CustomerStage } from "../stages";
import type { ServiceRequest } from "../requests.types";
import { titleFor } from "./stageTitles";

function toneFor(stage: CustomerStage): BadgeTone {
  if (stage === "completed") return "success";
  if (stage === "cancelled" || stage === "no_provider") return "danger";
  if (stage === "approve_extra_work" || stage === "confirm_completion") return "warning";
  return "primary";
}

/** Compact request summary for Home and the Requests tab. */
export function RequestCard({ request, eta, footer }: { request: ServiceRequest; eta?: string; footer?: ReactNode }) {
  const stage = getCustomerStage(request);
  return (
    <Card onPress={() => router.push(customerRoutes.request(request.id))}
      accessibilityLabel={`${getServiceTitle(request.category)}, ${titleFor(stage, request.category)}`}>
      <View style={styles.row}>
        <View style={styles.icon}><Icon name={getServiceIcon(request.category)} color="primary" /></View>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{getServiceTitle(request.category)}</Text>
          <Text variant="caption" color="muted" numberOfLines={1}>{request.pickupLocation.addressText ?? "Pinned location"}</Text>
        </View>
        <Badge label={titleFor(stage, request.category)} tone={toneFor(stage)} />
      </View>
      <View style={styles.meta}>
        <Text variant="caption" color="muted">{formatDateTime(request.createdAt)}</Text>
        <Text variant="bodySmallStrong" color="primary">{eta ?? formatCurrency(request.estimate.total)}</Text>
      </View>
      {footer}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  icon: {
    width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center"
  },
  flex: { flex: 1, gap: tokens.space.xxs },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }
});
