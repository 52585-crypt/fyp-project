import React from "react";
import { View, StyleSheet } from "react-native";
import { CustomButton } from "../../components/CustomButton";
import { CustomInput } from "../../components/CustomInput";
import { appColors, radii } from "../../constants/theme";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function ForgotPasswordScreen() {
  return (
    <ScreenScaffold title="Forgot password" subtitle="Recover your account using your phone number.">
      <View style={styles.card}>
        <CustomInput label="Phone" icon="call" placeholder="03001234567" keyboardType="phone-pad" />
        <CustomButton title="Send OTP" />
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderRadius: radii.lg, backgroundColor: appColors.surface, borderWidth: 1, borderColor: appColors.border, padding: 14 }
});
