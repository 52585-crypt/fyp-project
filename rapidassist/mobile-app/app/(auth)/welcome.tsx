import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AuthBrand } from "../../src/auth/AuthBrand";
import { Button, Icon, Screen, Text } from "../../src/design/components";
import type { IconName } from "../../src/design/components";
import { tokens } from "../../src/design/tokens";

const services: ReadonlyArray<{ label: string; icon: IconName }> = [
  { label: "Towing", icon: "car-sport-outline" },
  { label: "Fuel", icon: "water-outline" },
  { label: "Mechanic", icon: "construct-outline" }
];

export default function Welcome() {
  return (
    <Screen
      footer={
        <>
          <Button title="Get Started" icon="arrow-forward" onPress={() => router.push("/(auth)/signup")} />
          <Button title="I already have an account" variant="outline" onPress={() => router.push("/(auth)/login")} />
          <Button title="Register as a Service Provider" variant="ghost"
            onPress={() => router.push({ pathname: "/(auth)/signup", params: { role: "mechanic" } })} />
        </>
      }
    >
      <AuthBrand title="Roadside help, wherever you are." subtitle="24/7 support • Fast • Reliable">
        <View style={styles.services}>
          {services.map((s) => (
            <View key={s.label} style={styles.service}>
              <View style={styles.serviceIcon}><Icon name={s.icon} color="primary" /></View>
              <Text variant="captionStrong" color="onPrimary">{s.label}</Text>
            </View>
          ))}
        </View>
      </AuthBrand>
      <View style={styles.points}>
        {[
          ["flash-outline", "Help in minutes", "Nearby verified providers are matched to you automatically."],
          ["navigate-outline", "Live tracking", "Follow your provider on the map until they arrive."],
          ["cash-outline", "Clear pricing", "See the estimate before you confirm. Pay cash on completion."]
        ].map(([icon, title, body]) => (
          <View key={title} style={styles.point}>
            <View style={styles.pointIcon}><Icon name={icon as IconName} color="primary" /></View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{title}</Text>
              <Text variant="bodySmall" color="muted">{body}</Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  services: { flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.sm },
  service: { flex: 1, alignItems: "center", gap: tokens.space.xs, paddingVertical: tokens.space.md, borderRadius: tokens.radius.md, backgroundColor: tokens.color.heroGlow },
  serviceIcon: {
    width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.sizes.iconTile / 2,
    backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center"
  },
  points: { gap: tokens.space.lg, paddingTop: tokens.space.sm },
  point: { flexDirection: "row", gap: tokens.space.md },
  pointIcon: {
    width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center"
  },
  flex: { flex: 1, gap: tokens.space.xxs }
});
