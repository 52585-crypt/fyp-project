import React from "react";
import { View, StyleSheet } from "react-native";
import { CustomButton } from "../../components/CustomButton";
import { CustomInput } from "../../components/CustomInput";
import { appColors, radii } from "../../constants/theme";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function SignupScreen() {
  return (
    <ScreenScaffold title="Create account" subtitle="Start using RapidAssist today.">
      <View style={styles.card}>
        <CustomInput label="Full name" icon="person" placeholder="Your name" />
        <CustomInput label="Phone" icon="call" placeholder="03001234567" keyboardType="phone-pad" />
        <CustomInput label="Password" icon="lock-closed" placeholder="Password" secureTextEntry />
        <CustomButton title="Create account" />
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderRadius: radii.lg, backgroundColor: appColors.surface, borderWidth: 1, borderColor: appColors.border, padding: 14 }
});

