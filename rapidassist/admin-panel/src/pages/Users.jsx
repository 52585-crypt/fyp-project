import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi, apiErrorMessage } from "../config/api";
import { useToast } from "../components/Toast";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  Select,
  SkeletonRows,
  StatusBadge,
  Tabs
} from "../components/ui";
import { formatDate, serviceTitle } from "../lib/format";
import { useApiResource, useDocumentTitle, useSearchParamInput, useUpdateParams } from "../lib/hooks";

const ROLE_TABS = [
  { value: "all", label: "Everyone" },
  { value: "user", label: "Customers" },
  { value: "mechanic", label: "Providers" }
];

const STATUS_OPTIONS = [
  { value: "all", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Suspended" }
];

export function Users() {
  useDocumentTitle("Users");
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const updateParams = useUpdateParams(setParams);
  const [search, setSearch] = useSearchParamInput(params, updateParams);

  const role = params.get("role") || "all";
  const status = params.get("status") || "all";
  const page = Number(params.get("page")) || 1;
  const q = params.get("q") || "";

  const listQuery = useApiResource("/api/admin/users", { role, status, search: q || undefined, page, limit: 20 });
  const data = listQuery.data || { users: [], pagination: null };
  const { loading, error, reload: load } = listQuery;
  const [target, setTarget] = useState(null); // user being suspended / restored

  async function toggleBlock(reason) {
    const blocked = !target.isBlocked;
    try {
      await adminApi.patch(`/api/admin/users/${target.id}/block`, { blocked, reason });
      load();
      toast.success(blocked ? `${target.name} has been suspended` : `${target.name} can use RapidAssist again`);
      setTarget(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update account"));
    }
  }

  return (
    <div className="page">
      <PageHeader title="Users & providers" subtitle="Find any account, see its activity and suspend it if needed." />

      <div className="toolbar">
        <Tabs label="Account type" options={ROLE_TABS} value={role} onChange={(value) => updateParams({ role: value === "all" ? "" : value, page: "" })} />
        <div className="toolbar-right">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or phone" />
          <Select label="Account status" value={status} onChange={(value) => updateParams({ status: value === "all" ? "" : value, page: "" })} options={STATUS_OPTIONS} />
        </div>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      <Panel bodyClassName="flush">
        {loading && !data.users.length ? (
          <div className="pad">
            <SkeletonRows rows={8} />
          </div>
        ) : data.users.length === 0 ? (
          <EmptyState icon="users" title="No accounts found" text="Try a different search or filter." />
        ) : (
          <div className={`table-wrap ${loading ? "is-loading" : ""}`}>
            <table className="table table-stack">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Verification</th>
                  <th className="num">Requests</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th className="actions-col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className={u.isBlocked ? "is-muted" : ""}>
                    <td data-label="Name">
                      <div className="cell-person">
                        <Avatar name={u.name} size={32} />
                        <div>
                          <div className="cell-title">{u.name}</div>
                          <div className="cell-meta">{u.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Type">
                      {u.role === "mechanic" ? (
                        <div>
                          Provider
                          <div className="cell-meta">
                            {serviceTitle(u.serviceCategory)}
                            {u.isOnline ? " · online" : ""}
                          </div>
                        </div>
                      ) : (
                        "Customer"
                      )}
                    </td>
                    <td data-label="Verification">
                      {u.role === "mechanic" ? (
                        <Link to={`/providers?status=all&id=${u.id}`} className="link-plain">
                          <StatusBadge status={u.verificationStatus} />
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td data-label="Requests" className="num">
                      <Link to={`/requests?q=${encodeURIComponent(u.phone)}`} className="link">
                        {u.requestCount}
                      </Link>
                    </td>
                    <td data-label="Joined">{formatDate(u.createdAt)}</td>
                    <td data-label="Status">
                      {u.isBlocked ? (
                        <span title={u.blockedReason || ""}>
                          <Badge tone="danger" dot>
                            Suspended
                          </Badge>
                        </span>
                      ) : (
                        <Badge tone="success" dot>
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="actions-col">
                      {u.isBlocked ? (
                        <Button size="sm" icon="unlock" onClick={() => setTarget(u)}>
                          Restore
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="btn-danger-text" icon="ban" onClick={() => setTarget(u)}>
                          Suspend
                        </Button>
                      )}
                    </td>
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

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={toggleBlock}
        title={target?.isBlocked ? `Restore ${target?.name}?` : `Suspend ${target?.name}?`}
        message={
          target?.isBlocked
            ? `Suspended because: “${target?.blockedReason || "no reason recorded"}”. They will be able to sign in again.`
            : "They will be signed out on their next request and cannot sign in. Providers are taken offline immediately."
        }
        confirmLabel={target?.isBlocked ? "Restore account" : "Suspend account"}
        tone={target?.isBlocked ? "primary" : "danger"}
        reason={target?.isBlocked ? "none" : "required"}
        minReason={3}
        reasonLabel="Reason"
        reasonPlaceholder="e.g. Multiple fake requests reported"
      />
    </div>
  );
}
