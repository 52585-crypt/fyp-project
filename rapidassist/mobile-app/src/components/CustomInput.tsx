import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appColors, radii } from "../constants/theme";

type Props = TextInputProps & {
  label?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
};

export function CustomInput({ label, icon, style, ...props }: Props) {
  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.wrap}>
        {icon ? <Ionicons name={icon} size={18} color={appColors.primary} style={styles.icon} /> : null}
        <TextInput placeholderTextColor={appColors.muted} style={[styles.input, style]} {...props} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 7, color: appColors.text, fontSize: 13, fontWeight: "900" },
  wrap: {
    height: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: appColors.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13
  },
  icon: { marginRight: 9 },
  input: { flex: 1, color: appColors.text, fontSize: 14 }
});

