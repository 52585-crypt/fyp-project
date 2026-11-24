import { StyleSheet, View } from "react-native";
import { Badge, Icon, Text } from "../../design/components";
import { tokens } from "../../design/tokens";

const DIGITS = 4;

/**
 * Arrival PIN slot on live tracking. The backend does not issue arrival PINs yet, so the code boxes stay
 * empty and the card is marked coming soon, with the manual check customers should do meanwhile.
 */
export function ArrivalPinCard({ providerName, arrived }: { providerName?: string | null; arrived: boolean }) {
  const who = providerName?.trim() || "your provider";
  return (
    <View style={[styles.card, arrived && styles.cardArrived]} accessible
      accessibilityLabel={`Arrival PIN, coming soon. Before work starts, check that the provider is ${who}.`}>
      <View style={styles.head}>
        <Icon name="shield-checkmark" color={arrived ? "green" : "primary"} size={tokens.sizes.icon} />
        <Text variant="headline" style={styles.flex}>Arrival PIN</Text>
        <Badge label="Coming soon" tone="neutral" />
      </View>
      <View style={styles.boxes}>
        {Array.from({ length: DIGITS }, (_, i) => <View key={i} style={styles.box}><Text variant="figure" color="subtle">•</Text></View>)}
      </View>
      <Text variant="caption" color="muted">
        {`Until PINs launch, confirm the provider's name before handing over your vehicle: ${who}.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.space.md, padding: tokens.space.lg, borderRadius: tokens.radius.card,
    borderWidth: tokens.sizes.hairline, borderColor: tokens.color.line, backgroundColor: tokens.color.surface
  },
  cardArrived: { borderColor: tokens.color.green, backgroundColor: tokens.color.successSoft },
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  flex: { flex: 1 },
  boxes: { flexDirection: "row", gap: tokens.space.sm },
  box: {
    flex: 1, height: tokens.sizes.button, alignItems: "center", justifyContent: "center",
    borderRadius: tokens.radius.control, backgroundColor: tokens.color.cloud, borderWidth: tokens.sizes.hairline, borderColor: tokens.color.line
  }
});
