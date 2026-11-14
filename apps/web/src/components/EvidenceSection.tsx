import type { EvidenceResponse, SourceStatus } from "@fieldshift/shared";

import { formatNumber, formatUnit, formatWindow, NOT_AVAILABLE } from "../lib/format.js";
import { Alert, Badge, Sparkline, Spinner } from "./ui.js";

interface Props {
  evidence: EvidenceResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function sourceTone(status: SourceStatus["status"]): "good" | "warning" | "bad" {
  if (status === "ok") return "good";
  if (status === "partial") return "warning";
  return "bad";
}

const FRIENDLY_VARIABLES: Record<string, { label: string; note: string }> = {
  meanT2M: { label: "Average air temperature", note: "The typical temperature during the selected period." },
  seasonRainMm: { label: "Season rainfall", note: "The total rainfall measured across the selected season." },
  meanGwetroot: { label: "Root-zone soil wetness", note: "A modelled estimate of moisture around crop-root depth." },
  minGwetroot: { label: "Lowest root-zone soil wetness", note: "The driest modelled root-zone condition during the period." },
  T2M: { label: "Average air temperature", note: "The typical temperature during the selected period." },
  T2M_MAX: { label: "Highest daily temperature", note: "The hottest temperature recorded on a day in the selected period." },
  T2M_MIN: { label: "Lowest daily temperature", note: "The coolest temperature recorded on a day in the selected period." },
  PRECTOTCORR: { label: "Daily rainfall", note: "How much rain fell during the selected period." },
  GWETROOT: { label: "Root-zone soil wetness", note: "A modelled estimate of moisture around crop-root depth." },
  GWETPROF: { label: "Profile soil wetness", note: "A modelled estimate of moisture through the soil profile." },
  RH2M: { label: "Relative humidity", note: "How much moisture was in the air near the ground." },
  ALLSKY_SFC_SW_DWN: { label: "Solar energy reaching the ground", note: "The sunlight energy available at the surface." },
  WS2M: { label: "Wind speed", note: "Average wind speed near the ground." },
};

function friendly(variable: string, fallback: string) {
  return FRIENDLY_VARIABLES[variable] ?? { label: fallback, note: "Environmental evidence for the selected period." };
}

export function EvidenceSection({ evidence, loading, error, onRetry }: Props) {
  return (
    <section className="card" aria-labelledby="evidence-heading" id="evidence">
      <div className="card-head">
        <h2 id="evidence-heading">Environmental evidence</h2>
        <p className="muted">
          Retrieved from the Field Shift API. Values are modelled or gridded estimates for the area around the
          farm — not measurements taken in the field.
        </p>
      </div>

      {loading ? <Spinner label="Retrieving environmental evidence…" /> : null}

      {error ? (
        <Alert
          variant="error"
          title="Evidence could not be retrieved"
          action={
            <button type="button" className="button secondary" onClick={onRetry}>
              Retry evidence
            </button>
          }
        >
          <p>{error}</p>
          <p className="small">Your farm details have been kept. Nothing was substituted with sample data.</p>
        </Alert>
      ) : null}

      {!loading && !error && !evidence ? (
        <p className="muted">Evidence will appear here after you submit your farm profile.</p>
      ) : null}

      {evidence ? (
        <div className="stack">
          <div className="meta-row">
            <div>
              <span className="meta-label">Window</span>
              <span>{formatWindow(evidence.seasonWindow.start, evidence.seasonWindow.end)}</span>
              <span className="muted small"> · {evidence.seasonWindow.days} days</span>
            </div>
            <div>
              <span className="meta-label">Point</span>
              <span>
                {evidence.point.requested.lat.toFixed(4)}, {evidence.point.requested.lon.toFixed(4)}
              </span>
              {evidence.point.resolvedGridPoint ? (
                <span className="muted small">
                  {" "}
                  → POWER cell {evidence.point.resolvedGridPoint.lat.toFixed(3)},{" "}
                  {evidence.point.resolvedGridPoint.lon.toFixed(3)}
                </span>
              ) : null}
            </div>
            <div>
              <span className="meta-label">Grid resolution</span>
              <span>{evidence.point.gridResolution}</span>
            </div>
          </div>

          <div className="pill-row">
            {evidence.sources.map((source) => (
              <Badge key={source.id} tone={sourceTone(source.status)}>
                {source.id}: {source.status}
                {source.cache === "hit" ? " (cached)" : ""}
              </Badge>
            ))}
          </div>

          {evidence.sources
            .filter((s) => s.status !== "ok")
            .map((s) => (
              <Alert key={s.id} variant={s.status === "failed" ? "error" : "warning"} title={`${s.id} ${s.status}`}>
                <p>{s.error?.message ?? "This source did not return a complete response."}</p>
              </Alert>
            ))}

          <h3>Indicators</h3>
          {evidence.indicators.length === 0 ? (
            <p className="muted">No indicators could be computed from the available values.</p>
          ) : (
            <ul className="stat-grid">
              {evidence.indicators.map((indicator) => (
                <li key={indicator.id} className="stat">
                  <span className="stat-label">{friendly(indicator.id, indicator.label).label}</span>
                  <span className="stat-value">
                    {indicator.value === null ? NOT_AVAILABLE : formatNumber(indicator.value, 2)}
                    {indicator.value !== null ? <span className="stat-unit"> {formatUnit(indicator.unit)}</span> : null}
                  </span>
                  <span className="small muted">
                    {formatWindow(indicator.windowStart, indicator.windowEnd)} · {indicator.sourceId}
                  </span>
                  <span className="small muted">{indicator.note ?? friendly(indicator.id, indicator.label).note}</span>
                </li>
              ))}
            </ul>
          )}

          <h3>Daily series</h3>
          <p className="small muted">
            Gaps are days without a usable value. They are drawn as breaks and are never treated as zero.
          </p>
          <div className="spark-grid">
            {evidence.dailySeries.slice(0, 4).map((series) => (
              <Sparkline
                key={series.variable}
                points={series.points}
                label={friendly(series.variable, series.label).label}
                unit={formatUnit(series.unit)}
              />
            ))}
          </div>

          <h3>Aggregated observations</h3>
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">
                Environmental observations with units, coverage and quality flags
              </caption>
              <thead>
                <tr>
                  <th scope="col">Variable</th>
                  <th scope="col">Value</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Coverage</th>
                  <th scope="col">Window</th>
                  <th scope="col">Source</th>
                  <th scope="col">Quality flags</th>
                </tr>
              </thead>
              <tbody>
                {evidence.observations.map((observation) => (
                  <tr key={`${observation.variable}-${observation.aggregation}`}>
                    <th scope="row"><span>{friendly(observation.variable, observation.label).label}</span><span className="small muted"> · {observation.variable}</span></th>
                    <td>{observation.value === null ? NOT_AVAILABLE : formatNumber(observation.value, 2)}</td>
                    <td>{formatUnit(observation.unit)}</td>
                    <td>
                      {observation.nValid}/{observation.nExpected} days
                    </td>
                    <td>{formatWindow(observation.windowStart, observation.windowEnd)}</td>
                    <td>{observation.sourceId}</td>
                    <td>{observation.qualityFlags.length ? observation.qualityFlags.join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Soil</h3>
          {!evidence.soil ? (
            <Alert variant="info" title="Soil information not requested">
              <p>No soil record was returned for this request.</p>
            </Alert>
          ) : evidence.soil.status === "failed" ? (
            <Alert variant="warning" title="Soil data could not be retrieved">
              <p>
                {evidence.soil.error?.message ??
                  "The soil service did not return a usable response."}{" "}
                Soil is treated as unknown; it was not replaced with a regional average.
              </p>
            </Alert>
          ) : evidence.soil.status === "unavailable" ? (
            <Alert variant="warning" title="No soil values exist at this point">
              <p>
                The soil service answered but holds no value for this location, so soil stays unknown. It is not
                assumed to be normal, and nothing was estimated to fill the gap.
              </p>
            </Alert>
          ) : (
            <>
              <p className="small muted">
                ISRIC SoilGrids predictions ({evidence.soil.spatialResolution}) — digital soil-map estimates, not
                a laboratory test of your field.
              </p>
              <div className="table-wrap">
                <table>
                  <caption className="visually-hidden">Soil properties by depth</caption>
                  <thead>
                    <tr>
                      <th scope="col">Property</th>
                      <th scope="col">Depth</th>
                      <th scope="col">Value</th>
                      <th scope="col">Unit</th>
                      <th scope="col">As reported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.soil.properties.map((property) => (
                      <tr key={`${property.property}-${property.depth}`}>
                        <th scope="row">{property.label}</th>
                        <td>{property.depth}</td>
                        <td>{property.value === null ? NOT_AVAILABLE : formatNumber(property.value, 2)}</td>
                        <td>{formatUnit(property.unit)}</td>
                        <td>
                          {property.rawValue === null
                            ? NOT_AVAILABLE
                            : `${formatNumber(property.rawValue, 0)} ${property.rawUnit}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {evidence.imagery.length > 0 ? (
            <>
              <h3>Satellite imagery (context only)</h3>
              <ul className="plain-list">
                {evidence.imagery.map((layer) => (
                  <li key={layer.layerKey}>
                    <strong>{layer.label}</strong>
                    <span className="muted small"> · {layer.date} · {layer.attribution}</span>
                    <p className="small muted">{layer.note}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {evidence.limitations.length > 0 ? (
            <>
              <h3>Evidence limitations</h3>
              <ul className="bullets">
                {evidence.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
