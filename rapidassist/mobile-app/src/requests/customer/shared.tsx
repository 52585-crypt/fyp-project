import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { Button, Card, Icon, Input, PersonCard, StatusTimeline, Text, type IconName } from "../../design/components";
import { tapFeedback } from "../../design/haptics";
import { tokens } from "../../design/tokens";
import { customerRoutes } from "../../navigation/routes";
import { formatTime } from "../../utils/format";
import { getServiceTitle } from "../serviceCatalog";
import { providerNoun, requestTimeline } from "../stages";
import type { CustomerRequestState } from "../useCustomerRequest";
import type { ServiceRequest } from "../requests.types";

export type StageProps = { state: CustomerRequestState; request: ServiceRequest };

export function dialProvider(request: ServiceRequest, onError: (m: string) => void) {
  const phone = request.provider?.phone?.replace(/[^0-9+]/g, "");
  if (!phone) return onError("Phone number unavailable.");
  Linking.openURL(`tel:${phone}`).catch(() => onError("This device couldn't open the phone app."));
}

export function shareTrip(request: ServiceRequest) {
  const who = request.provider?.name ? `${providerNoun(request.category)}: ${request.provider.name}. ` : "";
  Share.share({ message: `I'm getting ${getServiceTitle(request.category).toLowerCase()} help via RapidAssist. ${who}Pickup: ${request.pickupLocation.addressText ?? "shared location"}.` })
    .catch(() => undefined);
}

/** Map with provider + target and a floating ETA chip. */
/** Assigned provider row with call + chat. */
export function ProviderRow({ state, request, variant = "plain" }: StageProps & { variant?: "plain" | "hero" }) {
  const p = request.provider;
  if (!p) return null;
  const vehicle = [request.vehicleInfo.make, request.vehicleInfo.model].filter(Boolean).join(" ");
  const card = (
    <PersonCard variant={variant} name={p.name} rating={p.ratingAvg} ratingCount={p.ratingCount}
      subtitle={`${getServiceTitle(request.category)}${vehicle ? ` • ${vehicle}` : ""}`}
      plate={request.vehicleInfo.registrationNumber}
      onCall={variant === "plain" ? () => dialProvider(request, () => undefined) : undefined}
      onChat={variant === "plain" && request.providerId ? () => router.push(customerRoutes.chat(request.id)) : undefined} />
  );
  return variant === "hero" ? card : <Card>{card}</Card>;
}

function Action({ icon, label, onPress, tone }: { icon: IconName; label: string; onPress: () => void; tone: "success" | "primary" | "muted" }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tapFeedback(); onPress(); }} style={styles.action}>
      <View style={styles.actionIcon}><Icon name={icon} color={tone === "muted" ? "text" : tone} size={tokens.sizes.iconLarge - 4} /></View>
      <Text variant="captionStrong">{label}</Text>
    </Pressable>
  );
}

/** Call / Chat / Share round buttons (Driver Assigned mockup). */
export function QuickActions({ request }: { request: ServiceRequest }) {
  return (
    <View style={styles.actions}>
      <Action icon="call" label="Call" tone="success" onPress={() => dialProvider(request, () => undefined)} />
      <Action icon="chatbubble-ellipses" label="Chat" tone="primary" onPress={() => router.push(customerRoutes.chat(request.id))} />
      <Action icon="share-social-outline" label="Share" tone="muted" onPress={() => shareTrip(request)} />
    </View>
  );
}

export function TripStatus({ request }: { request: ServiceRequest }) {
  const items = requestTimeline(request).map((i) => ({ key: i.key, label: i.label, state: i.state, time: formatTime(i.at) || null }));
  return (
    <Card>
      <Text variant="headline">{request.category === "fuel_delivery" ? "Order Status" : "Trip Status"}</Text>
      <StatusTimeline items={items} />
    </Card>
  );
}

/** "Cancel Request" → inline reason + confirm. */
export function CancelRequest({ state, label = "Cancel Request" }: { state: CustomerRequestState; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <Button title={label} variant="danger" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Text variant="headline">Cancel this request?</Text>
      <Text variant="bodySmall" color="muted">Your provider will be notified.</Text>
      <Input label="Reason" optional placeholder="e.g. Problem solved" value={reason} onChangeText={setReason} />
      <View style={styles.row}>
        <Button title="Keep" variant="outline" fullWidth={false} style={styles.flex} disabled={state.updating} onPress={() => setOpen(false)} />
        <Button title="Cancel request" variant="danger" fullWidth={false} style={styles.flex} loading={state.updating}
          onPress={async () => { if (await state.cancel(reason)) setOpen(false); }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: tokens.space.md },
  action: { flex: 1, alignItems: "center", gap: tokens.space.sm },
  actionIcon: {
    width: tokens.sizes.avatarLarge, height: tokens.sizes.avatarLarge, borderRadius: tokens.sizes.avatarLarge / 2,
    backgroundColor: tokens.color.surface, borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border,
    alignItems: "center", justifyContent: "center", ...tokens.shadow.card
  },
  row: { flexDirection: "row", gap: tokens.space.md },
  flex: { flex: 1 }
});
