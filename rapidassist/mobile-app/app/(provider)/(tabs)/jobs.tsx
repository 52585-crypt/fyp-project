import { EmptyState, ErrorState, Header, Screen, SectionHeader, SkeletonCard } from "../../../src/design/components";
import { useDispatchUpdates } from "../../../src/requests/DispatchProvider";
import { JobCard } from "../../../src/requests/provider/JobCard";
import { useProviderHistory } from "../../../src/requests/provider/useProviderLists";

export default function ProviderJobs() {
  const { activeJob } = useDispatchUpdates();
  const history = useProviderHistory();
  const past = (history.data ?? []).filter((r) => r.id !== activeJob?.id);
  return (
    <Screen edges={["top", "left", "right"]} header={<Header title="My Jobs" back={false} />} refreshing={history.refreshing} onRefresh={history.refresh}>
      {activeJob ? <><SectionHeader title="Active job" badge="Live" /><JobCard request={activeJob} cta="Resume" /></> : null}
      <SectionHeader title="Job history" />
      {history.loading ? <><SkeletonCard lines={1} /><SkeletonCard lines={1} /></> : null}
      {history.error ? <ErrorState message={history.error} onRetry={history.refresh} /> : null}
      {history.data && past.length === 0 ? <EmptyState icon="briefcase-outline" title="No jobs yet" message="Accepted jobs will appear here." /> : null}
      {past.map((r) => <JobCard key={r.id} request={r} />)}
    </Screen>
  );
}
