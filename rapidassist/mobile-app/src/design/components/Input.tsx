import { forwardRef, useState, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { tokens } from "../tokens";
import { Field, fieldStyles } from "./Field";
import { Icon, type IconName } from "./Icon";

export type InputProps = Omit<TextInputProps, "style"> & {
  label?: string;
  optional?: boolean;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  right?: ReactNode;
};

/** Labelled single-line text input. */
export const Input = forwardRef<TextInput, InputProps>(function Input({ label, optional, hint, error, icon, right, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} optional={optional} hint={hint} error={error}>
      <View style={[fieldStyles.box, focused && fieldStyles.focused, error ? fieldStyles.invalid : null]}>
        {icon ? <Icon name={icon} color={focused ? "primary" : "muted"} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={tokens.color.subtle}
          selectionColor={tokens.color.primary}
          {...rest}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={fieldStyles.input}
        />
        {right}
      </View>
    </Field>
  );
});
