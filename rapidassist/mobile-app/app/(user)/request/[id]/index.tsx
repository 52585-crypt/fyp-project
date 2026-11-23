import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { Banner, ErrorState, Header, Screen, SkeletonCard, Text } from "../../../../src/design/components";
import { tapFeedback } from "../../../../src/design/haptics";
import { tokens } from "../../../../src/design/tokens";
import { customerRoutes } from "../../../../src/navigation/routes";
import { ApproveExtraWorkStage, CancelledStage, CompletedStage } from "../../../../src/requests/customer/ClosureStages";
import { ArrivedStage, AssignedStage, SearchingStage, TrackingStage } from "../../../../src/requests/customer/LiveStages";
import {
  ConfirmCompletionStage, FuelDeliveredStage, InProgressStage, ReachedDestinationStage, VehiclePickedUpStage
} from "../../../../src/requests/customer/ServiceStages";
import { parseRequestId } from "../../../../src/requests/requestId";
import type { CustomerStage } from "../../../../src/requests/stages";
import { titleFor } from "../../../../src/requests/customer/stageTitles";
import { useCustomerRequest } from "../../../../src/requests/useCustomerRequest";

const sosStages: ReadonlyArray<CustomerStage> = ["assigned", "tracking", "arrived", "vehicle_picked_up", "reached_destination"];

/** Stage-driven live request. Which content shows is decided only by getCustomerStage(). */
export default function CustomerRequestScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const requestId = parseRequestId(id);
  const state = useCustomerRequest(requestId);
  const { request, stage } = state;

  const sos = stage && sosStages.includes(stage) ? (
    <Pressable accessibilityRole="button" accessibilityLabel="SOS emergency help" accessibilityHint="Opens emergency numbers"
      onPress={() => { tapFeedback(); router.push(customerRoutes.support); }} style={styles.sos}>
      <Text variant="captionStrong" color="onPrimary">SOS</Text>
    </Pressable>
  ) : null;

  const back = () => router.dismissTo(customerRoutes.home);
  return (
    <Screen header={<Header title={titleFor(stage, request?.category)} back={back} right={sos} />}
      refreshing={state.refreshing} onRefresh={request ? state.refresh : undefined}>
      {state.error ? <Banner tone="danger" message={state.error} /> : null}
      {!request && state.loadState === "loading" ? <><SkeletonCard /><SkeletonCard lines={4} /></> : null}
      {!request && (state.loadState === "failed" || state.loadState === "unavailable") ? (
        <ErrorState title={state.loadState === "unavailable" ? "Request unavailable" : "Couldn't load request"}
          message={state.loadError} onRetry={state.loadState === "failed" ? state.refresh : undefined} />
      ) : null}
      {request && state.loadState === "failed" ? (
        <Banner tone="warning" title="Live updates paused" message={state.loadError ?? "Pull down to refresh."} />
      ) : null}
      {request && stage ? <StageView stage={stage} state={state} request={request} /> : null}
    </Screen>
  );
}

function StageView({ stage, ...props }: { stage: CustomerStage } & Parameters<typeof TrackingStage>[0]) {
  switch (stage) {
    case "searching": return <SearchingStage {...props} unavailable={false} />;
    case "no_provider": return <SearchingStage {...props} unavailable />;
    case "assigned": return <AssignedStage {...props} />;
    case "tracking": return <TrackingStage {...props} />;
    case "arrived": return <ArrivedStage {...props} />;
    case "vehicle_picked_up": return <VehiclePickedUpStage {...props} />;
    case "reached_destination": return <ReachedDestinationStage {...props} />;
    case "fuel_delivered": return <FuelDeliveredStage {...props} />;
    case "in_progress": return <InProgressStage {...props} />;
    case "approve_extra_work": return <ApproveExtraWorkStage {...props} />;
    case "confirm_completion": return <ConfirmCompletionStage {...props} />;
    case "completed": return <CompletedStage {...props} />;
    case "cancelled": return <CancelledStage {...props} />;
  }
}

const styles = StyleSheet.create({
  sos: {
    backgroundColor: tokens.color.danger, borderRadius: tokens.radius.sm, paddingHorizontal: tokens.space.md,
    minHeight: tokens.sizes.buttonSmall - tokens.space.sm, justifyContent: "center"
  }
});
