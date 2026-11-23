import React from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Props = TextInputProps & {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  rightElement?: React.ReactNode;
};

export function RATextInput({ icon, rightElement, style, ...props }: Props) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={[styles.wrap, focused ? styles.wrapFocused : null]}>
      {icon ? <Ionicons name={icon} size={20} color={focused ? "#006341" : "#4B5E55"} style={styles.icon} /> : null}
      <TextInput
        placeholderTextColor="#71837A"
        style={[styles.input, style]}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
      {rightElement}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 54,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D1D9D4",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14
  },
  wrapFocused: {
    borderColor: "#006341"
  },
  icon: { marginRight: 10 },
  input: {
    flex: 1,
    color: "#0F1A15",
    fontSize: 15,
    paddingVertical: 0
  }
});

