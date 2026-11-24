import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ServiceSuggestionCard } from "../../../src/ai/ServiceSuggestionCard";
import { selectionFromSuggestion } from "../../../src/ai/serviceSuggestion.integration";
import { MapCanvas, type MapCanvasMarker } from "../../../src/components/maps/MapCanvas";
import { Banner, Button, Card, ChipGroup, Icon, IconButton, MapPill, MapTopBar, MAP_TOP_BAR_HEIGHT, Text } from "../../../src/design/components";
import { tapFeedback } from "../../../src/design/haptics";
import { tokens } from "../../../src/design/tokens";
import { useBooking } from "../../../src/requests/booking/BookingProvider";
import { FareCard } from "../../../src/requests/booking/FareCard";
import { FuelFields, MechanicFields, NotesField, TowingFields, VehicleSection } from "../../../src/requests/booking/FormSections";
import type { RequestPriority } from "../../../src/requests/requests.types";
import { getServiceTitle } from "../../../src/requests/serviceCatalog";
import { formatCurrency } from "../../../src/utils/format";

const priorities: ReadonlyArray<{ value: RequestPriority; label: string }> = [
  { value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }
];
const problemTitle = { car_towing: "What happened?", fuel_delivery: "What do you need?", mechanic: "What's wrong?" } as const;

/** Problem + fare: describe the issue, see the fixed fare, then create the request (next: provider offers). */
export default function ProblemAndFare() {
  const b = useBooking();
  const insets = useSafeAreaInsets();
  const [aiOpen, setAiOpen] = useState(false);
  const [manualVersion, setManualVersion] = useState(0);
  useEffect(() => { if (!b.pickup) router.back(); }, [b.pickup]);
  if (!b.pickup) return null;

  const route = b.towing ? b.route.route : null;
  const markers: MapCanvasMarker[] = [
    { id: "pickup", kind: "pickup", coordinate: b.pickup },
    ...(b.towing && b.destination ? [{ id: "drop", kind: "destination" as const, coordinate: b.destination }] : [])
  ];
  const needsDropOff = b.towing && !b.destination;

  function findProviders() {
    const problem = b.validate();
    if (problem) return b.setError(problem);
    void b.submit();
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.map}>
        <MapCanvas accessibilityLabel="Route preview" markers={markers} route={route?.coordinates}
          inset={{ top: MAP_TOP_BAR_HEIGHT, bottom: tokens.radius.sheet }} />
      </View>
      <MapTopBar left={<IconButton icon="arrow-back" label="Back to location" onPress={() => router.back()} />}
        center={<MapPill title={getServiceTitle(b.category)} subtitle={route ? `${route.distanceKm.toFixed(1)} km · ${route.durationMinutes} min` : "Problem & fare"} />} />

      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Location: ${b.pickup.address}. Change`}
            onPress={() => { tapFeedback(); router.back(); }} style={styles.trip}>
            <Stop icon="location" color="primary" text={b.pickup.address || "Pinned location"} />
            {b.towing ? <Stop icon="flag" color="red" text={b.destination?.address || "Set a drop-off"} /> : null}
            <Text variant="captionStrong" color="primary">Change</Text>
          </Pressable>

          <Section title={problemTitle[b.category]}>
            {b.category === "mechanic" ? <MechanicFields b={b} /> : null}
            {b.category === "car_towing" ? <TowingFields b={b} /> : null}
            {b.category === "fuel_delivery" ? <FuelFields b={b} /> : null}
          </Section>

          {b.category === "mechanic" ? (
            <Card tone="soft">
              <Button title={aiOpen ? "Hide AI diagnostic assist" : "Not sure? Describe it to AI assist"} icon="sparkles-outline"
                variant="ghost" size="small" onPress={() => setAiOpen((v) => !v)} />
              {aiOpen ? (
                <ServiceSuggestionCard token={b.token} description={b.description} onDescriptionChange={b.setDescription}
                  manualSelectionVersion={manualVersion}
                  onSuggestionAccepted={(s) => {
                    const pick = selectionFromSuggestion(s);
                    if (!pick) return;
                    setManualVersion((v) => v + 1);
                    if (pick.mechanicIssue) b.setMechanicIssue(pick.mechanicIssue);
                    if (pick.category !== b.category) b.setCategory(pick.category);
                    setAiOpen(false);
                  }}
                  onSignInRequested={() => router.replace("/(auth)/login")} />
              ) : null}
            </Card>
          ) : null}

          {b.category !== "fuel_delivery" ? <VehicleSection b={b} compact /> : null}
          <NotesField b={b} />

          <Section title="How urgent is it?">
            <ChipGroup columns={3} options={priorities} value={b.priority} onChange={b.setPriority} accessibilityLabel="Priority" />
          </Section>

          <FareCard estimate={b.estimate} pending={b.waitingForRoute} />

          {b.route.error ? (
            <Banner tone="warning" title="Driving route unavailable" message={b.route.error}
              action={<Button title="Retry route" size="small" variant="secondary" fullWidth={false} onPress={b.route.retry} />} />
          ) : null}
          {needsDropOff ? (
            <Banner tone="warning" title="Towing needs a drop-off"
              action={<Button title="Set drop-off" size="small" variant="secondary" fullWidth={false}
                onPress={() => router.push({ pathname: "/request/new/[service]", params: { service: "car_towing", step: "destination" } })} />} />
          ) : null}
          {b.error ? <Banner tone="danger" message={b.error} /> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + tokens.space.lg }]}>
          <View style={styles.summary}>
            <View style={styles.flex}>
              <Text variant="caption" color="muted">Fixed fare</Text>
              <Text variant="price" accessibilityLiveRegion="polite">
                {b.estimate ? formatCurrency(b.estimate.total) : b.waitingForRoute ? "Calculating…" : "—"}
              </Text>
            </View>
            {b.nearby !== null ? (
              <View style={styles.nearby}>
                <View style={[styles.dot, b.nearby > 0 ? styles.dotLive : null]} />
                <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
                  {b.nearby > 0 ? `${b.nearby} provider${b.nearby === 1 ? "" : "s"} nearby` : "None online nearby"}
                </Text>
              </View>
            ) : null}
          </View>
          <Button title="Find providers" icon="search" loading={b.submitting} disabled={b.waitingForRoute || !b.estimate || needsDropOff}
            onPress={findProviders} />
        </View>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}><Text variant="headline">{title}</Text>{children}</View>;
}

function Stop({ icon, color, text }: { icon: "location" | "flag"; color: "primary" | "red"; text: string }) {
  return (
    <View style={styles.stop}>
      <Icon name={icon} color={color} size={tokens.sizes.iconSmall} />
      <Text variant="bodySmallMedium" numberOfLines={1} style={styles.flex}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  map: { height: tokens.sizes.mapLarge },
  sheet: {
    flex: 1, marginTop: -tokens.radius.sheet, backgroundColor: tokens.color.surface, overflow: "hidden",
    borderTopLeftRadius: tokens.radius.sheet, borderTopRightRadius: tokens.radius.sheet,
    width: "100%", maxWidth: tokens.sizes.maxContent, alignSelf: "center", ...tokens.shadow.sheet
  },
  body: { gap: tokens.space.xl, padding: tokens.space.screen },
  trip: { gap: tokens.space.sm, padding: tokens.space.md, borderRadius: tokens.radius.control, backgroundColor: tokens.color.cloud },
  stop: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  flex: { flex: 1 },
  section: { gap: tokens.space.md },
  footer: {
    gap: tokens.space.sm, paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.md,
    borderTopWidth: tokens.sizes.hairline, borderTopColor: tokens.color.line, backgroundColor: tokens.color.surface
  },
  summary: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  nearby: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  dot: { width: tokens.space.sm, height: tokens.space.sm, borderRadius: tokens.space.xs, backgroundColor: tokens.color.subtle },
  dotLive: { backgroundColor: tokens.color.green }
});
