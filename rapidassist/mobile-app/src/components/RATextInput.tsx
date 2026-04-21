import React from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Props = TextInputProps & {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
};

export function RATextInput({ icon, style, ...props }: Props) {
  return (
    <View style={styles.wrap}>
      {icon ? <Ionicons name={icon} size={18} color={colors.mutedText} style={styles.icon} /> : null}
      <TextInput
        placeholderTextColor={colors.mutedText}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14
  },
  icon: { marginRight: 10 },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15
  }
});

