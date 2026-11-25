import { router } from "expo-router";
import { Banner, Button, Card, EmptyState, InfoRow, PriceBreakdown, RadioCard, RatingStars, SuccessHero, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { providerRoutes } from "../../navigation/routes";
import { usePayment } from "../../payments/usePayment";
import { formatCurrency, formatDateTime } from "../../utils/format";
import { getServiceTitle } from "../serviceCatalog";
import { CustomerRow, JobMap, JobProgress, type JobProps } from "./shared";

/** Towing en route to drop-off; other categories go straight to payment & completion. */
export function InProgressStage(props: JobProps) {
  const { job, request } = props;
  if (job.next !== "reached_destination") return <PaymentCompletionStage {...props} />;
  return (
    <>
      <Banner tone="success" title="Vehicle loaded" message="Drive safely to the destination." />
      <JobMap {...props} height={tokens.sizes.mapLarge} />
      <Card><InfoRow icon="flag-outline" label="Destination" value={request.destinationLocation?.addressText ?? "Drop-off"} stacked /></Card>
      <JobProgress request={request} />
      <Button title="Navigate to drop-off" icon="navigate-outline" variant="outline" onPress={() => void job.navigate("destination")}
        accessibilityHint="Opens Google Maps driving directions" />
      <Button title="Reached Destination" icon="flag" loading={job.updating} onPress={job.advance} />
    </>
  );
}

export function PaymentCompletionStage({ job, request }: JobProps) {
  return (
    <>
      <Card><PriceBreakdown title="Bill Summary" lines={request.estimate.lines} total={request.estimate.total} totalLabel="Total Amount" /></Card>
      <Text variant="headline">Payment Method</Text>
      <RadioCard title="Cash" subtitle="To be collected from customer" selected />
      <RadioCard title="Online Payment" subtitle="Card / wallet" tag="Coming soon" selected={false} disabled />
      <Banner message="Please collect full payment from the customer before marking as completed." />
      <Button title="Mark as Completed" icon="checkmark-done" loading={job.updating} onPress={job.advance} />
    </>
  );
}

export function AwaitingCustomerStage({ request }: JobProps) {
  return (
    <>
      <SuccessHero tone="primary" icon="hourglass-outline" title="Waiting for customer confirmation"
        message="The customer needs to confirm the service is complete. This updates automatically." />
      <CustomerRow request={request} />
      <JobProgress request={request} />
    </>
  );
}

export function JobCompletedStage({ request }: JobProps) {
  const pay = usePayment(request.id);
  const payout = pay.bundle ? formatCurrency(pay.providerEarnings) : formatCurrency(request.estimate.total);
  return (
    <>
      <SuccessHero variant="hero" title="Job Completed Successfully!" amountLabel={pay.bundle ? "Your payout (after platform fee)" : "Job total"} amount={payout} />
      <Card>
        <Text variant="bodySmallStrong">Job Summary</Text>
        <InfoRow label="Job ID" value={`#${request.id.slice(-6).toUpperCase()}`} />
        <InfoRow label="Service" value={getServiceTitle(request.category)} />
        <InfoRow label="Completed On" value={formatDateTime(request.completedAt ?? request.updatedAt)} />
        <InfoRow label="Total Amount" value={formatCurrency(pay.bundle ? pay.total : request.estimate.total)} />
        {pay.bundle ? <InfoRow label="Your Earnings" value={payout} strong valueColor="success" /> : null}
      </Card>
      {request.review?.rating ? (
        <Card>
          <Text variant="bodySmallStrong">Customer Review</Text>
          <RatingStars value={request.review.rating} size={tokens.sizes.icon} />
          {request.review.comment ? <Text variant="bodySmall" color="muted">{request.review.comment}</Text> : null}
        </Card>
      ) : null}
      {pay.awaitingCash && pay.payment?.status === "pending" ? (
        <Button title="Confirm cash collected" icon="cash-outline" variant="outline" loading={pay.busy} onPress={pay.confirmCash} />
      ) : null}
      {pay.error ? <Banner tone="danger" message={pay.error} /> : null}
      <Button title="Payment & Invoice" icon="receipt-outline" variant="outline" onPress={() => router.push(providerRoutes.payment(request.id))} />
      <Button title="Back to Dashboard" onPress={() => router.dismissTo(providerRoutes.dashboard)} />
    </>
  );
}

export function CancelledJobStage() {
  return (
    <EmptyState icon="close-circle-outline" title="Job cancelled" message="This job was cancelled and is closed."
      actionLabel="Back to Dashboard" onAction={() => router.dismissTo(providerRoutes.dashboard)} />
  );
}
