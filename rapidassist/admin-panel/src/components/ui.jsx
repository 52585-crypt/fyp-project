import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { initials, statusLabel, statusTone } from "../lib/format";

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function FullPageLoader({ label = "Loading…" }) {
  return (
    <div className="full-loader" role="status">
      <Spinner size={28} />
      <span>{label}</span>
    </div>
  );
}

export function Badge({ tone = "neutral", children, dot = false }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot ? <span className="badge-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <Badge tone={statusTone(status)} dot>{statusLabel(status)}</Badge>;
}

export function Avatar({ name, src, size = 36 }) {
  return src ? (
    <img className="avatar" src={src} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Button({ variant = "secondary", size, icon, loading, children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Spinner size={14} /> : icon ? <Icon name={icon} size={16} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function Panel({ title, subtitle, action, children, className = "", bodyClassName = "" }) {
  return (
    <section className={`panel ${className}`}>
      {title || action ? (
        <header className="panel-header">
          <div>
            {title ? <h2 className="panel-title">{title}</h2> : null}
            {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={`panel-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon = "info", title, text, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="empty-title">{title}</div>
      {text ? <div className="empty-text">{text}</div> : null}
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="banner banner-danger" role="alert">
      <Icon name="alert" />
      <span className="banner-text">{message}</span>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", radius = 8 }) {
  return <span className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="stack" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <Skeleton width={36} height={36} radius={999} />
          <div className="stack-tight" style={{ flex: 1 }}>
            <Skeleton width="45%" />
            <Skeleton width="70%" height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…" }) {
  return (
    <label className="search">
      <Icon name="search" size={16} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value ? (
        <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => onChange("")}>
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </label>
  );
}

/** Segmented filter tabs. options: [{ value, label, count? }] */
export function Tabs({ options, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`tab ${value === option.value ? "is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count != null ? <span className="tab-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, label }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.total === 0) return null;
  const { page, pages, limit, total } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="pagination">
      <span className="muted">
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="pagination-buttons">
        <Button size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" />
        <span className="pagination-page">
          {page} / {pages}
        </span>
        <Button size="sm" icon="chevronRight" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" />
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = "md" }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <header className="modal-header">
          <h2 id={titleId} className="modal-title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog with an optional (or required) reason field.
 * onConfirm receives the trimmed reason and may return a promise.
 */
export function ConfirmDialog({ open, onClose, ...rest }) {
  // The body only mounts while open, so its form state starts fresh every time.
  if (!open) return null;
  return <ConfirmDialogBody onClose={onClose} {...rest} />;
}

function ConfirmDialogBody({
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "primary",
  reason = "none", // none | optional | required
  reasonLabel = "Reason",
  reasonPlaceholder = "",
  minReason = 5
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmed = text.trim();
  const invalid = reason === "required" && trimmed.length < minReason;

  async function submit(e) {
    e?.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} loading={busy} disabled={invalid} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="stack">
        {message ? <p className="modal-message">{message}</p> : null}
        {reason !== "none" ? (
          <label className="field">
            <span className="field-label">
              {reasonLabel}
              {reason === "optional" ? <span className="muted"> (optional)</span> : null}
            </span>
            <textarea
              className="input textarea"
              rows={3}
              value={text}
              maxLength={500}
              placeholder={reasonPlaceholder}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            {reason === "required" ? (
              <span className={`field-hint ${invalid && text ? "is-error" : ""}`}>
                {invalid ? `At least ${minReason} characters — this is saved with the action.` : "This will be saved with the action."}
              </span>
            ) : null}
          </label>
        ) : null}
      </form>
    </Modal>
  );
}

export function KeyValue({ label, children }) {
  return (
    <div className="kv">
      <div className="kv-label">{label}</div>
      <div className="kv-value">{children ?? "—"}</div>
    </div>
  );
}
