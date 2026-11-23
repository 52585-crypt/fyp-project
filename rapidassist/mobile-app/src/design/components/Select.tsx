import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";
import { Field, fieldStyles } from "./Field";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type SelectOption<T extends string> = { value: T; label: string; icon?: IconName };

type Props<T extends string> = {
  label?: string;
  optional?: boolean;
  value: T | null;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string | null;
  icon?: IconName;
};

/** Dropdown that opens a bottom sheet list. Same behaviour on Android and Web. */
export function Select<T extends string>({ label, optional, value, options, onChange, placeholder = "Select", error, icon }: Props<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Field label={label} optional={optional} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? "Select"}: ${current?.label ?? placeholder}`}
        onPress={() => { tapFeedback(); setOpen(true); }}
        style={[fieldStyles.box, error ? fieldStyles.invalid : null]}
      >
        {current?.icon ?? icon ? <Icon name={(current?.icon ?? icon)!} color="muted" /> : null}
        <Text variant="body" color={current ? "text" : "subtle"} style={styles.flex} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Icon name="chevron-down" color="muted" size={tokens.sizes.iconSmall} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close list" />
        <View style={styles.sheet}>
          {label ? <Text variant="headline" style={styles.sheetTitle}>{label}</Text> : null}
          <FlatList
            data={options as SelectOption<T>[]}
            keyExtractor={(o) => o.value}
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => { tapFeedback(); onChange(item.value); setOpen(false); }}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  {item.icon ? <Icon name={item.icon} color={selected ? "primary" : "muted"} /> : null}
                  <Text variant={selected ? "bodyStrong" : "body"} color={selected ? "primary" : "text"} style={styles.flex}>{item.label}</Text>
                  {selected ? <Icon name="checkmark" color="primary" /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </Field>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: tokens.color.overlay },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "60%", backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.sheet, borderTopRightRadius: tokens.radius.sheet, padding: tokens.space.screen,
    width: "100%", maxWidth: tokens.sizes.maxContent, alignSelf: "center"
  },
  sheetTitle: { marginBottom: tokens.space.md },
  option: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.md, minHeight: tokens.sizes.touchMin,
    paddingHorizontal: tokens.space.md, borderRadius: tokens.radius.sm
  },
  optionSelected: { backgroundColor: tokens.color.primarySoft }
});
