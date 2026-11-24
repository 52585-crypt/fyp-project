import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, apiErrorMessage } from "../config/api";
import { Icon } from "../components/Icon";
import { Lightbox } from "../components/Lightbox";
import { useToast } from "../components/Toast";
import {
  Avatar,
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
import { formatCurrency, formatDateTime, serviceTitle, statusLabel, timeAgo } from "../lib/format";
import { useApiResource, useDocumentTitle, useSearchParamInput, useUpdateParams } from "../lib/hooks";

const STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" }
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All services" },
  { value: "mechanic", label: "Mechanic" },
  { value: "towing", label: "Towing" },
  { value: "fuel_delivery", label: "Fuel delivery" }
];

function providerDocs(provider) {
  const profile = provider?.mechanicProfile || {};
  const docs = [
    { label: "Live selfie", src: profile.selfieUrl },
    { label: "CNIC front", src: profile.idCardFrontUrl },
    { label: "CNIC back", src: profile.idCardBackUrl }
  ];
  if (profile.serviceCategory === "mechanic") {
    docs.push({ label: "Workshop photo", src: profile.workshopPhotoUrl }, { label: "Certificate", src: profile.certificateUrl });
  } else {
    docs.push({ label: "Driving licence", src: profile.drivingLicenseUrl });
  }
  return docs;
}

function identityTone(status) {
  if (status === "matched") return "success";
  if (status === "mismatch") return "danger";
  if (status === "manual_review") return "warning";
  return "neutral";
}

export function ProviderVerification() {
  useDocumentTitle("Provider verification");
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "pending";
  const category = params.get("category") || "";
  const page = Number(params.get("page")) || 1;
  const selectedId = params.get("id") || "";

  const [dialog, setDialog] = useState(null); // "verified" | "rejected" | "pending"
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const detailRef = useRef(null);

  const updateParams = useUpdateParams(setParams);
  const [search, setSearch] = useSearchParamInput(params, updateParams);
  const q = params.get("q") || "";

  const listQuery = useApiResource("/api/admin/providers", {
    status,
    category: category || undefined,
    search: q || undefined,
    page,
    limit: 15
  });
  const list = listQuery.data || { providers: [], counts: {}, pagination: null };
  const listLoading = listQuery.loading;
  const listError = listQuery.error;
  const loadList = listQuery.reload;

  // On desktop, show the first provider when nothing is picked so the detail pane is never blank.
  const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const activeId = selectedId || (isDesktop ? list.providers[0]?.id || "" : "");

  const detailQuery = useApiResource(activeId ? `/api/admin/providers/${activeId}` : null);
  // Ignore a stale detail payload while the next provider is loading.
  const detail = detailQuery.data?.provider?.id === activeId ? detailQuery.data : null;
  const detailLoading = detailQuery.loading;
  const detailError = detailQuery.error;

  function selectProvider(id) {
    updateParams({ id });
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }

  async function submitDecision(nextStatus, note) {
    const provider = detail?.provider;
    if (!provider) return;
    try {
      await adminApi.patch(`/api/admin/providers/${provider.id}/verification`, { status: nextStatus, note });
      toast.success(
        nextStatus === "verified"
          ? `${provider.name} is now verified`
          : nextStatus === "rejected"
            ? `${provider.name} was rejected`
            : `${provider.name} moved back to pending`
      );
      setDialog(null);

      // Advance to the next provider in the queue when the current one leaves this filter.
      const leavesFilter = status !== "all" && nextStatus !== status;
      if (leavesFilter) {
        const index = list.providers.findIndex((p) => p.id === provider.id);
        const next = list.providers[index + 1] || list.providers[index - 1];
        updateParams({ id: next ? next.id : "" });
      } else {
        detailQuery.reload();
      }
      loadList();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update provider"));
    }
  }

  const tabs = STATUS_TABS.map((tab) => ({ ...tab, count: list.counts?.[tab.value] }));
  const provider = detail?.provider;
  const docs = provider ? providerDocs(provider) : [];
  const viewableDocs = docs.filter((d) => d.src);

  return (
    <div className="page">
      <PageHeader title="Provider verification" subtitle="Check identity documents before a provider can take jobs." />

      <div className="toolbar">
        <Tabs label="Verification status" options={tabs} value={status} onChange={(value) => updateParams({ status: value, page: "", id: "" })} />
        <div className="toolbar-right">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or phone" />
          <Select label="Service" value={category} onChange={(value) => updateParams({ category: value, page: "", id: "" })} options={CATEGORY_OPTIONS} />
        </div>
      </div>

      <ErrorBanner message={listError} onRetry={loadList} />

      <div className="split">
        <Panel className="split-list" bodyClassName="flush">
          {listLoading && !list.providers.length ? (
            <div className="pad">
              <SkeletonRows rows={6} />
            </div>
          ) : list.providers.length === 0 ? (
            <EmptyState
              icon={status === "pending" ? "check" : "users"}
              title={status === "pending" && !q ? "Queue is empty" : "No providers found"}
              text={status === "pending" && !q ? "Every provider has been reviewed." : "Try a different filter or search."}
            />
          ) : (
            <ul className={`list selectable ${listLoading ? "is-loading" : ""}`}>
              {list.providers.map((p) => (
                <li key={p.id}>
                  <button type="button" className={`list-row ${p.id === activeId ? "is-selected" : ""}`} onClick={() => selectProvider(p.id)} aria-current={p.id === activeId}>
                    <Avatar name={p.name} />
                    <div className="list-main">
                      <div className="list-title">
                        {p.name}
                        {p.isBlocked ? <Badge tone="danger">Suspended</Badge> : null}
                      </div>
                      <div className="list-meta">
                        {serviceTitle(p.mechanicProfile?.serviceCategory)} · {timeAgo(p.createdAt)}
                      </div>
                    </div>
                    <StatusBadge status={p.verificationStatus} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="pad-x">
            <Pagination pagination={list.pagination} onPage={(n) => updateParams({ page: n })} />
          </div>
        </Panel>

        <div className="split-detail" ref={detailRef}>
          {!activeId ? (
            <Panel>
              <EmptyState icon="shield" title="Select a provider" text="Pick someone from the list to review their documents." />
            </Panel>
          ) : detailError ? (
            <ErrorBanner message={detailError} onRetry={detailQuery.reload} />
          ) : detailLoading && !provider ? (
            <Panel>
              <div className="stack">
                <Skeleton height={48} />
                <Skeleton height={120} />
                <Skeleton height={180} />
              </div>
            </Panel>
          ) : provider ? (
            <Panel className={detailLoading ? "is-loading" : ""}>
              <div className="detail-head">
                <Avatar name={provider.name} src={provider.mechanicProfile?.selfieUrl} size={56} />
                <div className="detail-head-main">
                  <h2 className="detail-name">{provider.name}</h2>
                  <div className="detail-meta">
                    <span><Icon name="phone" size={14} /> {provider.phone}</span>
                    <span>{serviceTitle(provider.mechanicProfile?.serviceCategory)}</span>
                    <span>Joined {formatDateTime(provider.createdAt)}</span>
                  </div>
                </div>
                <StatusBadge status={provider.verificationStatus} />
              </div>

              <div className="decision-bar">
                {provider.verificationStatus !== "verified" ? (
                  <Button variant="primary" icon="check" onClick={() => setDialog("verified")}>
                    Approve
                  </Button>
                ) : null}
                {provider.verificationStatus !== "rejected" ? (
                  <Button variant="danger-soft" icon="x" onClick={() => setDialog("rejected")}>
                    Reject
                  </Button>
                ) : null}
                {provider.verificationStatus !== "pending" ? (
                  <Button variant="ghost" icon="refresh" onClick={() => setDialog("pending")}>
                    Move to pending
                  </Button>
                ) : null}
              </div>

              {provider.verificationReview?.reviewedAt ? (
                <div className={`banner banner-${provider.verificationStatus === "rejected" ? "danger" : "info"} banner-compact`}>
                  <Icon name="info" />
                  <span className="banner-text">
                    {statusLabel(provider.verificationStatus)} by {provider.verificationReview.reviewedBy?.name || "an admin"} · {timeAgo(provider.verificationReview.reviewedAt)}
                    {provider.verificationReview.note ? <em className="banner-note">“{provider.verificationReview.note}”</em> : null}
                  </span>
                </div>
              ) : null}

              <h3 className="section-title">Documents</h3>
              <div className="doc-grid">
                {docs.map((doc) => {
                  const viewIndex = viewableDocs.indexOf(doc);
                  return (
                    <figure key={doc.label} className="doc">
                      {doc.src ? (
                        <button type="button" className="doc-thumb" onClick={() => setLightboxIndex(viewIndex)} aria-label={`View ${doc.label}`}>
                          <img src={doc.src} alt="" loading="lazy" />
                          <span className="doc-zoom">
                            <Icon name="zoom" size={16} />
                          </span>
                        </button>
                      ) : (
                        <div className="doc-thumb doc-missing">
                          <Icon name="image" size={22} />
                          <span>Not uploaded</span>
                        </div>
                      )}
                      <figcaption>{doc.label}</figcaption>
                    </figure>
                  );
                })}
              </div>

              <h3 className="section-title">Checks</h3>
              <div className="kv-grid">
                <KeyValue label="Face match">
                  <Badge tone={identityTone(provider.mechanicProfile?.identityMatch?.status)}>
                    {statusLabel(provider.mechanicProfile?.identityMatch?.status || "pending")}
                    {provider.mechanicProfile?.identityMatch?.score != null ? ` · ${Math.round(provider.mechanicProfile.identityMatch.score * 100)}%` : ""}
                  </Badge>
                </KeyValue>
                <KeyValue label="Live location">{provider.mechanicProfile?.liveLocation?.addressText || "Not captured"}</KeyValue>
                <KeyValue label="Rating">{provider.ratingCount ? `${Number(provider.ratingAvg).toFixed(1)} (${provider.ratingCount})` : "No ratings"}</KeyValue>
                <KeyValue label="Completed jobs">{provider.completedJobs || 0}</KeyValue>
                <KeyValue label="Online">{provider.providerState?.isOnline ? "Yes" : "No"}</KeyValue>
                <KeyValue label="Last seen">{provider.providerState?.lastSeenAt ? timeAgo(provider.providerState.lastSeenAt) : "—"}</KeyValue>
              </div>

              {detail.recentJobs?.length ? (
                <>
                  <h3 className="section-title">Recent jobs</h3>
                  <ul className="list compact">
                    {detail.recentJobs.map((job) => (
                      <li key={job.id} className="list-row static">
                        <div className="list-main">
                          <div className="list-title">{serviceTitle(job.category)}</div>
                          <div className="list-meta">{formatDateTime(job.createdAt)}</div>
                        </div>
                        <span className="muted">{formatCurrency(job.total)}</span>
                        <StatusBadge status={job.status} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>

      <Lightbox images={viewableDocs} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndex={setLightboxIndex} />

      <ConfirmDialog
        open={dialog === "verified"}
        onClose={() => setDialog(null)}
        onConfirm={(note) => submitDecision("verified", note)}
        title={`Approve ${provider?.name || "provider"}?`}
        message="They will be able to go online and accept jobs immediately. Make sure the selfie matches the CNIC photo."
        confirmLabel="Approve provider"
        reason="optional"
        reasonLabel="Internal note"
        reasonPlaceholder="e.g. CNIC verified against NADRA copy"
      />
      <ConfirmDialog
        open={dialog === "rejected"}
        onClose={() => setDialog(null)}
        onConfirm={(note) => submitDecision("rejected", note)}
        title={`Reject ${provider?.name || "provider"}?`}
        message="The provider will not be able to take jobs. Tell them what to fix so they can re-apply."
        confirmLabel="Reject provider"
        tone="danger"
        reason="required"
        reasonLabel="Reason for rejection"
        reasonPlaceholder="e.g. CNIC back photo is blurry, please upload a clear photo"
      />
      <ConfirmDialog
        open={dialog === "pending"}
        onClose={() => setDialog(null)}
        onConfirm={(note) => submitDecision("pending", note)}
        title="Move back to pending?"
        message="The provider will return to the review queue and cannot take new jobs until approved again."
        confirmLabel="Move to pending"
        reason="optional"
        reasonLabel="Internal note"
      />
    </div>
  );
}
