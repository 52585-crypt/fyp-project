import React from "react";
import { View, StyleSheet } from "react-native";
import { DriverCard } from "../../components/DriverCard";
import { MapViewComponent } from "../../components/MapViewComponent";
import { CustomButton } from "../../components/CustomButton";
import { demoProvider } from "../../services/dummyApi";
import { ScreenScaffold } from "../shared/ScreenScaffold";

export function LiveTrackingScreen() {
  return (
    <ScreenScaffold title="Live Tracking" subtitle="Your provider is on the way.">
      <MapViewComponent />
      <DriverCard driver={demoProvider} />
      <View style={styles.actions}>
        <CustomButton title="SOS" variant="danger" style={{ flex: 1 }} />
        <CustomButton title="Cancel Request" variant="outline" style={{ flex: 1 }} />
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 10 }
});

