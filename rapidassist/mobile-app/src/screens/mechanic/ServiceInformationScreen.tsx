import React from "react";
import { View, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { CustomInput } from "../../components/CustomInput";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "MechanicServiceInfo">;

export function ServiceInformationScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Service Information" subtitle="Describe the issue so the mechanic arrives prepared.">
      <View style={styles.card}>
        <CustomInput label="Vehicle" icon="car" value="Toyota Corolla" />
        <CustomInput label="Issue" icon="construct" placeholder="Engine noise, battery dead, tyre issue..." />
        <CustomInput label="Location" icon="location" value="Gulberg 3, Lahore" />
      </View>
      <CustomButton title="Review Request" onPress={() => navigation.navigate("ConfirmMechanicRequest")} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 14 }
});
