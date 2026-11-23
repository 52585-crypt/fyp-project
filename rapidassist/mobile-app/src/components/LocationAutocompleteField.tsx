import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Field } from "../ui/components";
import { RATextInput } from "./RATextInput";
import { searchPlaces } from "../services/geocoding";
import { isGoogleMapConfigured } from "../services/googleMapsAvailability";
import type { NormalizedLocation } from "../services/normalizedLocation";
import type { Coordinate } from "../utils/distance";
import { createLocationAutocompleteController, type AutocompleteState } from "../locations/locationAutocomplete";
import { autocompleteGooglePlaces, resolveGoogleSuggestion, type LocationSuggestion } from "../locations/places.api";

type Props = {
  token: string | null;
  value: string;
  onChangeText: (value: string) => void;
  onSelect: (location: NormalizedLocation) => void;
  near?: Coordinate;
  label?: string;
  placeholder: string;
  icon: string;
  variant?: "field" | "compact";
};

const emptyState: AutocompleteState = { suggestions: [], provider: null, loading: false, error: null };

export function LocationAutocompleteField({ token, value, onChangeText, onSelect, near, label, placeholder, icon, variant = "field" }: Props) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState(emptyState);
  const forwarded = useRef(value);
  const googleEnabled = isGoogleMapConfigured();
  const controller = useMemo(() => createLocationAutocompleteController({
    googleEnabled: Boolean(token && googleEnabled),
    googleSearch: (query, sessionToken, bias, signal) => autocompleteGooglePlaces(token!, query, sessionToken, bias, signal),
    googleDetails: (suggestion, sessionToken, signal) => resolveGoogleSuggestion(token!, suggestion, sessionToken, signal),
    photonSearch: searchPlaces
  }), [googleEnabled, token]);

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    if (value === forwarded.current) return;
    forwarded.current = value;
    setDraft(value);
    controller.reset();
  }, [controller, value]);

  function change(text: string) {
    forwarded.current = text;
    setDraft(text);
    onChangeText(text);
    controller.setQuery(text, near);
  }

  async function choose(suggestion: LocationSuggestion) {
    try {
      const location = await controller.select(suggestion);
      const display = location.address || location.displayName || suggestion.primaryText;
      forwarded.current = display;
      setDraft(display);
      onSelect({ ...location, address: display });
    } catch {
      // Controller state provides an inline retryable error.
    }
  }

  const inputProps = { value: draft, onChangeText: change, placeholder, icon: icon as any };
  return <View style={styles.root}>
    {variant === "compact"
      ? <RATextInput {...inputProps} />
      : <Field {...inputProps} label={label || placeholder} />}
    {state.loading ? <Text style={styles.status}>Searching locations…</Text> : null}
    {state.suggestions.length ? <View style={styles.suggestions}>
      {state.suggestions.map((suggestion) => <Pressable
        accessibilityRole="button"
        key={`${suggestion.provider}:${suggestion.id}`}
        onPress={() => void choose(suggestion)}
        style={styles.suggestion}
      >
        <Text style={styles.primary}>{suggestion.primaryText}</Text>
        {suggestion.secondaryText ? <Text style={styles.secondary}>{suggestion.secondaryText}</Text> : null}
      </Pressable>)}
      <Text style={styles.attribution}>{state.provider === "google_places" ? "Google Maps" : "Powered by Photon · © OpenStreetMap"}</Text>
    </View> : null}
    {state.error ? <View style={styles.errorRow}>
      <Text style={styles.error}>{state.error}</Text>
      <Pressable accessibilityRole="button" onPress={() => controller.retry(near)}><Text style={styles.retry}>Retry</Text></Pressable>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 7 },
  status: { color: "#64748b", fontSize: 11, fontWeight: "700" },
  suggestions: { borderWidth: 1, borderColor: "#dbe4df", borderRadius: 14, backgroundColor: "white", overflow: "hidden" },
  suggestion: { minHeight: 54, justifyContent: "center", paddingHorizontal: 13, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#edf2ef" },
  primary: { color: "#14231d", fontSize: 13, fontWeight: "900" },
  secondary: { marginTop: 3, color: "#64748b", fontSize: 11, lineHeight: 15, fontWeight: "600" },
  attribution: { alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 7, color: "#5f6368", fontSize: 10, fontWeight: "800" },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: { flex: 1, color: "#b91c1c", fontSize: 11, fontWeight: "700" },
  retry: { color: "#087f5b", fontSize: 12, fontWeight: "900" }
});
