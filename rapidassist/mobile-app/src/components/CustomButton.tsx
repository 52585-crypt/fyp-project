import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { appColors, radii } from "../constants/theme";

type Props = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline" | "danger";
  style?: ViewStyle;
};

export function CustomButton({ title, onPress, disabled, variant = "primary", style }: Props) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style
      ]}
    >
      <Text style={[styles.text, variant !== "primary" ? styles.outlineText : null, variant === "danger" ? styles.dangerText : null]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center"
  },
  primary: { backgroundColor: appColors.primary },
  outline: { backgroundColor: appColors.surface, borderWidth: 1, borderColor: appColors.border },
  danger: { backgroundColor: appColors.surface, borderWidth: 1, borderColor: appColors.danger },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.86 },
  text: { color: "white", fontSize: 15, fontWeight: "900" },
  outlineText: { color: appColors.primary },
  dangerText: { color: appColors.danger }
});

