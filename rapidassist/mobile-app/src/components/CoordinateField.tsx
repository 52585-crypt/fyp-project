import React, { useEffect, useState } from "react";
import { Field } from "../ui/components";
import { RATextInput } from "./RATextInput";

type Props = { value: string; onChangeText: (value: string) => void; label: string; variant?: "compact" };

// Keep the in-progress text local so a decimal point or minus sign can be typed.
export function CoordinateField({ value, onChangeText, label, variant }: Props) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  const props = { value: draft, onChangeText: setDraft, keyboardType: "numeric" as const,
    onFocus: () => setEditing(true), onBlur: () => { onChangeText(draft); setEditing(false); } };
  return variant === "compact"
    ? <RATextInput {...props} icon="navigate" placeholder={label} accessibilityLabel={label} />
    : <Field {...props} icon="navigate" label={label} />;
}
