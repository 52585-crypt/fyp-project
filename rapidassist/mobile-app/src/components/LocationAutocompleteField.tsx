import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Input, Text, type IconName } from "../design/components";
import { tapFeedback } from "../design/haptics";
import { tokens } from "../design/tokens";
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

  return <View style={styles.root}>
    <Input value={draft} onChangeText={change} placeholder={placeholder} icon={icon as IconName}
      label={variant === "compact" ? undefined : label || placeholder} accessibilityLabel={label || placeholder} />
    {state.loading ? <Text variant="caption" color="muted">Searching locations…</Text> : null}
    {state.suggestions.length ? <View style={styles.suggestions}>
      {state.suggestions.map((suggestion) => <Pressable
        accessibilityRole="button"
        accessibilityLabel={[suggestion.primaryText, suggestion.secondaryText].filter(Boolean).join(", ")}
        key={`${suggestion.provider}:${suggestion.id}`}
        onPress={() => { tapFeedback(); void choose(suggestion); }}
        style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: tokens.color.primarySoft }]}
      >
        <Text variant="bodySmallStrong">{suggestion.primaryText}</Text>
        {suggestion.secondaryText ? <Text variant="caption" color="muted">{suggestion.secondaryText}</Text> : null}
      </Pressable>)}
      <Text variant="micro" color="muted" style={styles.attribution}>{state.provider === "google_places" ? "Google Maps" : "Powered by Photon · © OpenStreetMap"}</Text>
    </View> : null}
    {state.error ? <View style={styles.errorRow}>
      <Text variant="caption" color="danger" style={styles.flex}>{state.error}</Text>
      <Pressable accessibilityRole="button" onPress={() => controller.retry(near)} hitSlop={tokens.space.md}>
        <Text variant="bodySmallStrong" color="primary">Retry</Text>
      </Pressable>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: tokens.space.sm },
  suggestions: {
    borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface, overflow: "hidden"
  },
  suggestion: {
    minHeight: tokens.sizes.input, justifyContent: "center", gap: tokens.space.xxs, paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm, borderBottomWidth: tokens.sizes.hairline, borderBottomColor: tokens.color.border
  },
  attribution: { alignSelf: "flex-end", paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.xs },
  errorRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  flex: { flex: 1 }
});
