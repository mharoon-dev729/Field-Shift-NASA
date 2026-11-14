import type { ScenarioResult } from "@fieldshift/shared";

import { confidenceLabel, formatPercent } from "../lib/format.js";
import { Badge } from "./ui.js";
import { CriterionRow } from "./CriterionRow.js";

export function ScenarioCard({ scenario, position, recommended = false }: { scenario: ScenarioResult; position: number; recommended?: boolean }) {
  const confidenceTone =
    scenario.confidence === "moderate" ? "good" : scenario.confidence === "low" ? "warning" : "bad";

  return (
    <article className={`scenario${scenario.isBaseline ? " scenario-baseline" : ""}${recommended ? " scenario-recommended" : ""}`}>
      <header className="scenario-head">
        <div>
          <p className="eyebrow">Option {position}</p>
          <h3>
            {scenario.label}
            {scenario.isBaseline ? <span className="tag">your current rotation</span> : null}
            {recommended ? <span className="tag tag-recommended">recommended</span> : null}
          </h3>
        </div>
        <div className="scenario-score">
          <span className="score-value">
            {scenario.index === null ? "No index" : scenario.index.toFixed(1)}
          </span>
          <span className="small muted">
            {scenario.index === null ? "not enough evidence" : "comparative index (0–100)"}
          </span>
        </div>
      </header>

      <div className="pill-row">
        <Badge tone={confidenceTone}>{confidenceLabel(scenario.confidence)}</Badge>
        <Badge tone="neutral">Evidence coverage {formatPercent(scenario.evidenceCoverage)}</Badge>
        {scenario.redistributed.length > 0 ? (
          <Badge tone="warning">Weights redistributed: {scenario.redistributed.join(", ")}</Badge>
        ) : null}
      </div>

      {scenario.comparabilityWarning ? (
        <p className="small muted">
          One or more criteria could not be evaluated for this option, so its weights were redistributed and its
          index is not directly equivalent to a fully-evidenced option.
        </p>
      ) : null}

      <p className="small muted">{scenario.whyIncluded}</p>

      {scenario.explanation.supporting.length > 0 || scenario.explanation.risks.length > 0 ? (
        <section className="scenario-insights" aria-label={`${scenario.label} key insights`}>
          <h4>What stands out</h4>
          <ul className="bullets">
            {[...scenario.explanation.supporting, ...scenario.explanation.risks].slice(0, 3).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      <details className="scenario-details">
        <summary>View evaluation details</summary>
        <ul className="criterion-list">
          {scenario.components.map((criterion) => (
            <CriterionRow key={criterion.id} criterion={criterion} />
          ))}
        </ul>

        <div className="explanation">
        {scenario.explanation.supporting.length > 0 ? (
          <section>
            <h4>Supporting evidence</h4>
            <ul className="bullets">
              {scenario.explanation.supporting.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {scenario.explanation.risks.length > 0 ? (
          <section>
            <h4>Risks to weigh</h4>
            <ul className="bullets risk">
              {scenario.explanation.risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {scenario.explanation.missing.length > 0 ? (
          <section>
            <h4>Missing evidence</h4>
            <ul className="bullets">
              {scenario.explanation.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h4>What this cannot tell you</h4>
          <ul className="bullets muted">
            {scenario.explanation.cannotConclude.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        </div>
      </details>
    </article>
  );
}
