import { StyleSheet, View } from "react-native";
import { EmptyState, ErrorState, Header, HeroCard, Screen, SectionHeader, SkeletonCard, StatTile, Text } from "../../../src/design/components";
import { tokens } from "../../../src/design/tokens";
import { JobCard } from "../../../src/requests/provider/JobCard";
import { useProviderEarnings } from "../../../src/requests/provider/useProviderLists";
import { formatCurrency } from "../../../src/utils/format";

export default function ProviderEarnings() {
  const e = useProviderEarnings();
  const data = e.data;
  return (
    <Screen edges={["top", "left", "right"]} header={<Header title="Earnings" back={false} />} refreshing={e.refreshing} onRefresh={e.refresh}>
      {e.loading ? <SkeletonCard lines={2} /> : null}
      {e.error && !data ? <ErrorState message={e.error} onRetry={e.refresh} /> : null}
      {data ? (
        <>
          <HeroCard title={formatCurrency(data.total)} subtitle={`Total earnings • ${data.completedJobs} completed jobs`} art="wallet" />
          <View style={styles.row}>
            <StatTile icon="today-outline" label="Today" value={formatCurrency(data.today)} />
            <StatTile icon="calendar-outline" label="This week" value={formatCurrency(data.week)} />
          </View>
          <Text variant="caption" color="muted">Wallet and payouts are coming soon. Cash jobs are settled directly with customers.</Text>
          <SectionHeader title="Recent jobs" />
          {data.recent.length ? data.recent.map((r) => <JobCard key={r.id} request={r} />) : (
            <EmptyState icon="cash-outline" title="No earnings yet" message="Completed jobs will show here." />
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: tokens.space.sm } });
