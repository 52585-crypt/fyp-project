import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Icon } from "../components/Icon";
import { Badge, Button, ErrorBanner, PageHeader, Panel, StatusBadge, Tabs } from "../components/ui";
import { serviceTitle, timeAgo } from "../lib/format";
import { useApiResource, useDocumentTitle } from "../lib/hooks";

const REFRESH_MS = 15000;
const STUCK_AFTER_MIN = 10;
const DEFAULT_CENTER = [33.6844, 73.0479]; // Islamabad

const PROVIDER_CATEGORY_FOR_REQUEST = { car_towing: "towing", fuel_delivery: "fuel_delivery", mechanic: "mechanic" };

const FILTERS = [
  { value: "all", label: "All services" },
  { value: "towing", label: "Towing" },
  { value: "fuel_delivery", label: "Fuel" },
  { value: "mechanic", label: "Mechanic" }
];

function minutesSince(value) {
  return value ? (Date.now() - new Date(value).getTime()) / 60000 : 0;
}

function isStuck(request) {
  return request.status === "searching_provider" && minutesSince(request.createdAt) >= STUCK_AFTER_MIN;
}

/** Marker kinds → CSS class; shapes differ so the map doesn't rely on colour alone. */
function markerIcon(kind, label) {
  return L.divIcon({
    className: "map-marker-wrap",
    html: `<span class="map-marker map-marker-${kind}" aria-hidden="true">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14]
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

const PROVIDER_LETTER = { towing: "T", fuel_delivery: "F", mechanic: "M" };

export function LiveMap() {
  useDocumentTitle("Live map");
  const { data, error, loading, reload } = useApiResource("/api/admin/live");
  const [filter, setFilter] = useState("all");
  const [focus, setFocus] = useState(null);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const view = useMemo(() => {
    const providers = (data?.providers || []).filter((p) => filter === "all" || p.serviceCategory === filter);
    const requests = (data?.requests || []).filter((r) => filter === "all" || PROVIDER_CATEGORY_FOR_REQUEST[r.category] === filter);
    return {
      providers,
      requests,
      available: providers.filter((p) => !p.busy && !p.isStale && p.verificationStatus === "verified"),
      searching: requests.filter((r) => r.status === "searching_provider"),
      stuck: requests.filter(isStuck),
      inProgress: requests.filter((r) => r.status !== "searching_provider")
    };
  }, [data, filter]);

  // Create the Leaflet map once (Leaflet manages its own DOM — a legitimate effect).
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return undefined;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView(DEFAULT_CENTER, 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync markers whenever data or the filter changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points = [];

    for (const p of view.providers) {
      const { lat, lng } = p.location || {};
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      const kind = p.isStale ? "stale" : p.busy ? "busy" : p.verificationStatus !== "verified" ? "unverified" : "provider";
      L.marker([lat, lng], { icon: markerIcon(kind, PROVIDER_LETTER[p.serviceCategory] || "P"), title: p.name, zIndexOffset: 0 })
        .bindPopup(
          `<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(serviceTitle(p.serviceCategory))} provider<br>` +
            `${p.busy ? "On a job" : p.isStale ? "No signal for 30+ min" : p.verificationStatus !== "verified" ? "Online but not verified — can't take jobs" : "Available"} · seen ${escapeHtml(timeAgo(p.lastSeenAt))}<br>` +
            `${escapeHtml(p.phone)}`
        )
        .addTo(layer);
      points.push([lat, lng]);
    }

    for (const r of view.requests) {
      const { lat, lng } = r.pickupLocation || {};
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      const kind = isStuck(r) ? "stuck" : r.status === "searching_provider" ? "searching" : "active";
      L.marker([lat, lng], { icon: markerIcon(kind, "!"), title: serviceTitle(r.category), zIndexOffset: kind === "stuck" ? 1000 : 500 })
        .bindPopup(
          `<strong>${escapeHtml(serviceTitle(r.category))}</strong> · ${escapeHtml(r.status.replaceAll("_", " "))}<br>` +
            `${escapeHtml(r.user?.name || "Customer")} · ${escapeHtml(timeAgo(r.createdAt))}<br>` +
            `${escapeHtml(r.pickupLocation?.addressText || "Pinned location")}<br>` +
            `<a href="/requests?id=${encodeURIComponent(r.id)}">Open request →</a>`
        )
        .addTo(layer);
      points.push([lat, lng]);
    }

    if (!fittedRef.current && points.length) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
      fittedRef.current = true;
    }
  }, [view]);

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo(focus, 15, { duration: 0.6 });
  }, [focus]);

  const attention = [...view.stuck, ...view.searching.filter((r) => !isStuck(r))];

  return (
    <div className="page page-wide">
      <PageHeader
        title="Live map"
        subtitle={`Online providers and open requests · refreshes every ${REFRESH_MS / 1000}s`}
        actions={
          <Button icon="refresh" loading={loading && !!data} onClick={reload}>
            Refresh
          </Button>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      <div className="toolbar">
        <Tabs label="Service" options={FILTERS} value={filter} onChange={setFilter} />
        <div className="map-legend" aria-label="Legend">
          <span><i className="map-marker map-marker-provider">T</i> Available</span>
          <span><i className="map-marker map-marker-busy">T</i> On a job</span>
          <span><i className="map-marker map-marker-unverified">T</i> Not verified</span>
          <span><i className="map-marker map-marker-stale">T</i> No signal</span>
          <span><i className="map-marker map-marker-searching">!</i> Searching</span>
          <span><i className="map-marker map-marker-stuck">!</i> Stuck {STUCK_AFTER_MIN}+ min</span>
          <span><i className="map-marker map-marker-active">!</i> In progress</span>
        </div>
      </div>

      <div className="live-grid">
        <div className="map-frame">
          <div ref={mapEl} className="map" role="region" aria-label="Map of providers and requests" />
        </div>

        <div className="stack">
          <div className="live-stats">
            <div className="mini">
              <div className="mini-value">{view.available.length}</div>
              <div className="mini-label">Available providers</div>
            </div>
            <div className="mini">
              <div className="mini-value">{view.searching.length}</div>
              <div className="mini-label">Waiting for provider</div>
            </div>
            <div className={`mini ${view.stuck.length ? "mini-alert" : ""}`}>
              <div className="mini-value">{view.stuck.length}</div>
              <div className="mini-label">Stuck {STUCK_AFTER_MIN}+ min</div>
            </div>
            <div className="mini">
              <div className="mini-value">{view.inProgress.length}</div>
              <div className="mini-label">Jobs in progress</div>
            </div>
          </div>

          <Panel title="Needs attention" bodyClassName="flush">
            {attention.length === 0 ? (
              <div className="pad muted">Every open request has a provider.</div>
            ) : (
              <ul className="list">
                {attention.slice(0, 12).map((r) => (
                  <li key={r.id}>
                    <button type="button" className="list-row" onClick={() => setFocus([r.pickupLocation.lat, r.pickupLocation.lng])}>
                      <span className={`map-marker map-marker-${isStuck(r) ? "stuck" : "searching"}`} aria-hidden="true">!</span>
                      <div className="list-main">
                        <div className="list-title">
                          {serviceTitle(r.category)}
                          {isStuck(r) ? <Badge tone="danger">Stuck</Badge> : null}
                        </div>
                        <div className="list-meta">
                          {r.user?.name || "Customer"} · waiting {timeAgo(r.createdAt).replace(" ago", "")}
                        </div>
                      </div>
                      <Link to={`/requests?id=${r.id}`} className="icon-btn" aria-label="Open request" onClick={(e) => e.stopPropagation()}>
                        <Icon name="chevronRight" />
                      </Link>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="In progress" bodyClassName="flush">
            {view.inProgress.length === 0 ? (
              <div className="pad muted">No jobs in progress.</div>
            ) : (
              <ul className="list">
                {view.inProgress.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <button type="button" className="list-row" onClick={() => setFocus([r.pickupLocation.lat, r.pickupLocation.lng])}>
                      <div className="list-main">
                        <div className="list-title">{serviceTitle(r.category)}</div>
                        <div className="list-meta">
                          {r.provider?.name || "Provider"} → {r.user?.name || "Customer"}
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
