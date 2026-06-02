import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "DriverSearch">;

export function DriverSearchScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Searching Driver" subtitle="Matching you with the nearest verified tow truck.">
      <View style={styles.card}>
        <ActivityIndicator size="large" color={appColors.primary} />
        <Text style={styles.title}>Finding best driver</Text>
        <Text style={styles.text}>Checking location, rating, vehicle type, and availability.</Text>
      </View>
      <CustomButton title="Simulate Driver Assigned" onPress={() => navigation.navigate("DriverAssigned")} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", gap: 10, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 24 },
  title: { color: appColors.text, fontSize: 17, fontWeight: "900" },
  text: { color: appColors.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 19 }
});
