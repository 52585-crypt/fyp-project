import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { tokens } from "../tokens";
import { Field, fieldStyles } from "./Field";
import { Text } from "./Text";

type Props = Omit<TextInputProps, "style" | "multiline"> & { label?: string; optional?: boolean; error?: string | null; hint?: string };

/** Multi-line input with a character counter when maxLength is set. */
export function TextArea({ label, optional, error, hint, maxLength, value, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} optional={optional} error={error} hint={hint}>
      <View style={[fieldStyles.box, styles.box, focused && fieldStyles.focused, error ? fieldStyles.invalid : null]}>
        <TextInput
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={tokens.color.subtle}
          selectionColor={tokens.color.primary}
          multiline
          textAlignVertical="top"
          maxLength={maxLength}
          value={value}
          {...rest}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[fieldStyles.input, styles.input]}
        />
        {maxLength ? <Text variant="micro" color="subtle" style={styles.count}>{(value ?? "").length}/{maxLength}</Text> : null}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: tokens.sizes.textArea, alignItems: "stretch", flexDirection: "column", paddingVertical: tokens.space.xs },
  input: { minHeight: tokens.sizes.textArea - tokens.space.xl },
  count: { alignSelf: "flex-end" }
});
