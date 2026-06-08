import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { PriceCard } from "../../components/PriceCard";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "ExtraWorkApproval">;

const extraWork = [
  { label: "Battery replacement labor", amount: 700 },
  { label: "Emergency parts handling", amount: 300 }
];

export function ExtraWorkApprovalScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Extra Work Approval" subtitle="Approve additional work before the mechanic proceeds.">
      <View style={styles.card}>
        <Text style={styles.title}>Recommended work</Text>
        <Text style={styles.text}>Replace weak battery terminal and clean corrosion.</Text>
      </View>
      <PriceCard lines={extraWork} />
      <CustomButton title="Approve and Pay" onPress={() => navigation.navigate("Payment")} />
      <CustomButton title="Decline Extra Work" variant="outline" />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 16 },
  title: { color: appColors.text, fontSize: 17, fontWeight: "900" },
  text: { color: appColors.muted, fontSize: 13, fontWeight: "700" }
});
