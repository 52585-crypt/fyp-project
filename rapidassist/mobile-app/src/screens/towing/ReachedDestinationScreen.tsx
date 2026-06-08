import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "ReachedDestination">;

export function ReachedDestinationScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Reached Destination" subtitle="Confirm delivery and complete payment.">
      <View style={styles.card}>
        <Text style={styles.title}>Trip Completed</Text>
        <Text style={styles.text}>Your vehicle has been delivered successfully.</Text>
      </View>
      <CustomButton title="Proceed to Payment" onPress={() => navigation.navigate("Payment")} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 16 },
  title: { color: appColors.success, fontSize: 17, fontWeight: "900" },
  text: { color: appColors.muted, fontSize: 13, fontWeight: "700" }
});
