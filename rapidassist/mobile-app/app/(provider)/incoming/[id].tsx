import { Redirect, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Card, ErrorState, Header, InfoRow, Screen, SkeletonCard, Text } from "../../../src/design/components";
import { tokens } from "../../../src/design/tokens";
import { providerRoutes } from "../../../src/navigation/routes";
import { CustomerRow, JobSummary } from "../../../src/requests/provider/shared";
import { useIncomingOffer } from "../../../src/requests/provider/useIncomingOffer";
import { parseRequestId } from "../../../src/requests/requestId";
import { getRequestTitle } from "../../../src/requests/serviceCatalog";
import { formatCurrency } from "../../../src/utils/format";

export default function IncomingRequest() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const offer = useIncomingOffer(parseRequestId(id));
  const r = offer.request;
  const mm = String(Math.floor(offer.seconds / 60)).padStart(2, "0");
  const ss = String(offer.seconds % 60).padStart(2, "0");
  if (r && offer.alreadyAssigned) return <Redirect href={providerRoutes.job(r.id)} />;

  return (
    <Screen header={<Header title={r ? getRequestTitle(r.category) : "New Request"} />}
      footer={r ? (
        <>
          <Button title="Accept" loading={offer.busy === "accept"} disabled={!offer.canAccept || offer.expired || Boolean(offer.busy)} onPress={offer.accept} />
          <Button title="Decline" variant="danger" loading={offer.busy === "decline"} disabled={Boolean(offer.busy) || !r.dispatch?.offerId} onPress={offer.decline} />
        </>
      ) : null}>
      {!r && !offer.error ? <SkeletonCard lines={5} /> : null}
      {!r && offer.error ? <ErrorState message={offer.error} onRetry={offer.reload} /> : null}
      {r ? (
        <>
          <View style={styles.banner} accessibilityLiveRegion="polite">
            <Text variant="bodySmallStrong" color="onPrimary">New Job Request</Text>
            <Text variant="bodySmallStrong" color="onPrimary">{offer.expired ? "Expired" : `Expires in ${mm}:${ss}`}</Text>
          </View>
          {!offer.canAccept ? <Banner tone="warning" message="Complete verification before accepting jobs." /> : null}
          {offer.error ? <Banner tone="danger" message={offer.error} /> : null}
          <CustomerRow request={r} />
          <JobSummary request={r} />
          <Card>
            <InfoRow icon="cash-outline" label="Estimated job total" value={formatCurrency(r.estimate.total)} strong valueColor="primary" />
            <Text variant="caption" color="muted">Final amount may change based on assessment.</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row", justifyContent: "space-between", backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.md, paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.md
  }
});
