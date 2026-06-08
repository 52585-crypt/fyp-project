import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "InspectionStarted">;

export function InspectionStartedScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Inspection Started" subtitle="Mechanic is diagnosing the vehicle.">
      <View style={styles.card}>
        <Text style={styles.title}>Initial finding</Text>
        <Text style={styles.text}>Battery voltage is low. Extra work may be required.</Text>
      </View>
      <CustomButton title="Review Extra Work" onPress={() => navigation.navigate("ExtraWorkApproval")} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 16 },
  title: { color: appColors.text, fontSize: 17, fontWeight: "900" },
  text: { color: appColors.muted, fontSize: 13, fontWeight: "700" }
});
