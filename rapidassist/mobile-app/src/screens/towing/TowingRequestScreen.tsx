import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { CustomInput } from "../../components/CustomInput";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "TowingRequest">;
type VehicleInfoProps = NativeStackScreenProps<RootStackParamList, "VehicleInformation">;

export function TowingRequestScreen({ navigation }: Props) {
  const [pickup, setPickup] = useState("Gulberg 3, Lahore");
  const [destination, setDestination] = useState("Johar Town, Lahore");

  return (
    <ScreenScaffold title="Towing Request" subtitle="Set pickup and destination to estimate towing.">
      <View style={styles.card}>
        <CustomInput label="Pickup Location" icon="locate" value={pickup} onChangeText={setPickup} />
        <CustomInput label="Drop-off Destination" icon="flag" value={destination} onChangeText={setDestination} />
        <CustomInput label="Problem Details" icon="alert-circle" placeholder="Vehicle not starting, accident, stuck..." />
      </View>
      <CustomButton title="Continue to Vehicle Info" onPress={() => navigation.navigate("TowingEstimate")} />
    </ScreenScaffold>
  );
}

export function VehicleInformationScreen({ navigation }: VehicleInfoProps) {
  return (
    <ScreenScaffold title="Vehicle Information" subtitle="Confirm the vehicle that needs towing.">
      <View style={styles.card}>
        <CustomInput label="Vehicle Type" icon="car" placeholder="Sedan, SUV, bike..." value="Honda Civic" />
        <CustomInput label="Registration Number" icon="reader" placeholder="LES 1234" value="LEA 2244" />
        <CustomInput label="Vehicle Condition" icon="construct" placeholder="Cannot move, damaged, locked..." />
      </View>
      <CustomButton title="Calculate Estimate" onPress={() => navigation.navigate("TowingEstimate")} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: appColors.surface,
    padding: 14
  },
  helper: { color: appColors.muted, fontSize: 12, fontWeight: "700" }
});
