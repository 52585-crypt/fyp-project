import { Linking, StyleSheet, View } from "react-native";
import { Banner, Button, Card, EmptyState, Header, Icon, Screen, Text } from "../../../src/design/components";
import { tokens } from "../../../src/design/tokens";

/** Pakistan national emergency numbers (dialled by the phone, no backend involved). */
const emergencyLines = [
  { label: "Rescue 1122", number: "1122", icon: "medkit-outline" },
  { label: "Police 15", number: "15", icon: "shield-outline" },
  { label: "Motorway Police 130", number: "130", icon: "car-outline" }
] as const;

export default function SupportTab() {
  return (
    <Screen edges={["top", "left", "right"]} header={<Header title="Support" back={false} />}>
      <Banner tone="danger" title="In danger right now?" message="Call emergency services first. RapidAssist providers are not an emergency service." />
      <Card>
        <Text variant="headline">Emergency numbers</Text>
        {emergencyLines.map((line) => (
          <View key={line.number} style={styles.row}>
            <Icon name={line.icon} color="danger" />
            <Text variant="bodyMedium" style={styles.flex}>{line.label}</Text>
            <Button title="Call" size="small" variant="danger" fullWidth={false}
              accessibilityHint={`Opens the dialer for ${line.number}`}
              onPress={() => Linking.openURL(`tel:${line.number}`).catch(() => undefined)} />
          </View>
        ))}
      </Card>
      <Card>
        <EmptyState icon="chatbubbles-outline" title="Help centre coming soon"
          message="In-app support chat and FAQs are on the way. For a live job, use the chat on the request screen to reach your provider." />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, minHeight: tokens.sizes.touchMin },
  flex: { flex: 1 }
});
