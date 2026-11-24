import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { MapCanvas, type MapCanvasMarker } from "../../components/maps/MapCanvas";
import { BottomSheet, IconButton, MapPill, MapTopBar, MAP_TOP_BAR_HEIGHT } from "../../design/components";
import { tokens } from "../../design/tokens";
import { customerRoutes } from "../../navigation/routes";
import { hasOperationalCoordinates } from "../../services/locationMapPolicy";
import type { ServiceRequest } from "../requests.types";
import { providerNoun, type CustomerStage } from "../stages";
import type { CustomerRequestState } from "../useCustomerRequest";

/** Stages shown map-first (live map + bottom sheet); the rest keep the scrolling stage layout. */
export const mapFirstStages: ReadonlyArray<CustomerStage> = ["searching", "no_provider", "assigned", "tracking", "arrived"];

function point(l: ServiceRequest["pickupLocation"] | null | undefined) {
  return hasOperationalCoordinates(l) ? { latitude: l.lat, longitude: l.lng } : null;
}

/** Markers + route for a live request: before assignment the trip itself, afterwards the provider heading to the target. */
export function liveMapContent(stage: CustomerStage, request: ServiceRequest, state: CustomerRequestState) {
  const r = state.route;
  if (stage === "searching" || stage === "no_provider" || !r.provider) {
    const pickup = point(request.pickupLocation);
    const drop = request.category === "car_towing" ? point(request.destinationLocation) : null;
    const markers: MapCanvasMarker[] = [
      ...(pickup ? [{ id: "pickup", kind: "pickup" as const, coordinate: pickup, label: "Pickup" }] : []),
      ...(drop ? [{ id: "drop", kind: "destination" as const, coordinate: drop }] : [])
    ];
    return { markers, route: [] };
  }
  const markers: MapCanvasMarker[] = [
    { id: "provider", kind: "provider", coordinate: r.provider, label: r.stale ? "Last known" : providerNoun(request.category) },
    ...(r.target ? [{ id: "target", kind: r.toDestination ? "destination" as const : "pickup" as const, coordinate: r.target, label: r.toDestination ? "Drop-off" : "You" }] : [])
  ];
  return { markers, route: r.route };
}

type Props = {
  stage: CustomerStage;
  request: ServiceRequest;
  state: CustomerRequestState;
  title: string;
  subtitle?: string;
  peek: number;
  right?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/** Map-first live request: full-bleed map, floating top bar, stage content in a bottom sheet. */
export function LiveRequestMap({ stage, request, state, title, subtitle, peek, right, footer, children }: Props) {
  const { markers, route } = liveMapContent(stage, request, state);
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <MapCanvas accessibilityLabel="Live request map" markers={markers} route={route} inset={{ top: MAP_TOP_BAR_HEIGHT, bottom: peek }} />
      <MapTopBar left={<IconButton icon="arrow-back" label="Back to home" onPress={() => router.dismissTo(customerRoutes.home)} />}
        center={<MapPill title={title} subtitle={subtitle} />} right={right} />
      <BottomSheet peek={peek} footer={footer} accessibilityLabel="Request details">{children}</BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: tokens.color.surfaceAlt } });
