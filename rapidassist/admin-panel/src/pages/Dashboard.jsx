import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { BreakdownBar, TrendChart } from "../components/TrendChart";
import { Avatar, Button, EmptyState, ErrorBanner, PageHeader, Panel, Skeleton, SkeletonRows, StatusBadge } from "../components/ui";
import { formatCurrency, formatNumber, percent, serviceTitle, statusLabel, timeAgo } from "../lib/format";
import { useApiResource, useDocumentTitle } from "../lib/hooks";

const REFRESH_MS = 30000;

export function Dashboard() {
  useDocumentTitle("Dashboard");
  const { data, loading, error, reload: load } = useApiResource("/api/admin/dashboard");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [seen, setSeen] = useState(null);

  // Track when fresh data arrives (adjusting state during render, not in an effect).
  if (data && data !== seen) {
    setSeen(data);
    setLastUpdated(new Date());
  }

  useEffect(() => {
    // Only auto-refresh while the tab is visible.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const stats = data?.stats || {};
  const byCategory = data?.breakdowns?.byCategory || {};
  const byStatus = data?.breakdowns?.byStatus || {};
  const totalRequests = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  const completionRate = percent(stats.completedRequests || 0, (stats.completedRequests || 0) + (stats.cancelledRequests || 0));
  const averageJob = stats.completedRequests ? (stats.revenue || 0) / stats.completedRequests : 0;
  const initialLoad = loading && !data;

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle={lastUpdated ? `Live overview · updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Live overview of RapidAssist operations"}
        actions={
          <Button icon="refresh" loading={loading && !!data} onClick={load}>
            Refresh
          </Button>
        }
      />

      <ErrorBanner message={error} onRetry={load} />

      {stats.pendingProviders > 0 ? (
        <div className="banner banner-warning">
          <Icon name="shield" />
          <span className="banner-text">
            <strong>{stats.pendingProviders} provider{stats.pendingProviders > 1 ? "s" : ""}</strong> waiting for document review.
          </span>
          <Link to="/providers" className="btn btn-sm btn-warning">
            Review now
          </Link>
        </div>
      ) : null}

      <div className="kpi-grid">
        <Kpi icon="activity" label="Active requests" value={formatNumber(stats.activeRequests)} hint={`${formatNumber(stats.todayRequests)} new today`} to="/requests?status=active" loading={initialLoad} />
        <Kpi icon="shield" label="Pending verification" value={formatNumber(stats.pendingProviders)} hint={`${formatNumber(stats.providers)} providers total`} to="/providers" tone={stats.pendingProviders ? "warning" : undefined} loading={initialLoad} />
        <Kpi icon="wallet" label="Revenue (completed)" value={formatCurrency(stats.revenue)} hint={`${formatCurrency(averageJob)} avg. job`} loading={initialLoad} />
        <Kpi icon="star" label="Average rating" value={stats.averageRating ? `${Number(stats.averageRating).toFixed(1)} / 5` : "—"} hint={`${formatNumber(stats.reviewedRequests)} reviews`} loading={initialLoad} />
      </div>

      <div className="grid-2-1">
        <Panel title="Requests, last 7 days" subtitle="New service requests per day">
          {data?.trend ? <TrendChart data={data.trend} /> : <Skeleton height={200} />}
        </Panel>

        <Panel title="Platform">
          <div className="mini-stats">
            <MiniStat label="Customers" value={stats.users} to="/users?role=user" />
            <MiniStat label="Providers" value={stats.providers} to="/users?role=mechanic" />
            <MiniStat label="Online now" value={stats.onlineProviders} />
            <MiniStat label="Vehicles" value={stats.vehicles} />
            <MiniStat label="Completed" value={stats.completedRequests} to="/requests?status=completed" />
            <MiniStat label="Cancelled" value={stats.cancelledRequests} to="/requests?status=cancelled" />
            <MiniStat label="Suspended" value={stats.blockedAccounts} to="/users?status=blocked" />
            <MiniStat label="Completion rate" value={`${completionRate}%`} raw />
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Requests by service">
          {totalRequests === 0 && !initialLoad ? (
            <EmptyState icon="requests" title="No requests yet" />
          ) : (
            <div className="stack">
              {Object.entries(byCategory).map(([key, value]) => (
                <BreakdownBar key={key} label={serviceTitle(key)} value={value} total={totalRequests} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Requests by status">
          {totalRequests === 0 && !initialLoad ? (
            <EmptyState icon="requests" title="No requests yet" />
          ) : (
            <div className="stack">
              {Object.entries(byStatus)
                .filter(([, value]) => value > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([key, value]) => (
                  <BreakdownBar key={key} label={statusLabel(key)} value={value} total={totalRequests} />
                ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid-1-2">
        <Panel title="Verification queue" action={<Link to="/providers" className="link">View all</Link>}>
          {initialLoad ? (
            <SkeletonRows rows={3} />
          ) : (data?.pendingProvidersList || []).length === 0 ? (
            <EmptyState icon="check" title="All caught up" text="No providers are waiting for review." />
          ) : (
            <ul className="list">
              {data.pendingProvidersList.map((provider) => (
                <li key={provider.id}>
                  <Link to={`/providers?id=${provider.id}`} className="list-row">
                    <Avatar name={provider.name} />
                    <div className="list-main">
                      <div className="list-title">{provider.name}</div>
                      <div className="list-meta">
                        {serviceTitle(provider.mechanicProfile?.serviceCategory)} · joined {timeAgo(provider.createdAt)}
                      </div>
                    </div>
                    <Icon name="chevronRight" className="muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent requests" action={<Link to="/requests" className="link">View all</Link>} bodyClassName="flush">
          {initialLoad ? (
            <div className="pad">
              <SkeletonRows rows={4} />
            </div>
          ) : (data?.recentRequests || []).length === 0 ? (
            <EmptyState icon="requests" title="No requests yet" />
          ) : (
            <div className="table-wrap">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Customer</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentRequests.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Service">
                        <Link to={`/requests?id=${r.id}`} className="cell-title link-plain">
                          {serviceTitle(r.category)}
                        </Link>
                        <div className="cell-meta">{timeAgo(r.createdAt)}</div>
                      </td>
                      <td data-label="Customer">{r.user?.name || "—"}</td>
                      <td data-label="Provider">{r.provider?.name || <span className="muted">Not assigned</span>}</td>
                      <td data-label="Status">
                        <StatusBadge status={r.status} />
                      </td>
                      <td data-label="Amount" className="num">{formatCurrency(r.estimate?.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, hint, to, tone, loading }) {
  const body = (
    <>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-icon ${tone ? `kpi-icon-${tone}` : ""}`}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      {loading ? <Skeleton height={30} width="60%" /> : <div className="kpi-value">{value}</div>}
      <div className="kpi-hint">{hint}</div>
    </>
  );
  return to ? (
    <Link to={to} className={`kpi kpi-link ${tone ? `kpi-${tone}` : ""}`}>
      {body}
    </Link>
  ) : (
    <div className="kpi">{body}</div>
  );
}

function MiniStat({ label, value, to, raw }) {
  const content = (
    <>
      <div className="mini-value">{raw ? value : formatNumber(value)}</div>
      <div className="mini-label">{label}</div>
    </>
  );
  return to ? (
    <Link to={to} className="mini mini-link">
      {content}
    </Link>
  ) : (
    <div className="mini">{content}</div>
  );
}
