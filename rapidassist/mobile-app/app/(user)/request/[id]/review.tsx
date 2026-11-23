import { router, useLocalSearchParams } from "expo-router";
import { Banner, Button, Card, ErrorState, Header, PersonCard, RatingStars, Screen, SkeletonCard, SuccessHero, Text, TextArea } from "../../../../src/design/components";
import { successFeedback } from "../../../../src/design/haptics";
import { customerRoutes } from "../../../../src/navigation/routes";
import { parseRequestId } from "../../../../src/requests/requestId";
import { getServiceTitle } from "../../../../src/requests/serviceCatalog";
import { useCustomerRequest } from "../../../../src/requests/useCustomerRequest";
import { REVIEW_MAX, useReview } from "../../../../src/requests/useReview";

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const state = useCustomerRequest(parseRequestId(id));
  const { request } = state;
  const review = useReview(request, (updated) => { successFeedback(); state.applyRequest(updated); });
  const done = Boolean(request?.review?.rating);
  const canReview = request?.status === "completed" && Boolean(request.providerId);

  return (
    <Screen header={<Header title="Rate Your Experience" />}
      footer={request && canReview && !done ? (
        <Button title="Submit Review" loading={review.submitting} onPress={review.submit} />
      ) : request ? <Button title="Back to Home" onPress={() => router.replace(customerRoutes.home)} /> : null}>
      {!request && state.loadState === "loading" ? <SkeletonCard /> : null}
      {!request && state.loadState !== "loading" ? <ErrorState message={state.loadError} onRetry={state.refresh} /> : null}
      {request?.provider ? (
        <Card><PersonCard name={request.provider.name} rating={request.provider.ratingAvg} subtitle={`Your ${getServiceTitle(request.category).toLowerCase()} provider`} /></Card>
      ) : null}
      {request && done ? <SuccessHero title="Thanks for your feedback!" message="Your review helps other drivers choose great providers." /> : null}
      {request && !done && !canReview ? <Banner tone="warning" message="Reviews open once the job is completed." /> : null}
      {request && canReview && !done ? (
        <>
          <Text variant="headline" align="center">How was your experience?</Text>
          <RatingStars value={review.rating} onChange={review.setRating} />
          <TextArea label="Write a review" optional placeholder="Share your experience..." maxLength={REVIEW_MAX}
            value={review.comment} onChangeText={review.setComment} />
          {review.error ? <Banner tone="danger" message={review.error} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
