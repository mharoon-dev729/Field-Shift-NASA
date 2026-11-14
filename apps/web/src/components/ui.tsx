/** Small presentational primitives shared across the journey. */

import type { DailyPoint } from "@fieldshift/shared";
import type { ReactNode } from "react";

export function Spinner({ label }: { label: string }) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <span className="spinner-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Alert({
  variant,
  title,
  children,
  action,
}: {
  variant: "error" | "warning" | "info" | "success";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`alert alert-${variant}`} role={variant === "error" ? "alert" : "status"}>
      {title ? <p className="alert-title">{title}</p> : null}
      <div className="alert-body">{children}</div>
      {action ? <div className="alert-action">{action}</div> : null}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warning" | "bad";
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Compact daily-series chart. Gaps stay gaps: a missing day is never drawn as
 * zero, which is the graphical equivalent of the project's data rule.
 */
export function Sparkline({
  points,
  label,
  unit,
}: {
  points: DailyPoint[];
  label: string;
  unit: string;
}) {
  const values = points.map((p) => p.value);
  const numbers = values.filter((v): v is number => v !== null);
  if (points.length === 0 || numbers.length === 0) {
    return <p className="muted small">No daily values available for {label}.</p>;
  }

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const width = 300;
  const height = 56;

  let path = "";
  let penDown = false;
  points.forEach((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    if (point.value === null) {
      penDown = false;
      return;
    }
    const y = height - ((point.value - min) / span) * (height - 8) - 4;
    path += `${penDown ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    penDown = true;
  });

  const missing = points.length - numbers.length;

  return (
    <figure className="spark">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} daily series, ${unit}`}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <figcaption className="small muted">
        {label} · {unit} · min {min.toFixed(2)} / max {max.toFixed(2)}
        {missing > 0 ? ` · ${missing} day${missing === 1 ? "" : "s"} missing (gaps, not zero)` : ""}
      </figcaption>
    </figure>
  );
}
