import { PILOT, type CropsResponse, type EngineResult, type EvidenceResponse, type SourcesResponse } from "@fieldshift/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCatalogue, getEvidence, getSources, compareRotations } from "./api/endpoints.js";
import { ApiError } from "./api/client.js";
import { ComparisonSection } from "./components/ComparisonSection.js";
import { EvidenceSection } from "./components/EvidenceSection.js";
import { FarmForm } from "./components/FarmForm.js";
import { HistorySection } from "./components/HistorySection.js";
import { SourcesPanel } from "./components/SourcesPanel.js";
import { Alert } from "./components/ui.js";
import { buildCompareRequest, DEFAULT_PROFILE, type FarmProfileInput, type ProfileErrors } from "./lib/profile.js";
import { useReducedMotion } from "./hooks/useReducedMotion.js";
import { deleteHistory, loadHistory, saveHistory, type AnalysisHistoryEntry } from "./lib/history.js";

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unknown error.";
}

export default function App() {
  const reducedMotion = useReducedMotion();
  const [profile, setProfile] = useState<FarmProfileInput>(DEFAULT_PROFILE);
  const [fieldErrors, setFieldErrors] = useState<ProfileErrors>({});
  const [catalogue, setCatalogue] = useState<CropsResponse | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>(() => loadHistory());

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
  const savedRunRef = useRef<string | null>(null);

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

  useEffect(() => {
    const onScroll = () => {
      const active = window.scrollY > 24;
      setScrolled(active);
      setShowScrollTop(window.scrollY > 520);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!comparison || !evidence || pending || comparisonError || evidenceError || savedRunRef.current === comparison.runId) return;
    savedRunRef.current = comparison.runId;
    setHistory(saveHistory({ id: comparison.runId, savedAt: new Date().toISOString(), profile, evidence, comparison }));
  }, [comparison, evidence, pending, comparisonError, evidenceError, profile]);

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
        <header className="masthead" aria-label="Agri main header">
          <div className={`topbar${scrolled ? " topbar-scrolled" : ""}`}>
            <div className="brand"><span className="brand-mark" aria-hidden="true">◒</span>Agri</div>
            <nav className="main-nav" aria-label="Main navigation">
              <a href="#home">Home</a><a href="#profile-heading">Farm setup</a><a href="#results">Results</a><a href="#history">Analysis history</a>
              <a href="#evidence">Evidence</a>
            </nav>
            <button type="button" className="button secondary" onClick={() => setSourcesOpen(true)}>Sources & assumptions</button>
          </div>
          <div className="hero-copy" id="home">
            <p className="eyebrow">NASA Earth observations · local agronomy</p>
            <h1>Field Shift: better crop decisions for a stronger tomorrow.</h1>
            <p className="lede">Agri brings satellite-informed climate evidence and documented local rotations together, so farmers can weigh each season with confidence.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#profile-heading">Start farm analysis →</a>
              <a className="button button-secondary" href="#how-it-works">How it works</a>
            </div>
          </div>
          <div className="hero-facts" aria-label="Agri capabilities">
            <div><strong>NASA data</strong>Environmental evidence, clearly labelled</div>
            <div><strong>Crop rotations</strong>Documented local options</div>
            <div><strong>Farmer-first</strong>Simple explanations, honest limits</div>
          </div>
        </header>

        <section className="intro" aria-labelledby="intro-heading" id="how-it-works">
          <h2 id="intro-heading">Why this exists — and how it works</h2>
          <div className="intro-grid">
            <p>Start with your farm and season. Agri keeps the science visible but never makes a claim the data cannot support.</p>
            <ol className="how-steps">
              <li>
                <strong>Tell us where</strong> your farm is — by current location, map, or area name.
              </li>
              <li>
                <strong>Choose a season</strong> — kharif (April–November) or rabi (November–May).
              </li>
              <li>
                <strong>Select rotations</strong> — compare your current practice against eligible options.
              </li>
              <li>
                <strong>Set priorities</strong> — tell Agri what matters most: water, soil health, or climate resilience.
              </li>
              <li>
                <strong>Get results</strong> — Agri scores each rotation and explains why, with confidence and gaps.
              </li>
            </ol>
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

        <HistorySection
          entries={history}
          onOpen={(entry) => {
            savedRunRef.current = entry.comparison.runId;
            setProfile(entry.profile);
            setEvidence(entry.evidence);
            setComparison(entry.comparison);
            setEvidenceError(null);
            setComparisonError(null);
            window.setTimeout(() => resultsRef.current?.focus(), 0);
          }}
          onDelete={(entry) => {
            const description = `${entry.profile.season === "kharif" ? "Kharif" : "Rabi"} ${entry.profile.planningYear} analysis from ${new Date(entry.savedAt).toLocaleString()}`;
            if (!window.confirm(`Delete this saved ${description}? This only removes it from this browser.`)) return;
            setHistory(deleteHistory(entry.id));
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
      {showScrollTop ? <button type="button" className="scroll-top" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" })}>↑</button> : null}
    </>
  );
}
