import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Card, EmptyState, InfoRow, PersonCard, PriceBreakdown, RatingStars, SuccessHero, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { customerRoutes } from "../../navigation/routes";
import { formatCurrency } from "../../utils/format";
import type { StageProps } from "./shared";

export function ApproveExtraWorkStage({ state, request }: StageProps) {
  const extra = request.mechanicDetails?.extraWork;
  const part = extra?.partPrice ?? 0;
  const labour = extra?.laborCharge ?? 0;
  const lines = [
    ...(extra?.partName || part ? [{ label: extra?.partName || "Parts", amount: part }] : []),
    ...(labour ? [{ label: "Labour", amount: labour }] : [])
  ];
  return (
    <>
      <Card tone="soft">
        <Text variant="bodyStrong">Inspection Result</Text>
        <Text variant="bodySmall" color="muted">{extra?.description || "Your mechanic found additional issues that need your approval."}</Text>
        {extra?.estimatedTime ? <InfoRow icon="time-outline" label="Estimated time" value={extra.estimatedTime} /> : null}
      </Card>
      <Card>
        <PriceBreakdown title="Recommended Extra Work" lines={lines} total={part + labour} totalLabel="Extra Work Total" />
      </Card>
      <Card>
        <InfoRow label="Old Total (Estimated)" value={formatCurrency(request.estimate.total)} />
        <InfoRow label="Extra Work Total" value={formatCurrency(part + labour)} />
        <InfoRow label="New Total" value={formatCurrency(request.estimate.total + part + labour)} strong valueColor="primary" />
      </Card>
      <Banner message="Your mechanic starts the extra work only after you approve." />
      <View style={styles.row}>
        <Button title="Reject" variant="danger" fullWidth={false} style={styles.reject} disabled={state.updating}
          onPress={() => state.decideExtraWork(false)} />
        <Button title="Approve & Continue" fullWidth={false} style={styles.flex} loading={state.updating}
          onPress={() => state.decideExtraWork(true)} />
      </View>
    </>
  );
}

export function CompletedStage({ request }: StageProps) {
  const p = request.provider;
  return (
    <>
      <SuccessHero title="Thank you!" message="Your service has been completed successfully." />
      {p ? <Card><PersonCard name={p.name} rating={p.ratingAvg} ratingCount={p.ratingCount} subtitle="Your service provider" /></Card> : null}
      <Card>
        <PriceBreakdown lines={request.estimate.lines} total={request.estimate.total} totalLabel="Total" />
      </Card>
      {request.review?.rating ? (
        <Card>
          <Text variant="bodyStrong">Your review</Text>
          <RatingStars value={request.review.rating} size={tokens.sizes.icon} />
          {request.review.comment ? <Text variant="bodySmall" color="muted">{request.review.comment}</Text> : null}
        </Card>
      ) : null}
      <Button title="Payment & Invoice" icon="receipt-outline" onPress={() => router.push(customerRoutes.pay(request.id))} />
      {!request.review?.rating && request.providerId ? (
        <Button title="Rate your experience" icon="star-outline" variant="outline" onPress={() => router.push(customerRoutes.review(request.id))} />
      ) : null}
    </>
  );
}

export function CancelledStage({ request }: StageProps) {
  return (
    <EmptyState icon="close-circle-outline" title="Request cancelled"
      message="This request was cancelled. You can book again whenever you need help."
      actionLabel="Book again" onAction={() => router.replace(customerRoutes.newRequest(request.category))} />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: tokens.space.md },
  reject: { flex: 0.6 },
  flex: { flex: 1 }
});
