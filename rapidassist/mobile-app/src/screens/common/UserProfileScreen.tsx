import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CustomButton } from "../../components/CustomButton";
import { appColors, radii } from "../../constants/theme";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function UserProfileScreen() {
  return (
    <ScreenScaffold title="Profile" subtitle="Manage account and notification settings.">
      <View style={styles.card}>
        <View style={styles.avatar}><Ionicons name="person" size={30} color="white" /></View>
        <Text style={styles.name}>Ali Hassan</Text>
        <Text style={styles.phone}>0300 1234567</Text>
      </View>
      <CustomButton title="Edit Profile" />
      <CustomButton title="Logout" variant="outline" />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 18 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: appColors.primary, alignItems: "center", justifyContent: "center" },
  name: { marginTop: 10, color: appColors.text, fontSize: 18, fontWeight: "900" },
  phone: { marginTop: 4, color: appColors.muted, fontSize: 13, fontWeight: "700" }
});
