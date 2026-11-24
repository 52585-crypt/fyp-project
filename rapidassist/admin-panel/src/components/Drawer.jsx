import { useEffect, useId } from "react";
import { Icon } from "./Icon";

/** Right-hand side sheet used for record details. Full-screen on phones. */
export function Drawer({ open, onClose, title, subtitle, children, footer }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="drawer-header">
          <div>
            <h2 id={titleId} className="drawer-title">{title}</h2>
            {subtitle ? <div className="drawer-subtitle">{subtitle}</div> : null}
          </div>
          <button type="button" className="icon-btn" aria-label="Close details" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
