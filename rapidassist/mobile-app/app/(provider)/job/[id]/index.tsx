import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Banner, ErrorState, Header, Screen, SkeletonCard } from "../../../../src/design/components";
import { providerRoutes } from "../../../../src/navigation/routes";
import { ArrivedStage, AwaitingApprovalStage, InspectionStage, JobDetailsStage, OnTheWayStage } from "../../../../src/requests/provider/ActiveStages";
import { AwaitingCustomerStage, CancelledJobStage, InProgressStage, JobCompletedStage, PaymentCompletionStage } from "../../../../src/requests/provider/ClosingStages";
import type { JobProps } from "../../../../src/requests/provider/shared";
import { useProviderJob } from "../../../../src/requests/provider/useProviderJob";
import { parseRequestId } from "../../../../src/requests/requestId";
import type { ProviderStage } from "../../../../src/requests/stages";

const titles: Record<ProviderStage, string> = {
  incoming: "New Request", job_details: "Job Details", on_the_way: "On The Way", arrived: "Arrived at Location",
  inspection: "Inspection & Extra Work", awaiting_approval: "Awaiting Approval", in_progress: "Job In Progress",
  payment_completion: "Payment & Completion", awaiting_customer: "Awaiting Confirmation", job_completed: "Job Completed", cancelled: "Job Cancelled"
};

/** Stage-driven active job. What renders is decided only by getProviderStage(). */
export default function ProviderJob() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const job = useProviderJob(parseRequestId(id));
  const { request, stage } = job;
  if (request && stage === "incoming") return <Redirect href={providerRoutes.incoming(request.id)} />;

  return (
    <Screen header={<Header title={stage ? titles[stage] : "Job"} back={() => router.dismissTo(providerRoutes.dashboard)} />}>
      {job.error ? <Banner tone="danger" message={job.error} /> : null}
      {!request && !job.loadError ? <><SkeletonCard /><SkeletonCard lines={4} /></> : null}
      {!request && job.loadError ? <ErrorState title="Job unavailable" message={job.loadError} onRetry={job.reload} /> : null}
      {request && stage ? <Stage stage={stage} job={job} request={request} /> : null}
    </Screen>
  );
}

function Stage({ stage, ...props }: { stage: ProviderStage } & JobProps) {
  switch (stage) {
    case "job_details": return <JobDetailsStage {...props} />;
    case "on_the_way": return <OnTheWayStage {...props} />;
    case "arrived": return <ArrivedStage {...props} />;
    case "inspection": return <InspectionStage {...props} />;
    case "awaiting_approval": return <AwaitingApprovalStage {...props} />;
    case "in_progress": return <InProgressStage {...props} />;
    case "payment_completion": return <PaymentCompletionStage {...props} />;
    case "awaiting_customer": return <AwaitingCustomerStage {...props} />;
    case "job_completed": return <JobCompletedStage {...props} />;
    case "cancelled": return <CancelledJobStage />;
    case "incoming": return null;
  }
}
