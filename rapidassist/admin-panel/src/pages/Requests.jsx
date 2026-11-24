import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, apiErrorMessage } from "../config/api";
import { Drawer } from "../components/Drawer";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  KeyValue,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  Select,
  Skeleton,
  SkeletonRows,
  StatusBadge,
  Tabs
} from "../components/ui";
import { formatCurrency, formatDateTime, serviceTitle, statusLabel, timeAgo } from "../lib/format";
import { useApiResource, useDocumentTitle, useSearchParamInput, useUpdateParams } from "../lib/hooks";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "searching_provider", label: "Searching" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" }
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All services" },
  { value: "car_towing", label: "Car towing" },
  { value: "fuel_delivery", label: "Fuel delivery" },
  { value: "mechanic", label: "Mechanic" }
];

const CLOSED = ["completed", "cancelled"];

function mapsLink(location) {
  if (location?.lat == null || location?.lng == null) return null;
  return `https://www.google.com/maps?q=${location.lat},${location.lng}`;
}

function requestSummary(r) {
  if (r.category === "fuel_delivery" && r.fuelDetails?.fuelType) {
    return `${r.fuelDetails.liters || "?"} L ${r.fuelDetails.fuelType}`;
  }
  if (r.category === "mechanic") return statusLabel(r.mechanicDetails?.issueCategory || r.issueType || "General");
  const v = r.vehicleInfo || {};
  return [v.make, v.model].filter(Boolean).join(" ") || r.issueType || "—";
}

export function Requests() {
  useDocumentTitle("Service requests");
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const updateParams = useUpdateParams(setParams);
  const [search, setSearch] = useSearchParamInput(params, updateParams);

  const status = params.get("status") || "all";
  const category = params.get("category") || "all";
  const page = Number(params.get("page")) || 1;
  const q = params.get("q") || "";
  const selectedId = params.get("id") || "";

  const listQuery = useApiResource("/api/admin/requests", { status, category, search: q || undefined, page, limit: 20 });
  const data = listQuery.data || { requests: [], pagination: null };
  const { loading, error, reload: load } = listQuery;

  const detailQuery = useApiResource(selectedId ? `/api/admin/requests/${selectedId}` : null);
  const detail = detailQuery.data?.request?.id === selectedId ? detailQuery.data.request : null;
  const detailLoading = detailQuery.loading;
  const detailError = detailQuery.error;
  const [cancelOpen, setCancelOpen] = useState(false);

  async function cancelRequest(reason) {
    try {
      await adminApi.patch(`/api/admin/requests/${selectedId}/cancel`, { reason });
      toast.success("Request cancelled");
      setCancelOpen(false);
      detailQuery.reload();
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not cancel request"));
    }
  }

  const closeDrawer = () => updateParams({ id: "" });

  return (
    <div className="page">
      <PageHeader
        title="Service requests"
        subtitle="Track every towing, fuel and mechanic job across the platform."
        actions={
          <Button icon="refresh" loading={loading && data.requests.length > 0} onClick={load}>
            Refresh
          </Button>
        }
      />

      <div className="toolbar">
        <Tabs label="Request status" options={STATUS_TABS} value={status} onChange={(value) => updateParams({ status: value === "all" ? "" : value, page: "" })} />
        <div className="toolbar-right">
          <SearchInput value={search} onChange={setSearch} placeholder="Customer, provider, address, plate…" />
          <Select label="Service" value={category} onChange={(value) => updateParams({ category: value === "all" ? "" : value, page: "" })} options={CATEGORY_OPTIONS} />
        </div>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      <Panel bodyClassName="flush">
        {loading && !data.requests.length ? (
          <div className="pad">
            <SkeletonRows rows={8} />
          </div>
        ) : data.requests.length === 0 ? (
          <EmptyState icon="requests" title="No requests found" text={q || status !== "all" || category !== "all" ? "Try clearing the filters." : "Requests will appear here once customers start using the app."} />
        ) : (
          <div className={`table-wrap ${loading ? "is-loading" : ""}`}>
            <table className="table table-hover table-stack">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th>Provider</th>
                  <th>Pickup</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map((r) => (
                  <tr key={r.id} onClick={() => updateParams({ id: r.id })} className={r.id === selectedId ? "is-selected" : ""}>
                    <td data-label="Request">
                      <button type="button" className="cell-title link-plain" onClick={(e) => { e.stopPropagation(); updateParams({ id: r.id }); }}>
                        {serviceTitle(r.category)}
                      </button>
                      <div className="cell-meta">
                        {requestSummary(r)} · {timeAgo(r.createdAt)}
                      </div>
                    </td>
                    <td data-label="Customer">
                      <div>
                        {r.user?.name || "—"}
                        <div className="cell-meta">{r.user?.phone}</div>
                      </div>
                    </td>
                    <td data-label="Provider">{r.provider ? <div>{r.provider.name}</div> : <span className="muted">Not assigned</span>}</td>
                    <td data-label="Pickup" className="cell-truncate" title={r.pickupLocation?.addressText || ""}>
                      {r.pickupLocation?.addressText || <span className="muted">Pinned location</span>}
                    </td>
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
        <div className="pad-x">
          <Pagination pagination={data.pagination} onPage={(n) => updateParams({ page: n })} />
        </div>
      </Panel>

      <Drawer
        open={Boolean(selectedId)}
        onClose={closeDrawer}
        title={detail ? serviceTitle(detail.category) : "Request"}
        subtitle={detail ? `#${detail.id.slice(-8).toUpperCase()} · ${formatDateTime(detail.createdAt)}` : null}
        footer={
          detail && !CLOSED.includes(detail.status) ? (
            <Button variant="danger-soft" icon="ban" onClick={() => setCancelOpen(true)}>
              Cancel request
            </Button>
          ) : null
        }
      >
        {detailError && !detail ? (
          <ErrorBanner message={detailError} onRetry={detailQuery.reload} />
        ) : detailLoading && !detail ? (
          <div className="stack">
            <Skeleton height={40} />
            <Skeleton height={140} />
            <Skeleton height={200} />
          </div>
        ) : detail ? (
          <RequestDetail request={detail} />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={cancelRequest}
        title="Cancel this request?"
        message="The customer and provider will see the request as cancelled. The assigned provider is freed for new jobs."
        confirmLabel="Cancel request"
        tone="danger"
        reason="required"
        minReason={3}
        reasonLabel="Reason"
        reasonPlaceholder="e.g. Duplicate request / customer called support"
      />
    </div>
  );
}

function RequestDetail({ request: r }) {
  const pickupMap = mapsLink(r.pickupLocation);
  const dropMap = mapsLink(r.destinationLocation);

  return (
    <div className="stack-lg">
      <div className="detail-status">
        <StatusBadge status={r.status} />
        <span className="detail-amount">{formatCurrency(r.estimate?.total)}</span>
      </div>

      <section>
        <h3 className="section-title">People</h3>
        <div className="kv-grid">
          <KeyValue label="Customer">
            {r.user ? (
              <>
                {r.user.name}
                <div className="cell-meta">{r.user.phone}</div>
              </>
            ) : null}
          </KeyValue>
          <KeyValue label="Provider">
            {r.provider ? (
              <>
                {r.provider.name}
                <div className="cell-meta">{r.provider.phone}</div>
              </>
            ) : (
              <span className="muted">Not assigned</span>
            )}
          </KeyValue>
        </div>
      </section>

      <section>
        <h3 className="section-title">Job</h3>
        <div className="kv-grid">
          <KeyValue label="Pickup">
            {r.pickupLocation?.addressText || "Pinned location"}
            {pickupMap ? (
              <a className="link small-link" href={pickupMap} target="_blank" rel="noreferrer">
                Open map <Icon name="external" size={12} />
              </a>
            ) : null}
          </KeyValue>
          {r.destinationLocation ? (
            <KeyValue label="Destination">
              {r.destinationLocation.addressText || "Pinned location"}
              {dropMap ? (
                <a className="link small-link" href={dropMap} target="_blank" rel="noreferrer">
                  Open map <Icon name="external" size={12} />
                </a>
              ) : null}
            </KeyValue>
          ) : null}
          <KeyValue label="Vehicle">
            {[r.vehicleInfo?.make, r.vehicleInfo?.model].filter(Boolean).join(" ") || "—"}
            {r.vehicleInfo?.registrationNumber ? <div className="cell-meta">{r.vehicleInfo.registrationNumber}</div> : null}
          </KeyValue>
          {r.fuelDetails?.fuelType ? <KeyValue label="Fuel">{`${r.fuelDetails.liters || "?"} L ${r.fuelDetails.fuelType}`}</KeyValue> : null}
          {r.mechanicDetails?.issueCategory ? <KeyValue label="Issue">{statusLabel(r.mechanicDetails.issueCategory)}</KeyValue> : null}
          {r.description ? <KeyValue label="Notes">{r.description}</KeyValue> : null}
        </div>
      </section>

      {r.estimate?.lines?.length ? (
        <section>
          <h3 className="section-title">Price breakdown</h3>
          <dl className="price-lines">
            {r.estimate.lines.map((line, i) => (
              <div key={`${line.label}-${i}`}>
                <dt>{line.label}</dt>
                <dd>{formatCurrency(line.amount)}</dd>
              </div>
            ))}
            <div className="price-total">
              <dt>Total</dt>
              <dd>{formatCurrency(r.estimate.total)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {r.review?.rating ? (
        <section>
          <h3 className="section-title">Customer review</h3>
          <div className="review">
            <span className="stars" aria-label={`${r.review.rating} out of 5`}>
              {"★".repeat(r.review.rating)}
              <span className="stars-off">{"★".repeat(5 - r.review.rating)}</span>
            </span>
            {r.review.comment ? <p>{r.review.comment}</p> : null}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="section-title">Timeline</h3>
        {r.statusTimeline?.length ? (
          <ol className="timeline">
            {r.statusTimeline
              .slice()
              .reverse()
              .map((entry, i) => (
                <li key={`${entry.status}-${entry.at}-${i}`} className={i === 0 ? "is-latest" : ""}>
                  <div className="timeline-title">{statusLabel(entry.status)}</div>
                  <div className="timeline-meta">
                    {formatDateTime(entry.at)}
                    {entry.by ? ` · ${entry.by.name} (${entry.by.role === "mechanic" ? "provider" : entry.by.role})` : ""}
                  </div>
                  {entry.note ? <div className="timeline-note">{entry.note}</div> : null}
                </li>
              ))}
          </ol>
        ) : (
          <p className="muted">No status history recorded.</p>
        )}
      </section>
    </div>
  );
}
