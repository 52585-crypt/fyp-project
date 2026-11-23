import React, { useState } from "react";
import { Modal, Pressable, SafeAreaView, Text, View } from "react-native";
import { LocationMapPicker as LegacyPicker } from "./LocationMapPickerLegacy";
import { TargetSwitch } from "./LocationMapPicker.shared";
import { GoogleMapView } from "./GoogleMapView";
import { selectedCoordinateText, type PickerProps } from "./GoogleMap.shared";
import { isGoogleMapConfigured } from "../services/googleMapsAvailability";
import { coordinatesFromUnknown } from "../utils/distance";
export type { LocationTarget } from "./LocationMapPicker.shared";

export function LocationMapPicker(props: PickerProps) {
  const [expanded, setExpanded] = useState(false);
  const enabled = isGoogleMapConfigured();
  if (!enabled && props.requiresGoogleMap) return <View style={{ padding: 16 }}><Text>Google Maps is required to display this selected location. Configure Maps or select it again with Photon or the map.</Text></View>;
  if (!enabled) return <LegacyPicker {...props} />;
  const onPress = (value: unknown) => {
    const point = coordinatesFromUnknown(value);
    if (!point) {
      props.onCoordinateError?.("The map returned invalid coordinates. Please tap the map again.");
      return;
    }
    if (props.singlePoint || props.activeTarget === "pickup") props.onPickupChange(point);
    else props.onDestinationChange(point);
  };
  const map = <GoogleMapView pickup={props.pickup} destination={props.singlePoint ? null : props.destination} route={props.singlePoint ? [] : props.route} providers={props.providers} pickupLabel={props.singlePoint ? props.pointLabel : props.pickupLabel} destinationLabel={props.destinationLabel} currentLocation={props.currentLocation} cameraFocus={props.cameraFocus} onPress={onPress} />;
  const instructions = `Tap map to set ${props.singlePoint ? (props.pointLabel || "service location").toLowerCase() : props.activeTarget}`;
  return <View style={{ gap: 8 }}>
    {!props.singlePoint ? <TargetSwitch activeTarget={props.activeTarget} onActiveTargetChange={props.onActiveTargetChange} /> : null}
    <Text>{instructions}</Text>
    <View style={{ height: props.mapHeight || 280, overflow: "hidden", borderRadius: 18 }}>{map}</View>
    <Pressable onPress={() => setExpanded(true)} accessibilityRole="button"><Text>Full map</Text></Pressable>
    <Text>{props.singlePoint ? props.pointLabel || "Service location" : props.pickupLabel || "Pickup"}: {selectedCoordinateText(props.pickup)}</Text>
    {!props.singlePoint ? <Text>{props.destinationLabel || "Destination"}: {selectedCoordinateText(props.destination)}</Text> : null}
    <Modal visible={expanded} animationType="slide" onRequestClose={() => setExpanded(false)}>
      <SafeAreaView style={{ flex: 1, padding: 12, gap: 8 }}>
        <Pressable onPress={() => setExpanded(false)} accessibilityRole="button"><Text>Close map</Text></Pressable>
        {!props.singlePoint ? <TargetSwitch activeTarget={props.activeTarget} onActiveTargetChange={props.onActiveTargetChange} /> : null}
        <Text>{instructions}</Text><View style={{ flex: 1 }}>{expanded ? map : null}</View>
      </SafeAreaView>
    </Modal>
  </View>;
}
