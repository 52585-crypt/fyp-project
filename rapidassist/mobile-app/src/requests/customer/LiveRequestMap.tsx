import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { MapCanvas } from "../../components/maps/MapCanvas";
import { BottomSheet, IconButton, MapPill, MapTopBar, MAP_TOP_BAR_HEIGHT } from "../../design/components";
import { tokens } from "../../design/tokens";
import { customerRoutes } from "../../navigation/routes";
import type { ServiceRequest } from "../requests.types";
import type { CustomerStage } from "../stages";
import type { CustomerRequestState } from "../useCustomerRequest";
import { liveMapContent } from "./liveMapContent";

export { mapFirstStages } from "./liveMapContent";

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
  const { markers, route, plannedRoute } = liveMapContent(stage, request, state);
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <MapCanvas accessibilityLabel="Live request map" markers={markers} route={route} plannedRoute={plannedRoute} inset={{ top: MAP_TOP_BAR_HEIGHT, bottom: peek }} />
      <MapTopBar left={<IconButton icon="arrow-back" label="Back to home" onPress={() => router.dismissTo(customerRoutes.home)} />}
        center={<MapPill title={title} subtitle={subtitle} />} right={right} />
      <BottomSheet peek={peek} footer={footer} accessibilityLabel="Request details">{children}</BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: tokens.color.surfaceAlt } });
