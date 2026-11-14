import type { EngineResult, ScenarioResult } from "@fieldshift/shared";

import { formatPercent } from "../lib/format.js";
import { Alert, Badge, Spinner } from "./ui.js";
import { ScenarioCard } from "./ScenarioCard.js";

interface Props {
  result: EngineResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function orderedScenarios(result: EngineResult): ScenarioResult[] {
  const byId = new Map(result.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  const ranked = result.ranking.map((id) => byId.get(id)).filter((s): s is ScenarioResult => Boolean(s));
  const unranked = result.scenarios.filter((scenario) => !result.ranking.includes(scenario.scenarioId));
  return [...ranked, ...unranked];
}

export function ComparisonSection({ result, loading, error, onRetry }: Props) {
  const recommendedId = result && result.status !== "insufficient_evidence" && result.ranking.length > 0 && result.pairwise.some((pair) => pair.meaningful && pair.a === result.ranking[0]) ? result.ranking[0] : null;
  return (
    <section className="card" aria-labelledby="comparison-heading" id="comparison">
      <div className="card-head">
        <h2 id="comparison-heading">Rotation comparison</h2>
        <p className="muted">
          Computed by the deterministic decision engine on the server. The interface displays the result; it never
          recalculates a score.
        </p>
      </div>

      {loading ? <Spinner label="Comparing rotations…" /> : null}

      {error ? (
        <Alert
          variant="error"
          title="The comparison could not be completed"
          action={
            <button type="button" className="button secondary" onClick={onRetry}>
              Retry comparison
            </button>
          }
        >
          <p>{error}</p>
          <p className="small">Your farm details have been kept. No example or substitute results are shown.</p>
        </Alert>
      ) : null}

      {!loading && !error && !result ? (
        <p className="muted">Comparisons appear here after you submit your farm profile.</p>
      ) : null}

      {result && !loading ? (
        <div className="stack">
          <div className="meta-row">
            <div>
              <span className="meta-label">Engine</span>
              <span>v{result.engineVersion}</span>
            </div>
            <div>
              <span className="meta-label">Evidence coverage</span>
              <span>{formatPercent(result.evidenceCoverage)}</span>
            </div>
            <div>
              <span className="meta-label">Weighting</span>
              <span className="small">{result.weighting.note}</span>
            </div>
          </div>

          {result.status === "insufficient_evidence" ? (
            <Alert variant="warning" title="Not enough evidence to compare these rotations">
              <p>
                Field Shift will not rank options when the evidence cannot support a comparison. No winner, index
                or ordering is shown.
              </p>
              <p className="small">
                What would help: a complete NASA POWER window for the planning season, and verified crop
                water-demand data.
              </p>
              <ul className="bullets small">
                {[...new Set([...result.scenarios.flatMap((s) => s.explanation.missing), ...result.globalLimitations])].map(
                  (item) => (
                    <li key={item}>{item}</li>
                  ),
                )}
              </ul>
            </Alert>
          ) : (
            <>
              {result.status === "partial" ? (
                <Alert variant="warning" title="Partial comparison">
                  <p>
                    At least one option could not be scored from the available evidence, so the ranking below is
                    incomplete and is not a like-for-like comparison.
                  </p>
                </Alert>
              ) : null}

              <div className="pill-row">
                <Badge tone="neutral">
                  Index: {result.indexLabel}
                </Badge>
                {result.ranking.length > 0 ? (
                  <Badge tone="good">Ranked {result.ranking.length} of {result.scenarios.length} options</Badge>
                ) : null}
              </div>
              <p className="index-guide">Higher comparative index values indicate a more favourable result relative to the rotations shown. This is not a percentage or a yield forecast.</p>

              {result.pairwise.filter((pair) => !pair.meaningful).length > 0 ? (
                <Alert variant="info" title="Some differences are too small to call">
                  <ul className="bullets small">
                    {result.pairwise
                      .filter((pair) => !pair.meaningful)
                      .map((pair) => (
                        <li key={`${pair.a}-${pair.b}`}>
                          {pair.a} and {pair.b} differ by {pair.delta.toFixed(1)} index points — inside the
                          prototype&apos;s 5-point band, so neither is presented as better.
                        </li>
                      ))}
                  </ul>
                </Alert>
              ) : null}

              {result.ranking.length > 1 ? (
                <ol className="ranking">
                  {orderedScenarios(result)
                    .filter((s) => s.index !== null)
                    .map((scenario) => (
                      <li key={scenario.scenarioId}>
                        <span className="ranking-label">{scenario.label}</span>
                        <span className="ranking-value">{scenario.index!.toFixed(1)}</span>
                      </li>
                    ))}
                </ol>
              ) : null}
            </>
          )}

          {result.globalLimitations.length > 0 ? (
            <>
              <h3>Limitations of this run</h3>
              <ul className="bullets small">
                {result.globalLimitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="scenario-list">
              {orderedScenarios(result).map((scenario, index) => (
              <ScenarioCard key={scenario.scenarioId} scenario={scenario} position={index + 1} recommended={scenario.scenarioId === recommendedId} />
            ))}
          </div>

          <div className="sources-summary">
            <h3>Sources used</h3>
            <ul className="bullets small">
              {result.dataSources.map((source) => (
                <li key={source.id}>
                  <strong>{source.id}</strong> — {source.product} ({source.provider}, {source.dataClass},{" "}
                  {source.scope}).
                  {source.retrievedAt ? ` Retrieved ${source.retrievedAt}.` : " Reference data."}
                </li>
              ))}
            </ul>
            <p className="small muted">
              NASA supplies the environmental measurements; the rotation reasoning comes from cited Punjab
              agronomy. The two are never conflated.
            </p>
          </div>
        </div>
      ) : null}

    </section>
  );
}
