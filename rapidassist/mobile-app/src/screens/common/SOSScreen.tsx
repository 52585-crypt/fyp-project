import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CustomButton } from "../../components/CustomButton";
import { appColors, radii } from "../../constants/theme";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function SOSScreen() {
  return (
    <ScreenScaffold title="Emergency SOS" subtitle="Send your location and alert emergency contacts.">
      <View style={styles.card}>
        <Text style={styles.title}>SOS Ready</Text>
        <Text style={styles.text}>This screen is prepared for live location and push notification integration.</Text>
      </View>
      <CustomButton title="Send SOS Alert" variant="danger" />
      <CustomButton title="Call Emergency Contact" variant="outline" />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.danger, backgroundColor: appColors.dangerSoft, padding: 16 },
  title: { color: appColors.danger, fontSize: 18, fontWeight: "900" },
  text: { color: appColors.text, fontSize: 13, fontWeight: "700", lineHeight: 19 }
});
