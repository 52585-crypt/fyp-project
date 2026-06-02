import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CustomButton } from "../../components/CustomButton";
import { appColors, radii } from "../../constants/theme";
import type { RootStackParamList } from "../../types";
import { ScreenScaffold } from "../shared/ScreenScaffold";

type Props = NativeStackScreenProps<RootStackParamList, "MechanicServices">;

const mechanicOptions = ["Engine diagnosis", "Battery inspection", "Brake issue", "Oil leak", "General repair"];

export function MechanicServicesScreen({ navigation }: Props) {
  return (
    <ScreenScaffold title="Mechanic Services" subtitle="Choose the roadside repair category.">
      <View style={styles.grid}>
        {mechanicOptions.map((item) => (
          <View key={item} style={styles.option}>
            <Text style={styles.optionText}>{item}</Text>
          </View>
        ))}
      </View>
      <CustomButton title="Continue" onPress={() => navigation.navigate("MechanicServiceInfo")} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  option: { borderRadius: radii.md, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 14 },
  optionText: { color: appColors.text, fontSize: 14, fontWeight: "900" }
});
