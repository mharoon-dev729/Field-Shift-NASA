import { PILOT, type CropsResponse, type EngineResult, type EvidenceResponse, type SourcesResponse } from "@fieldshift/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCatalogue, getEvidence, getSources, compareRotations } from "./api/endpoints.js";
import { ApiError } from "./api/client.js";
import { ComparisonSection } from "./components/ComparisonSection.js";
import { EvidenceSection } from "./components/EvidenceSection.js";
import { FarmForm } from "./components/FarmForm.js";
import { SourcesPanel } from "./components/SourcesPanel.js";
import { Alert } from "./components/ui.js";
import { buildCompareRequest, DEFAULT_PROFILE, type FarmProfileInput, type ProfileErrors } from "./lib/profile.js";

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unknown error.";
}

export default function App() {
  const [profile, setProfile] = useState<FarmProfileInput>(DEFAULT_PROFILE);
  const [fieldErrors, setFieldErrors] = useState<ProfileErrors>({});
  const [catalogue, setCatalogue] = useState<CropsResponse | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<EngineResult | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  const [pending, setPending] = useState(false);
  const [evidencePending, setEvidencePending] = useState(false);
  const [comparisonPending, setComparisonPending] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const lastRequest = useRef<ReturnType<typeof buildCompareRequest>["request"]>(null);
  const resultsRef = useRef<HTMLHeadingElement | null>(null);

  const loadCatalogue = useCallback(async () => {
    setCatalogueError(null);
    try {
      const data = await getCatalogue({ year: Number(profile.planningYear) || undefined });
      setCatalogue(data);
      const ids = data.rotations.map((rotation) => rotation.id);
      setProfile((current) => {
        const currentId = ids.includes(current.currentRotationId) ? current.currentRotationId : (ids[0] ?? "");
        const candidates = current.candidateRotationIds.filter((id) => ids.includes(id));
        return {
          ...current,
          currentRotationId: currentId,
          candidateRotationIds: currentId && !candidates.includes(currentId) ? [...candidates, currentId] : candidates,
        };
      });
    } catch (err) {
      setCatalogueError(
        `${messageOf(err)} Rotations cannot be offered without the catalogue, so submission is disabled.`,
      );
    }
  }, [profile.planningYear]);

  useEffect(() => {
    void loadCatalogue();
    const controller = new AbortController();
    getSources(controller.signal)
      .then(setSources)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.code === "ABORTED") return;
        setSourcesError(messageOf(err));
      });
    return () => controller.abort();
    // Catalogue is refreshed deliberately when the planning year changes.
  }, []);

  const updateProfile = useCallback((patch: Partial<FarmProfileInput>) => {
    setProfile((current) => ({ ...current, ...patch }));
  }, []);

  async function fetchResults(request: NonNullable<ReturnType<typeof buildCompareRequest>["request"]>, scope: "all" | "evidence" | "comparison") {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = sequence.current + 1;
    sequence.current = id;

    const evidenceQuery = {
      lat: request.point.lat,
      lon: request.point.lon,
      season: request.season,
      year: request.planningYear,
    };

    if (scope === "all" || scope === "evidence") {
      setEvidenceError(null);
      setEvidence(null);
      setEvidencePending(true);
    }
    if (scope === "all" || scope === "comparison") {
      setComparisonError(null);
      setComparison(null);
      setComparisonPending(true);
    }

    const jobs: Array<Promise<void>> = [];

    if (scope === "all" || scope === "evidence") {
      jobs.push(
        getEvidence(evidenceQuery, controller.signal)
          .then((data) => {
            if (sequence.current !== id) return;
            setEvidence(data);
          })
          .catch((err: unknown) => {
            if (sequence.current !== id) return;
            if (err instanceof ApiError && err.code === "ABORTED") return;
            setEvidenceError(messageOf(err));
          })
          .finally(() => {
            if (sequence.current === id) setEvidencePending(false);
          }),
      );
    }

    if (scope === "all" || scope === "comparison") {
      jobs.push(
        compareRotations(request, controller.signal)
          .then((data) => {
            if (sequence.current !== id) return;
            setComparison(data);
          })
          .catch((err: unknown) => {
            if (sequence.current !== id) return;
            if (err instanceof ApiError && err.code === "ABORTED") return;
            setComparisonError(messageOf(err));
          })
          .finally(() => {
            if (sequence.current === id) setComparisonPending(false);
          }),
      );
    }

    await Promise.all(jobs);
    if (sequence.current === id) {
      setPending(false);
      resultsRef.current?.focus();
    }
  }

  function onSubmit() {
    const { request, errors } = buildCompareRequest(profile);
    setFieldErrors(errors);
    if (!request) {
      setComparison(null);
      setEvidence(null);
      return;
    }
    lastRequest.current = request;
    setPending(true);
    void fetchResults(request, "all");
  }

  const rotations = catalogue?.rotations ?? [];
  const crops = catalogue?.crops ?? [];

  return (
    <>
      <a className="skip-link" href="#profile-heading">
        Skip to the farm form
      </a>
      <main className="page">
        <header className="masthead">
          <div>
            <p className="eyebrow">NASA Space Apps Challenge 2026 · independent entry</p>
            <h1>Field Shift</h1>
            <p className="lede">
              Compare crop rotations for a farm in {PILOT.name}, {PILOT.province}, using real NASA Earth
              observations and cited local agronomy — with the evidence, the risks and the gaps shown openly.
            </p>
          </div>
          <button type="button" className="button secondary" onClick={() => setSourcesOpen(true)}>
            Sources &amp; assumptions
          </button>
        </header>

        <section className="intro" aria-labelledby="intro-heading">
          <h2 id="intro-heading">Why this exists</h2>
          <div className="intro-grid">
            <p>
              A farmer commits to next season&apos;s crop months in advance. Rainfall timing, heat during the
              growing window and frost at the edges of the season all shape how a rotation behaves — and those
              conditions are shifting.
            </p>
            <p>
              Field Shift pulls <strong>NASA POWER</strong> reanalysis for the area around the farm, lines it up
              with each candidate rotation&apos;s documented window, and shows which factors favour or work
              against each option.
            </p>
            <p>
              It is decision support, not a forecast of success. It will not promise higher yield or better soil,
              and when the evidence is too thin it says so instead of ranking.
            </p>
          </div>
        </section>

        {catalogueError ? (
          <Alert
            variant="error"
            title="The crop catalogue is unavailable"
            action={
              <button type="button" className="button secondary" onClick={() => void loadCatalogue()}>
                Retry catalogue
              </button>
            }
          >
            <p>{catalogueError}</p>
          </Alert>
        ) : null}

        <FarmForm
          profile={profile}
          errors={fieldErrors}
          rotations={rotations}
          crops={crops}
          pending={pending}
          catalogueError={catalogueError}
          onChange={updateProfile}
          onSubmit={onSubmit}
        />

        <h2 className="results-heading" tabIndex={-1} ref={resultsRef} id="results">
          Results
        </h2>

        <EvidenceSection
          evidence={evidence}
          loading={evidencePending}
          error={evidenceError}
          onRetry={() => {
            if (lastRequest.current) void fetchResults(lastRequest.current, "evidence");
          }}
        />

        <ComparisonSection
          result={comparison}
          loading={comparisonPending}
          error={comparisonError}
          onRetry={() => {
            if (lastRequest.current) void fetchResults(lastRequest.current, "comparison");
          }}
        />

        <footer className="footer">
          <p>
            Independent project. Not affiliated with, endorsed by, or produced by NASA or NASA Space Apps. NASA
            does not endorse any non-U.S. Government entity.
          </p>
          <p className="small">
            Pilot anchor: {PILOT.anchor.lat.toFixed(4)} N, {PILOT.anchor.lon.toFixed(4)} E · Crops and rotations
            are cited to the Government of Punjab, Punjab Agricultural University and the Punjab Crop Reporting
            Service.
          </p>
        </footer>
      </main>

      <SourcesPanel
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        sources={sources}
        error={sourcesError}
      />
    </>
  );
}
