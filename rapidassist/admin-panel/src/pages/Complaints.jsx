import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi, apiErrorMessage } from "../config/api";
import { useAuth } from "../auth/AuthContext";
import { Drawer } from "../components/Drawer";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import {
  Badge,
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
import { COMPLAINT_CATEGORY_LABELS, formatCurrency, formatDateTime, serviceTitle, timeAgo } from "../lib/format";
import { useApiResource, useDocumentTitle, useSearchParamInput, useUpdateParams } from "../lib/hooks";


const STATUS_TABS = [
  { value: "active", label: "Needs action" },
  { value: "open", label: "New" },
  { value: "in_review", label: "In review" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" }
];

const CATEGORY_OPTIONS = [{ value: "all", label: "All categories" }].concat(
  Object.entries(COMPLAINT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))
);

const PRIORITY_OPTIONS = [
  { value: "all", label: "Any priority" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" }
];

const STATUS_LABELS = { open: "New", in_review: "In review", resolved: "Resolved", dismissed: "Dismissed" };
const STATUS_TONES = { open: "warning", in_review: "info", resolved: "success", dismissed: "neutral" };

function ComplaintStatus({ status }) {
  return (
    <Badge tone={STATUS_TONES[status] || "neutral"} dot>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

function PriorityBadge({ priority }) {
  if (priority === "high") return <Badge tone="danger">High</Badge>;
  if (priority === "low") return <Badge tone="neutral">Low</Badge>;
  return <span className="muted">Normal</span>;
}

function roleLabel(role) {
  return role === "mechanic" ? "Provider" : role === "admin" ? "Admin" : "Customer";
}

export function Complaints() {
  useDocumentTitle("Complaints");
  const [params, setParams] = useSearchParams();
  const updateParams = useUpdateParams(setParams);
  const [search, setSearch] = useSearchParamInput(params, updateParams);

  const status = params.get("status") || "active";
  const category = params.get("category") || "all";
  const priority = params.get("priority") || "all";
  const page = Number(params.get("page")) || 1;
  const q = params.get("q") || "";
  const selectedId = params.get("id") || "";

  const listQuery = useApiResource("/api/admin/complaints", { status, category, priority, search: q || undefined, page, limit: 20 });
  const data = listQuery.data || { complaints: [], counts: {}, pagination: null };
  const tabs = STATUS_TABS.map((tab) => ({ ...tab, count: data.counts?.[tab.value] }));

  return (
    <div className="page">
      <PageHeader
        title="Complaints"
        subtitle="Problems reported by customers and providers. High priority and oldest first."
        actions={
          <Button icon="refresh" loading={listQuery.loading && data.complaints.length > 0} onClick={listQuery.reload}>
            Refresh
          </Button>
        }
      />

      <div className="toolbar">
        <Tabs label="Complaint status" options={tabs} value={status} onChange={(value) => updateParams({ status: value === "active" ? "" : value, page: "" })} />
        <div className="toolbar-right">
          <SearchInput value={search} onChange={setSearch} placeholder="Name, phone or text" />
          <Select label="Category" value={category} onChange={(value) => updateParams({ category: value === "all" ? "" : value, page: "" })} options={CATEGORY_OPTIONS} />
          <Select label="Priority" value={priority} onChange={(value) => updateParams({ priority: value === "all" ? "" : value, page: "" })} options={PRIORITY_OPTIONS} />
        </div>
      </div>

      <ErrorBanner message={listQuery.error} onRetry={listQuery.reload} />

      <Panel bodyClassName="flush">
        {listQuery.loading && !data.complaints.length ? (
          <div className="pad">
            <SkeletonRows rows={6} />
          </div>
        ) : data.complaints.length === 0 ? (
          <EmptyState
            icon={status === "active" ? "check" : "flag"}
            title={status === "active" && !q ? "No complaints need action" : "No complaints found"}
            text={status === "active" && !q ? "New complaints from the app will show up here." : "Try a different filter."}
          />
        ) : (
          <div className={`table-wrap ${listQuery.loading ? "is-loading" : ""}`}>
            <table className="table table-hover table-stack">
              <thead>
                <tr>
                  <th>Complaint</th>
                  <th>Raised by</th>
                  <th>Against</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned</th>
                </tr>
              </thead>
              <tbody>
                {data.complaints.map((c) => (
                  <tr key={c.id} onClick={() => updateParams({ id: c.id })} className={c.id === selectedId ? "is-selected" : ""}>
                    <td data-label="Complaint">
                      <div>
                        <button type="button" className="cell-title link-plain" onClick={(e) => { e.stopPropagation(); updateParams({ id: c.id }); }}>
                          {COMPLAINT_CATEGORY_LABELS[c.category] || c.category}
                        </button>
                        <div className="cell-meta cell-clamp">{c.description}</div>
                        <div className="cell-meta">{timeAgo(c.createdAt)}</div>
                      </div>
                    </td>
                    <td data-label="Raised by">
                      <div>
                        {c.raisedBy?.name || "—"}
                        <div className="cell-meta">{roleLabel(c.raisedBy?.role)}</div>
                      </div>
                    </td>
                    <td data-label="Against">{c.against ? c.against.name : <span className="muted">—</span>}</td>
                    <td data-label="Priority">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td data-label="Status">
                      <ComplaintStatus status={c.status} />
                    </td>
                    <td data-label="Assigned">{c.assignedTo ? c.assignedTo.name : <span className="muted">Unassigned</span>}</td>
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

      <ComplaintDrawer id={selectedId} onClose={() => updateParams({ id: "" })} onChanged={listQuery.reload} />
    </div>
  );
}

function ComplaintDrawer({ id, onClose, onChanged }) {
  const toast = useToast();
  const { admin } = useAuth();
  const detailQuery = useApiResource(id ? `/api/admin/complaints/${id}` : null);
  const [override, setOverride] = useState(null); // fresh copy returned by a mutation
  const loaded = detailQuery.data?.complaint?.id === id ? detailQuery.data.complaint : null;
  const complaint = override?.id === id && (!loaded || override.updatedAt >= loaded.updatedAt) ? override : loaded;

  const [closing, setClosing] = useState(null); // "resolved" | "dismissed"
  const [busy, setBusy] = useState(false);

  async function mutate(request, successMessage) {
    setBusy(true);
    try {
      const res = await request();
      setOverride(res.data.complaint);
      if (successMessage) toast.success(successMessage);
      onChanged();
      return true;
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update complaint"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const patch = (body, message) => mutate(() => adminApi.patch(`/api/admin/complaints/${id}`, body), message);
  const isClosed = complaint && (complaint.status === "resolved" || complaint.status === "dismissed");

  return (
    <>
      <Drawer
        open={Boolean(id)}
        onClose={onClose}
        title={complaint ? COMPLAINT_CATEGORY_LABELS[complaint.category] || complaint.category : "Complaint"}
        subtitle={complaint ? `#${complaint.id.slice(-8).toUpperCase()} · ${formatDateTime(complaint.createdAt)}` : null}
        footer={
          complaint ? (
            isClosed ? (
              <Button icon="refresh" loading={busy} onClick={() => patch({ status: "in_review" }, "Complaint reopened")}>
                Reopen
              </Button>
            ) : (
              <>
                <Button variant="ghost" disabled={busy} onClick={() => setClosing("dismissed")}>
                  Dismiss
                </Button>
                {complaint.status === "open" ? (
                  <Button disabled={busy} onClick={() => patch({ status: "in_review" }, "Marked as in review")}>
                    Start review
                  </Button>
                ) : null}
                <Button variant="primary" icon="check" disabled={busy} onClick={() => setClosing("resolved")}>
                  Resolve
                </Button>
              </>
            )
          ) : null
        }
      >
        {detailQuery.error && !complaint ? (
          <ErrorBanner message={detailQuery.error} onRetry={detailQuery.reload} />
        ) : !complaint ? (
          <div className="stack">
            <Skeleton height={40} />
            <Skeleton height={120} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div className="stack-lg">
            <div className="detail-status">
              <ComplaintStatus status={complaint.status} />
              <div className="inline-controls">
                <Select
                  label="Priority"
                  value={complaint.priority}
                  onChange={(value) => patch({ priority: value }, `Priority set to ${value}`)}
                  options={PRIORITY_OPTIONS.slice(1).map((o) => ({ ...o, label: `${o.label} priority` }))}
                />
              </div>
            </div>

            <section>
              <h3 className="section-title">What happened</h3>
              <blockquote className="quote">{complaint.description}</blockquote>
            </section>

            <section>
              <h3 className="section-title">People</h3>
              <div className="kv-grid">
                <KeyValue label={`Raised by (${roleLabel(complaint.raisedBy?.role).toLowerCase()})`}>
                  {complaint.raisedBy ? (
                    <>
                      {complaint.raisedBy.name}
                      <div className="cell-meta">{complaint.raisedBy.phone}</div>
                    </>
                  ) : null}
                </KeyValue>
                <KeyValue label="Against">
                  {complaint.against ? (
                    <>
                      {complaint.against.name}
                      <div className="cell-meta">
                        {roleLabel(complaint.against.role)} · {complaint.againstStats?.complaintsCount || 0} complaint
                        {complaint.againstStats?.complaintsCount === 1 ? "" : "s"} total
                      </div>
                      {complaint.againstStats?.isBlocked ? (
                        <Badge tone="danger">Suspended</Badge>
                      ) : (
                        <Link className="link small-link" to={`/users?q=${encodeURIComponent(complaint.against.phone)}`}>
                          Review account <Icon name="chevronRight" size={12} />
                        </Link>
                      )}
                    </>
                  ) : (
                    <span className="muted">Not linked to a person</span>
                  )}
                </KeyValue>
                <KeyValue label="Assigned to">
                  {complaint.assignedTo ? (
                    complaint.assignedTo.name
                  ) : (
                    <span className="muted">Nobody</span>
                  )}
                  {!isClosed && complaint.assignedTo?.id !== admin?.id ? (
                    <button type="button" className="link small-link link-plain" disabled={busy} onClick={() => patch({ assign: "me" }, "Assigned to you")}>
                      Assign to me
                    </button>
                  ) : null}
                </KeyValue>
              </div>
            </section>

            {complaint.request ? (
              <section>
                <h3 className="section-title">Related request</h3>
                <Link to={`/requests?id=${complaint.request.id}`} className="linked-card">
                  <div>
                    <div className="cell-title">{serviceTitle(complaint.request.category)}</div>
                    <div className="cell-meta">
                      {complaint.request.pickupAddress || "Pinned location"} · {formatDateTime(complaint.request.createdAt)}
                    </div>
                  </div>
                  <div className="linked-card-right">
                    <StatusBadge status={complaint.request.status} />
                    <span className="cell-meta">{formatCurrency(complaint.request.total)}</span>
                  </div>
                </Link>
              </section>
            ) : null}

            {isClosed ? (
              <div className={`banner banner-${complaint.status === "resolved" ? "info" : "warning"} banner-compact`}>
                <Icon name="info" />
                <span className="banner-text">
                  {STATUS_LABELS[complaint.status]} by {complaint.resolvedBy?.name || "an admin"} · {timeAgo(complaint.resolvedAt)}
                  {complaint.resolution ? <em className="banner-note">“{complaint.resolution}”</em> : null}
                </span>
              </div>
            ) : null}

            <section>
              <h3 className="section-title">Activity</h3>
              <Thread updates={complaint.updates} />
              {!isClosed ? (
                <NoteComposer
                  key={complaint.id}
                  busy={busy}
                  onSend={(text, internal) =>
                    mutate(
                      () => adminApi.post(`/api/admin/complaints/${id}/notes`, { text, internal }),
                      internal ? "Note added" : "Reply sent to the customer"
                    )
                  }
                />
              ) : null}
            </section>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(closing)}
        onClose={() => setClosing(null)}
        onConfirm={async (resolution) => {
          const ok = await patch({ status: closing, resolution }, closing === "resolved" ? "Complaint resolved" : "Complaint dismissed");
          if (ok) setClosing(null);
        }}
        title={closing === "resolved" ? "Resolve complaint" : "Dismiss complaint"}
        message={
          closing === "resolved"
            ? "Explain what was done. The person who reported it will see this message."
            : "Explain why no action is needed. The person who reported it will see this message."
        }
        confirmLabel={closing === "resolved" ? "Resolve" : "Dismiss"}
        tone={closing === "resolved" ? "primary" : "danger"}
        reason="required"
        reasonLabel="Message to the customer"
        reasonPlaceholder={
          closing === "resolved"
            ? "e.g. We refunded PKR 500 and warned the provider."
            : "e.g. The extra charge was for an approved part replacement."
        }
      />
    </>
  );
}

function Thread({ updates }) {
  if (!updates?.length) return <p className="muted">No activity yet.</p>;
  return (
    <ol className="timeline thread">
      {updates
        .slice()
        .reverse()
        .map((u, i) => (
          <li key={`${u.at}-${i}`} className={`${i === 0 ? "is-latest" : ""} ${u.internal ? "is-internal" : ""}`}>
            <div className="timeline-title">
              {u.type === "status" ? `Status → ${STATUS_LABELS[u.status] || u.status}` : u.type === "reply" ? "Reply to customer" : "Internal note"}
              {u.internal ? <Badge tone="neutral">Only admins</Badge> : null}
            </div>
            <div className="timeline-meta">
              {formatDateTime(u.at)}
              {u.by ? ` · ${u.by.name}` : ""}
            </div>
            {u.text ? <div className="timeline-note">{u.text}</div> : null}
          </li>
        ))}
    </ol>
  );
}

function NoteComposer({ onSend, busy }) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(true);

  async function submit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    const ok = await onSend(trimmed, internal);
    if (ok) setText("");
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-mode" role="radiogroup" aria-label="Message type">
        <button type="button" role="radio" aria-checked={internal} className={`chip ${internal ? "is-active" : ""}`} onClick={() => setInternal(true)}>
          <Icon name="lock" size={14} /> Internal note
        </button>
        <button type="button" role="radio" aria-checked={!internal} className={`chip ${!internal ? "is-active" : ""}`} onClick={() => setInternal(false)}>
          <Icon name="message" size={14} /> Reply to customer
        </button>
      </div>
      <textarea
        className="input textarea"
        rows={3}
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        placeholder={internal ? "Only admins will see this note" : "The customer will see this in the app"}
      />
      <div className="composer-actions">
        <span className="field-hint">{internal ? "Visible to admins only." : "Sending a reply moves a new complaint to “In review”."}</span>
        <Button type="submit" variant={internal ? "secondary" : "primary"} size="sm" loading={busy} disabled={text.trim().length < 2}>
          {internal ? "Add note" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
