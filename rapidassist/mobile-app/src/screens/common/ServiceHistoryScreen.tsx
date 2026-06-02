import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { appColors, radii } from "../../constants/theme";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function ServiceHistoryScreen() {
  return (
    <ScreenScaffold title="Service History" subtitle="Recent towing, mechanic, and fuel requests.">
      {["Car towing - Completed", "Mechanic - Paid", "Fuel delivery - Completed"].map((item) => (
        <View key={item} style={styles.row}><Text style={styles.text}>{item}</Text></View>
      ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.md, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 14 },
  text: { color: appColors.text, fontSize: 14, fontWeight: "800" }
});

