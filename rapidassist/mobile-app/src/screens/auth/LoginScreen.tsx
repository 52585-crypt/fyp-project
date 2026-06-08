import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { CustomButton } from "../../components/CustomButton";
import { CustomInput } from "../../components/CustomInput";
import { appColors, radii } from "../../constants/theme";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function LoginScreen() {
  return (
    <ScreenScaffold title="Welcome back" subtitle="Login to request roadside assistance.">
      <View style={styles.card}>
        <CustomInput label="Phone" icon="call" placeholder="03001234567" keyboardType="phone-pad" />
        <CustomInput label="Password" icon="lock-closed" placeholder="Password" secureTextEntry />
        <CustomButton title="Login" />
        <Text style={styles.link}>Forgot password?</Text>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderRadius: radii.lg, backgroundColor: appColors.surface, borderWidth: 1, borderColor: appColors.border, padding: 14 },
  link: { color: appColors.primary, fontWeight: "900", textAlign: "center" }
});

