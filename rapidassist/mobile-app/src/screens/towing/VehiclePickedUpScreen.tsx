import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "VehiclePickedUp">;

export function VehiclePickedUpScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Vehicle Picked Up" subtitle="The tow truck has loaded your vehicle.">
      <View style={styles.card}>
        <Text style={styles.status}>Status: In transit</Text>
        <Text style={styles.text}>Driver is moving toward Johar Town destination.</Text>
      </View>
      <CustomButton title="Reached Destination" onPress={() => navigation.navigate("ReachedDestination")} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 16 },
  status: { color: appColors.primary, fontSize: 16, fontWeight: "900" },
  text: { color: appColors.muted, fontSize: 13, fontWeight: "700" }
});
