import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { Banner, Button, ErrorState, Header, Screen, SkeletonCard, Text } from "../../../../src/design/components";
import { tapFeedback } from "../../../../src/design/haptics";
import { tokens } from "../../../../src/design/tokens";
import { customerRoutes } from "../../../../src/navigation/routes";
import { ApproveExtraWorkStage, CancelledStage, CompletedStage } from "../../../../src/requests/customer/ClosureStages";
import { LiveRequestMap, mapFirstStages } from "../../../../src/requests/customer/LiveRequestMap";
import { OffersSheet } from "../../../../src/requests/customer/OffersSheet";
import { TrackingSheet } from "../../../../src/requests/customer/TrackingSheet";
import {
  ConfirmCompletionStage, FuelDeliveredStage, InProgressStage, ReachedDestinationStage, VehiclePickedUpStage
} from "../../../../src/requests/customer/ServiceStages";
import type { StageProps } from "../../../../src/requests/customer/shared";
import { parseRequestId } from "../../../../src/requests/requestId";
import type { CustomerStage } from "../../../../src/requests/stages";
import { titleFor } from "../../../../src/requests/customer/stageTitles";
import { useCustomerRequest } from "../../../../src/requests/useCustomerRequest";
import { getServiceTitle } from "../../../../src/requests/serviceCatalog";

const sosStages: ReadonlyArray<CustomerStage> = ["assigned", "tracking", "arrived", "vehicle_picked_up", "reached_destination"];
const OFFERS_PEEK = tokens.sizes.sheetPeek + tokens.sizes.avatarLarge;
const TRACKING_PEEK = tokens.sizes.sheetPeek;

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

  const paused = request && state.loadState === "failed" ? (
    <Banner tone="warning" title="Live updates paused" message={state.loadError ?? "Check your connection."}
      action={<Button title="Retry" size="small" variant="secondary" fullWidth={false} onPress={state.refresh} />} />
  ) : null;

  if (request && stage && mapFirstStages.includes(stage)) {
    const searching = stage === "searching" || stage === "no_provider";
    return (
      <LiveRequestMap stage={stage} request={request} state={state} right={sos} peek={searching ? OFFERS_PEEK : TRACKING_PEEK}
        title={titleFor(stage, request.category)} subtitle={searching || stage === "arrived" ? getServiceTitle(request.category) : `ETA ${state.eta}`}>
        {paused}
        <StageView stage={stage} state={state} request={request} />
      </LiveRequestMap>
    );
  }

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
      {paused}
      {request && stage ? <StageView stage={stage} state={state} request={request} /> : null}
    </Screen>
  );
}

function StageView({ stage, ...props }: { stage: CustomerStage } & StageProps) {
  switch (stage) {
    case "searching": return <OffersSheet {...props} unavailable={false} />;
    case "no_provider": return <OffersSheet {...props} unavailable />;
    case "assigned":
    case "tracking":
    case "arrived": return <TrackingSheet stage={stage} {...props} />;
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
    backgroundColor: tokens.color.danger, borderRadius: tokens.radius.control, paddingHorizontal: tokens.space.md,
    minHeight: tokens.sizes.iconButton, justifyContent: "center"
  }
});
