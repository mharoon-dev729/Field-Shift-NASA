import type { DataSourceEntry, SourcesResponse } from "@fieldshift/shared";
import { useEffect } from "react";

import { Alert, Badge } from "./ui.js";

interface Props {
  open: boolean;
  onClose: () => void;
  sources: SourcesResponse | null;
  error: string | null;
}

const GROUPS: Array<{ id: string; title: string; description: string; match: (s: DataSourceEntry) => boolean }> = [
  {
    id: "environmental",
    title: "NASA environmental observations",
    description: "Gridded or modelled values that describe the area around the farm.",
    match: (s) => s.role === "evidence" || s.role === "context",
  },
  {
    id: "soil",
    title: "Soil information",
    description: "Digital soil-map predictions — not a laboratory test of your field.",
    match: (s) => s.id === "soilgrids",
  },
  {
    id: "agronomic",
    title: "Agricultural research and crop requirements",
    description: "Crop calendars, documented rotations and provincial guidance.",
    match: (s) => s.role === "reference",
  },
  {
    id: "other",
    title: "Optional or excluded sources",
    description: "Sources registered for completeness but not used in this analysis.",
    match: (s) => s.role === "optional" || s.role === "excluded",
  },
];

export function SourcesPanel({ open, onClose, sources, error }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const listed = sources?.sources ?? [];
  const used = new Set(listed.filter((s) => GROUPS.some((g) => g.id !== "other" && g.match(s))).map((s) => s.id));

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sources-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <h2 id="sources-heading">Sources, assumptions and thresholds</h2>
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? <Alert variant="error" title="The source register could not be loaded"><p>{error}</p></Alert> : null}

        {!error && listed.length === 0 ? (
          <Alert variant="info" title="No register available">
            <p>Source metadata is unavailable right now. Provenance for individual values is still shown in each
            criterion and in the evidence tables.</p>
          </Alert>
        ) : null}

        {GROUPS.map((group) => {
          const items = listed.filter((source) => group.match(source) && !(group.id === "agronomic" && source.id === "soilgrids"));
          if (items.length === 0) return null;
          return (
            <section key={group.id}>
              <h3>{group.title}</h3>
              <p className="small muted">{group.description}</p>
              <ul className="source-list">
                {items.map((source) => (
                  <li key={source.id}>
                    <p>
                      <strong>{source.product}</strong>{" "}
                      <Badge tone={source.role === "excluded" ? "neutral" : used.has(source.id) ? "good" : "warning"}>
                        {source.role}
                      </Badge>
                    </p>
                    <p className="small">
                      {source.provider} · {source.dataClass} · {source.spatialResolution} · {source.temporalResolution}
                    </p>
                    <p className="small muted">
                      Coverage: {source.coverage}
                      {source.history ? ` · ${source.history}` : ""} · auth: {source.auth}
                    </p>
                    <p className="small">
                      <a href={source.url} target="_blank" rel="noreferrer noopener">
                        {source.url}
                      </a>
                    </p>
                    {source.limitations.length > 0 ? (
                      <ul className="bullets small muted">
                        {source.limitations.map((limitation) => (
                          <li key={limitation}>{limitation}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section>
          <h3>Project assumptions and provisional thresholds</h3>
          <ul className="bullets small">
            <li>Rain day: 1.0 mm. Long dry spell: 10 or more consecutive days below that.</li>
            <li>Heat: 35 °C and 40 °C are operational thresholds chosen for this prototype, not published crop limits.</li>
            <li>Frost: minimum temperature at or below 5 °C during the rabi window.</li>
            <li>Component weights (0.30 / 0.25 / 0.25 / 0.15 / 0.05) are a prototype choice, not an agronomic standard.</li>
            <li>Two options fewer than 5 index points apart are reported as “not a meaningful difference”.</li>
            <li>Environmental values describe a ~0.5° MERRA-2 cell, roughly 50 km, not the field.</li>
          </ul>
          <p className="small muted">
            Independent project. Not affiliated with, endorsed by, or produced by NASA or NASA Space Apps.
          </p>
        </section>
      </div>
    </div>
  );
}
