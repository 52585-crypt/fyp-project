import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, Card, Icon, IconButton, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { LocationAutocompleteField } from "../../components/LocationAutocompleteField";
import { LocationMapPicker } from "../../components/LocationMapPicker";
import { requiresGoogleMap } from "../../services/locationMapPolicy";
import { applyNormalizedLocationTarget, normalizeLocation, type NormalizedLocation } from "../../services/normalizedLocation";
import type { BookingState } from "./useBookingState";

type Props = { b: BookingState; target: "pickup" | "destination"; title: string; optionalHint?: string };

/** Location card: address summary, "use current location", search, favourites, and an expandable map. */
export function LocationSection({ b, target, title, optionalHint }: Props) {
  const [editing, setEditing] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [search, setSearch] = useState("");
  const value = target === "pickup" ? b.pickup : b.destination;
  const apply = (loc: NormalizedLocation) => {
    applyNormalizedLocationTarget(target, loc, { pickup: b.setPickup, destination: b.setDestination });
    setEditing(false);
  };
  const favs = target === "pickup" ? b.favorites.favoriteLocations : [];

  return (
    <View style={styles.wrap}>
      <Text variant="bodySmallStrong">{title}{optionalHint ? <Text variant="bodySmall" color="muted"> ({optionalHint})</Text> : null}</Text>
      <Card padded={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${value?.address ?? "not set"}. Change`}
          onPress={() => setEditing((v) => !v)} style={styles.summary}>
          <Icon name={target === "pickup" ? "location-outline" : "flag-outline"} color="primary" />
          <View style={styles.flex}>
            <Text variant="bodySmallStrong" numberOfLines={2}>{value?.address ?? (target === "pickup" ? "Choose a location" : "Choose a drop-off")}</Text>
            {target === "pickup" && value?.source === "gps" ? <Text variant="caption" color="muted">Current location</Text> : null}
          </View>
          <Text variant="captionStrong" color="primary">{editing ? "Done" : value ? "Change" : "Set"}</Text>
        </Pressable>
        {editing ? (
          <View style={styles.editor}>
            {target === "pickup" ? (
              <Button title="Use current location" icon="locate-outline" variant="secondary" size="small" loading={b.locating}
                onPress={() => { void b.useCurrentLocation().then(() => setEditing(false)); }} />
            ) : null}
            <LocationAutocompleteField token={b.token} label={`Search ${title.toLowerCase()}`} icon="search" variant="compact"
              placeholder="Street, area or landmark" value={search} onChangeText={setSearch} onSelect={apply} near={b.pickup ?? undefined} />
            {favs.map((f) => (
              <View key={f.id} style={styles.fav}>
                <Pressable accessibilityRole="button" style={styles.favPick} disabled={f.latitude == null || f.longitude == null}
                  onPress={() => f.latitude != null && f.longitude != null && apply(normalizeLocation({
                    latitude: f.latitude, longitude: f.longitude, address: f.addressText, source: f.source || "unknown", placeId: f.placeId
                  }))}>
                  <Icon name="bookmark-outline" color="primary" size={tokens.sizes.iconSmall} />
                  <Text variant="bodySmall" numberOfLines={1} style={styles.flex}>{f.label}</Text>
                </Pressable>
                <IconButton icon="trash-outline" label={`Remove ${f.label}`} tone="plain" color="muted" onPress={() => void b.favorites.removeFavorite(f.id)} />
              </View>
            ))}
            {target === "pickup" && b.pickup ? (
              <Button title="Save this location" icon="bookmark-outline" variant="ghost" size="small" loading={b.favorites.favoriteSaving}
                onPress={() => void b.favorites.saveFavorite({ addressText: b.pickup!.address || "Saved location", source: b.pickup!.source, placeId: b.pickup!.placeId,
                  latitude: b.pickup!.latitude, longitude: b.pickup!.longitude })} />
            ) : null}
            <Button title={mapOpen ? "Hide map" : "Pick on map"} icon="map-outline" variant="outline" size="small" onPress={() => setMapOpen((v) => !v)} />
            {mapOpen ? (
              <LocationMapPicker
                pickup={b.pickup} destination={b.towing ? b.destination : null}
                route={b.towing ? b.route.route?.coordinates || [] : []}
                onCoordinateError={b.setError} currentLocation={b.currentLocation} cameraFocus={b.cameraFocus}
                onRequestCurrentLocation={b.recenter} activeTarget={target} onActiveTargetChange={() => undefined}
                onPickupChange={(v) => b.setFromMap("pickup", v)} onDestinationChange={(v) => b.setFromMap(b.towing ? "destination" : "pickup", v)}
                singlePoint={!b.towing} pointLabel={title} pickupLabel="Pickup" destinationLabel="Destination" mapHeight={tokens.sizes.mapLarge}
                requiresGoogleMap={requiresGoogleMap(b.pickup, b.towing ? b.destination : null)} />
            ) : null}
          </View>
        ) : null}
      </Card>
    </View>
  );
}


const styles = StyleSheet.create({
  wrap: { gap: tokens.space.sm },
  summary: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.lg, minHeight: tokens.sizes.touchMin },
  flex: { flex: 1 },
  editor: { gap: tokens.space.md, paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.lg },
  fav: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  favPick: { flex: 1, flexDirection: "row", alignItems: "center", gap: tokens.space.sm, minHeight: tokens.sizes.touchMin }
});
