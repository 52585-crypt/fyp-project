import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Badge, Button, Card, EmptyState, ErrorState, Header, Icon, IconButton, Screen, SkeletonCard, Text } from "../../../src/design/components";
import { tokens } from "../../../src/design/tokens";
import { customerRoutes } from "../../../src/navigation/routes";
import { useVehicles } from "../../../src/vehicles/useVehicles";
import type { VehicleType } from "../../../src/vehicles/vehicles.types";

const icons: Record<VehicleType, "car-sport-outline" | "bicycle-outline" | "car-outline"> = { car: "car-sport-outline", bike: "bicycle-outline", towing: "car-outline" };

export default function Vehicles() {
  const v = useVehicles();
  return (
    <Screen header={<Header title="My Vehicles" />} refreshing={false} onRefresh={v.reload}
      footer={<Button title="Add vehicle" icon="add" onPress={() => router.push(customerRoutes.addVehicle)} />}>
      {v.loading ? <><SkeletonCard lines={1} /><SkeletonCard lines={1} /></> : null}
      {v.error && !v.items ? <ErrorState message={v.error} onRetry={v.reload} /> : null}
      {v.items && v.items.length === 0 ? (
        <EmptyState icon="car-outline" title="No saved vehicles" message="Save your vehicle to book help faster." />
      ) : null}
      {v.items?.map((item) => (
        <Card key={item.id}>
          <View style={styles.row}>
            <View style={styles.icon}><Icon name={icons[item.type] ?? "car-outline"} color="primary" /></View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{item.make} {item.model}</Text>
              <Text variant="caption" color="muted">{item.year} • {item.type}</Text>
              {item.registrationNumber ? <Badge label={item.registrationNumber} tone="neutral" /> : null}
            </View>
            <IconButton icon="trash-outline" label={`Delete ${item.make} ${item.model}`} tone="plain" color="danger" onPress={() => void v.remove(item.id)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  flex: { flex: 1, gap: tokens.space.xxs },
  icon: {
    width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center"
  }
});
