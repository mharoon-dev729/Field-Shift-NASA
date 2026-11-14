import type { CriterionResult } from "@fieldshift/shared";

import { criterionStatusLabel, formatNumber } from "../lib/format.js";
import { Badge } from "./ui.js";

const RAW_LABELS: Record<string, { label: string; unit?: string }> = {
  seasonRainMm: { label: "Season rainfall", unit: "mm" },
  normalRainMm: { label: "Long-term normal", unit: "mm" },
  rainAnomalyPct: { label: "Rainfall anomaly", unit: "%" },
  drySpellCount10: { label: "Long dry spells (10+ days)" },
  longestDrySpellDays: { label: "Longest dry spell", unit: "days" },
  heatDays35: { label: "Days at or above 35 °C", unit: "days" },
  heatDays40: { label: "Days at or above 40 °C", unit: "days" },
  meanT2M: { label: "Mean temperature", unit: "°C" },
  thresholdC: { label: "Heat threshold", unit: "°C" },
  veryHotThresholdC: { label: "Very-hot threshold", unit: "°C" },
  legume: { label: "Legume phase (1 = yes)" },
  distinctCrops: { label: "Distinct crops" },
  diversification: { label: "Crop diversification (0–1)" },
  residueClass: { label: "Residue class (0–1)" },
  waterDemandClass: { label: "Water-demand class (0–1)" },
  meanGwetroot: { label: "Mean root-zone wetness (0–1)" },
  supplyStress: { label: "Supply stress (0–1)" },
  frostDays5: { label: "Days at or below 5 °C", unit: "days" },
};

function rawValue(key: string, value: number | null): string {
  if (value === null) return "Not available";
  const meta = RAW_LABELS[key];
  const digits = key === "diversification" || key === "meanGwetroot" || key === "supplyStress" ? 2 : 1;
  return `${formatNumber(value, digits)}${meta?.unit ? ` ${meta.unit}` : ""}`;
}

export function CriterionRow({ criterion }: { criterion: CriterionResult }) {
  const subPercent = criterion.sub === null ? 0 : Math.round(criterion.sub * 100);
  const weightPercent = Math.round(criterion.weight * 100);

  return (
    <li className={`criterion${criterion.available ? "" : " criterion-off"}`}>
      <div className="criterion-head">
        <span className="criterion-name">
          <strong>{criterion.id}</strong> {criterion.label}
        </span>
        <span className="criterion-badges">
          <Badge tone={criterion.available ? (criterion.status === "partial" ? "warning" : "good") : "neutral"}>
            {criterionStatusLabel(criterion.available, criterion.status)}
          </Badge>
          <span className="small muted">weight {weightPercent}%</span>
        </span>
      </div>

      {criterion.available && criterion.sub !== null ? (
        <>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${subPercent}%` }} />
          </div>
          <p className="small muted">
            Relative position in this comparison: {subPercent}/100 · weight {weightPercent}% · rule{" "}
            {criterion.ruleId}
          </p>
        </>
      ) : (
        <p className="small muted">Not scored. Its weight was redistributed to the evaluated criteria.</p>
      )}

      <details>
        <summary>Inputs and provenance</summary>
        <dl className="raw-list">
          {Object.entries(criterion.raw).map(([key, value]) => (
            <div key={key}>
              <dt>{RAW_LABELS[key]?.label ?? key}</dt>
              <dd>{rawValue(key, value)}</dd>
            </div>
          ))}
        </dl>
        <p className="small">{criterion.note}</p>
        {criterion.missing.length > 0 ? (
          <ul className="bullets small">
            {criterion.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {criterion.provenance.length > 0 ? (
          <ul className="provenance small">
            {criterion.provenance.map((source, index) => (
              <li key={`${source.sourceId}-${source.variable}-${index}`}>
                {source.sourceId}
                {source.variable ? ` · ${source.variable}` : ""}
                {source.dataClass ? ` · ${source.dataClass}` : ""}
                {source.windowStart ? ` · ${source.windowStart} → ${source.windowEnd}` : ""}
                {source.spatialResolution ? ` · ${source.spatialResolution}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </li>
  );
}
