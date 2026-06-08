import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "MechanicArrived">;

export function MechanicArrivedScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Mechanic Arrived" subtitle="The mechanic is at your location.">
      <View style={styles.card}>
        <Text style={styles.title}>Arrival Confirmed</Text>
        <Text style={styles.text}>Start inspection after meeting the mechanic.</Text>
      </View>
      <CustomButton title="Start Inspection" onPress={() => navigation.navigate("InspectionStarted")} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 16 },
  title: { color: appColors.success, fontSize: 17, fontWeight: "900" },
  text: { color: appColors.muted, fontSize: 13, fontWeight: "700" }
});
