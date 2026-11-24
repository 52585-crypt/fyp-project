import { useState } from "react";

/**
 * Single-series column chart: requests created per day.
 * One hue (brand), 4px rounded data-end on a shared baseline, hover tooltip per column,
 * and a visually-hidden table for screen readers.
 */
export function TrendChart({ data }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.total));
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const ticks = [0, niceMax / 2, niceMax];

  const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: "short" });
  const fullLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="trend">
      <div className="trend-plot">
        <div className="trend-grid" aria-hidden="true">
          {ticks
            .slice()
            .reverse()
            .map((tick) => (
              <div key={tick} className="trend-gridline">
                <span>{tick}</span>
              </div>
            ))}
        </div>
        <div className="trend-columns">
          {data.map((d, i) => (
            <div
              key={d.date}
              className={`trend-col ${hover === i ? "is-hover" : ""}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${fullLabel(d.date)}: ${d.total} requests`}
            >
              <div className="trend-bar" style={{ height: `${(d.total / niceMax) * 100}%` }} />
              {hover === i ? (
                <div className="chart-tooltip" role="tooltip">
                  <div className="chart-tooltip-title">{fullLabel(d.date)}</div>
                  <div className="chart-tooltip-row">
                    <span>Requests</span>
                    <strong>{d.total}</strong>
                  </div>
                  <div className="chart-tooltip-row">
                    <span>Completed</span>
                    <strong>{d.completed}</strong>
                  </div>
                  <div className="chart-tooltip-row">
                    <span>Cancelled</span>
                    <strong>{d.cancelled}</strong>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="trend-axis" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.date} className={i === data.length - 1 ? "is-today" : ""}>
            {i === data.length - 1 ? "Today" : dayLabel(d.date)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Requests per day, last {data.length} days</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Requests</th>
            <th>Completed</th>
            <th>Cancelled</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{fullLabel(d.date)}</td>
              <td>{d.total}</td>
              <td>{d.completed}</td>
              <td>{d.cancelled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal magnitude bar (single hue) with label + value. */
export function BreakdownBar({ label, value, total }) {
  const pct = total ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="breakdown">
      <div className="breakdown-top">
        <span className="breakdown-label">{label}</span>
        <span className="breakdown-value">
          {value.toLocaleString()} <span className="muted">· {Math.round(pct)}%</span>
        </span>
      </div>
      <div className="breakdown-track" role="presentation">
        <div className="breakdown-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
