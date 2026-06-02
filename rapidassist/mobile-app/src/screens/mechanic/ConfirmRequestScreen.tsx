import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { PriceCard } from "../../components/PriceCard";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "ConfirmMechanicRequest">;

const inspectionPrice = [
  { label: "Inspection Fee", amount: 900 },
  { label: "Travel Fee", amount: 350 }
];

export function ConfirmRequestScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Confirm Request" subtitle="Review service details before searching a mechanic.">
      <View style={styles.card}>
        <Text style={styles.title}>Engine diagnosis</Text>
        <Text style={styles.text}>Toyota Corolla at Gulberg 3, Lahore</Text>
      </View>
      <PriceCard lines={inspectionPrice} />
      <CustomButton title="Find Mechanic" onPress={() => navigation.navigate("MechanicAssigned")} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 16 },
  title: { color: appColors.text, fontSize: 16, fontWeight: "900" },
  text: { color: appColors.muted, fontSize: 13, fontWeight: "700" }
});
