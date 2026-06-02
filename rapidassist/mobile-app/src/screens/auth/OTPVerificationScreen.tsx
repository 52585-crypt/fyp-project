import React from "react";
import { View, StyleSheet } from "react-native";
import { CustomButton } from "../../components/CustomButton";
import { CustomInput } from "../../components/CustomInput";
import { appColors, radii } from "../../constants/theme";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function OTPVerificationScreen() {
  return (
    <ScreenScaffold title="Verify OTP" subtitle="Enter the verification code sent to your phone.">
      <View style={styles.card}>
        <CustomInput label="OTP Code" icon="keypad" placeholder="123456" keyboardType="number-pad" />
        <CustomButton title="Verify" />
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderRadius: radii.lg, backgroundColor: appColors.surface, borderWidth: 1, borderColor: appColors.border, padding: 14 }
});

