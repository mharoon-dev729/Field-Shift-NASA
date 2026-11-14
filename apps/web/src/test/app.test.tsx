/**
 * Frontend journey tests.
 *
 * The API is mocked at the service-module boundary, so these tests pin the
 * interface behaviour: what is shown, what is refused, and what is never faked.
 * Every fixture here is hand-built for the UI and is not a NASA observation.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CropsResponse,
  EngineResult,
  EvidenceResponse,
  ScenarioResult,
  SourcesResponse,
} from "@fieldshift/shared";

import App from "../App.js";
import { ApiError } from "../api/client.js";
import * as endpoints from "../api/endpoints.js";

vi.mock("../api/endpoints.js", () => ({
  getCatalogue: vi.fn(),
  getSources: vi.fn(),
  getEvidence: vi.fn(),
  compareRotations: vi.fn(),
}));

const mocked = vi.mocked(endpoints);

const CROPS: CropsResponse = {
  planningYear: 2025,
  crops: [
    {
      id: "wheat",
      name: "Wheat",
      localName: "Gandum",
      season: "rabi",
      sowingWindow: { start: "2025-11-01", end: "2025-11-20", startMd: "11-01", endMd: "11-20" },
      harvestWindow: { start: "2026-04-01", end: "2026-05-05", startMd: "04-01", endMd: "05-05" },
      waterDemandClass: null,
      heatSensitivity: null,
      isLegume: false,
      residueClass: null,
      selectable: true,
      verified: true,
      sources: [{ title: "catalogue", url: "https://example.invalid/wheat", quality: "high" }],
      limitations: [],
    },
  ],
  rotations: [
    {
      id: "wheat-cotton",
      label: "Wheat - Cotton",
      phases: [
        { cropId: "wheat", season: "rabi" },
        { cropId: "cotton", season: "kharif" },
      ],
      whyIncluded: "Documented Punjab rotation (fixture text for UI tests).",
      sources: [{ title: "pau", url: "https://example.invalid/pau", quality: "high" }],
      active: true,
      evaluable: true,
      excludedReason: null,
    },
    {
      id: "wheat-maize",
      label: "Wheat - Maize",
      phases: [
        { cropId: "wheat", season: "rabi" },
        { cropId: "maize", season: "kharif" },
      ],
      whyIncluded: "Documented Punjab rotation (fixture text for UI tests).",
      sources: [{ title: "pau", url: "https://example.invalid/pau", quality: "high" }],
      active: true,
      evaluable: true,
      excludedReason: null,
    },
  ],
};

const SOURCES: SourcesResponse = {
  sources: [
    {
      id: "nasa_power",
      provider: "NASA LaRC",
      product: "POWER Agroclimatology",
      url: "https://power.larc.nasa.gov/",
      dataClass: "reanalysis",
      variables: ["T2M"],
      units: { T2M: "C" },
      spatialResolution: "0.5 x 0.625 deg",
      temporalResolution: "daily",
      coverage: "global",
      history: "1981–present",
      auth: "none",
      usableAtPilot: "yes",
      role: "evidence",
      limitations: ["Reanalysis, not an observation"],
    },
  ],
};

function evidence(overrides: Partial<EvidenceResponse> = {}): EvidenceResponse {
  return {
    request: {
      lat: 31.4187,
      lon: 73.0791,
      season: "kharif",
      year: 2025,
      windowStart: "2025-04-01",
      windowEnd: "2025-11-29",
      requestedAt: "2026-11-14T00:00:00.000Z",
    },
    point: {
      requested: { lat: 31.4187, lon: 73.0791 },
      resolvedGridPoint: { lat: 31.419, lon: 73.079 },
      elevationM: 182.92,
      gridResolution: "0.5 x 0.625 deg (MERRA-2)",
    },
    seasonWindow: { start: "2025-04-01", end: "2025-11-29", days: 243 },
    sources: [
      {
        id: "nasa_power",
        provider: "NASA LaRC",
        product: "POWER",
        url: "https://power.larc.nasa.gov/",
        dataClass: "reanalysis",
        spatialResolution: "0.5 x 0.625 deg",
        status: "ok",
        retrievedAt: "2026-11-14T00:00:00.000Z",
        cache: "miss",
      },
    ],
    observations: [
      {
        variable: "PRECTOTCORR",
        label: "Precipitation",
        unit: "mm",
        aggregation: "sum",
        value: 729.73,
        windowStart: "2025-04-01",
        windowEnd: "2025-11-29",
        nValid: 243,
        nExpected: 243,
        qualityFlags: ["fill_value_removed:2"],
        dataClass: "reanalysis",
        spatialResolution: "0.5 x 0.625 deg",
        sourceId: "nasa_power",
        retrievedAt: "2026-11-14T00:00:00.000Z",
      },
    ],
    dailySeries: [
      {
        variable: "PRECTOTCORR",
        label: "Precipitation",
        unit: "mm/day",
        points: [
          { date: "2025-04-01", value: 0 },
          { date: "2025-04-02", value: null },
          { date: "2025-04-03", value: 4.2 },
        ],
        dataClass: "reanalysis",
        sourceId: "nasa_power",
        spatialResolution: "0.5 x 0.625 deg",
        qualityFlags: [],
      },
    ],
    indicators: [
      {
        id: "seasonRainMm",
        label: "Season rainfall",
        value: 729.73,
        unit: "mm",
        windowStart: "2025-04-01",
        windowEnd: "2025-11-29",
        sourceId: "nasa_power",
        dataClass: "reanalysis",
        qualityFlags: [],
      },
    ],
    soil: {
      sourceId: "soilgrids",
      status: "unavailable",
      properties: [],
      missing: ["clay"],
      spatialResolution: "250 m",
      dataClass: "observation",
      retrievedAt: null,
      limitations: [],
    },
    imagery: [],
    quality: {
      sourcesOk: ["nasa_power"],
      sourcesPartial: [],
      sourcesFailed: [],
      missingVariables: [],
      temporalCoverage: [{ variable: "PRECTOTCORR", daysValid: 243, daysRequested: 243 }],
      cacheStatus: { nasa_power: "miss" },
    },
    limitations: ["POWER values are modelled (MERRA-2), not measurements at the farm."],
    ...overrides,
  };
}

function scenario(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    scenarioId: "wheat-cotton",
    label: "Wheat - Cotton",
    isBaseline: true,
    index: 12.87,
    confidence: "moderate",
    evidenceCoverage: 0.8047,
    components: [
      {
        id: "C1",
        label: "Rainfall reliability",
        available: true,
        status: "scored",
        sub: 0,
        weight: 0.4853,
        rawWeight: 0.3905,
        raw: { seasonRainMm: 729.73, rainAnomalyPct: 56.17, drySpellCount10: 11 },
        unit: "mm",
        dataClass: "reanalysis",
        ruleId: "R-RAIN-COMPOSITE-v1",
        note: "Composite of absolute rainfall anomaly and long dry spells.",
        missing: [],
        provenance: [
          {
            sourceId: "nasa_power",
            variable: "PRECTOTCORR",
            windowStart: "2025-04-01",
            windowEnd: "2025-11-30",
            dataClass: "reanalysis",
            spatialResolution: "0.5 x 0.625 deg (MERRA-2)",
          },
        ],
      },
      {
        id: "C4",
        label: "Water demand vs supply",
        available: false,
        status: "unavailable",
        sub: null,
        weight: 0,
        rawWeight: 0.1953,
        raw: { waterDemandClass: null, meanGwetroot: null },
        unit: null,
        dataClass: null,
        ruleId: "R-WATER-DEMAND-SUPPLY-v1",
        note: "Crop water-demand class is not in the verified catalogue.",
        missing: ["Crop water-demand class is not sourced for: Wheat, Cotton."],
        provenance: [],
      },
    ],
    explanation: {
      supporting: ["Rainfall totals 729.7 mm across the windows."],
      risks: ["190 days at or above 35 C fall inside the windows."],
      missing: ["Water demand vs supply: demand class not sourced."],
      cannotConclude: ["Field Shift cannot say whether this rotation would raise yield or income."],
    },
    limitations: [],
    redistributed: ["C4"],
    comparabilityWarning: true,
    provenance: [],
    whyIncluded: "Documented Punjab rotation (fixture text for UI tests).",
    ...overrides,
  };
}

function result(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    engineVersion: "1.0.0",
    inputEcho: {
      season: "kharif",
      planningYear: 2025,
      priorities: { water: 0.6, soilHealth: 0.2, climateResilience: 0.2 },
      point: { lat: 31.4187, lon: 73.0791 },
      irrigation: "canal",
      currentRotationId: "wheat-cotton",
    },
    status: "ok",
    indexLabel: "comparative index (0-100, relative to options shown)",
    weighting: {
      provisional: true,
      components: { C1: 0.39, C2: 0.21, C3: 0.21, C4: 0.2, C5: 0 },
      note: "Weighting is a prototype choice, not an agronomic standard.",
    },
    scenarios: [
      scenario(),
      scenario({
        scenarioId: "wheat-maize",
        label: "Wheat - Maize",
        isBaseline: false,
        index: 87.13,
      }),
    ],
    ranking: ["wheat-maize", "wheat-cotton"],
    evidenceCoverage: 0.8047,
    pairwise: [{ a: "wheat-maize", b: "wheat-cotton", delta: 74.26, meaningful: true }],
    globalLimitations: ["Values describe the ~0.5 deg MERRA-2 cell around the farm."],
    dataSources: [
      {
        id: "nasa_power",
        provider: "NASA LaRC",
        product: "POWER Agroclimatology",
        url: "https://power.larc.nasa.gov/",
        dataClass: "reanalysis",
        retrievedAt: "2026-11-14T00:00:00.000Z",
        scope: "environmental",
      },
    ],
    generatedAt: "2026-11-14T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getCatalogue.mockResolvedValue(CROPS);
  mocked.getSources.mockResolvedValue(SOURCES);
  mocked.getEvidence.mockResolvedValue(evidence());
  mocked.compareRotations.mockResolvedValue(result());
});

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /analyze my farm/i }));
}

describe("Field Shift application", () => {
  it("renders a farmer-friendly location flow without coordinate fields", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /field shift/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /why this exists/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/select your farm location/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /faisalabad/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/rotation you use now/i)).toBeInTheDocument();
  });

  it("maps a selected supported farm area to its own analysis point", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("combobox", { name: /rotation you use now/i });

    await user.click(screen.getByRole("option", { name: /multan/i }));
    await submit(user);

    expect(await screen.findByRole("heading", { name: /environmental evidence/i })).toBeInTheDocument();
    expect(mocked.compareRotations).toHaveBeenCalled();
    expect(mocked.compareRotations.mock.calls[0]![0].point.lat).toBeCloseTo(30.1575, 4);
  });

  it("shows evidence, comparison indices and provenance after a successful run", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("combobox", { name: /rotation you use now/i });

    await submit(user);

    expect(await screen.findByRole("heading", { name: /environmental evidence/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/season rainfall/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/729\.73/).length).toBeGreaterThan(0);
    expect(screen.getByText(/fill_value_removed:2/)).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: /rotation comparison/i })).toBeInTheDocument();
    expect(screen.getAllByText("87.1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12.9").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/moderate confidence/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/evidence coverage 80%/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/weights redistributed: C4/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/rule R-RAIN-COMPOSITE-v1/i).length).toBeGreaterThan(0);

    expect(mocked.compareRotations).toHaveBeenCalledTimes(1);
    const request = mocked.compareRotations.mock.calls[0]![0];
    expect(request.point.lat).toBeCloseTo(31.4187, 4);
    expect(request.candidateRotationIds).toContain("wheat-cotton");
  });

  it("explains unavailable SoilGrids data instead of showing a value", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("combobox", { name: /rotation you use now/i });
    await submit(user);

    expect(await screen.findByText(/no soil values exist at this point/i)).toBeInTheDocument();
    expect(screen.getByText(/soil stays unknown/i)).toBeInTheDocument();
  });

  it("flags a pairwise difference that is too small to call", async () => {
    mocked.compareRotations.mockResolvedValue(
      result({ pairwise: [{ a: "wheat-maize", b: "wheat-cotton", delta: 3.01, meaningful: false }] }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("combobox", { name: /rotation you use now/i });
    await submit(user);

    expect(await screen.findByText(/some differences are too small to call/i)).toBeInTheDocument();
    expect(screen.getByText(/3\.0 index points/i)).toBeInTheDocument();
  });

  it("refuses to show a winner when the evidence is insufficient", async () => {
    mocked.compareRotations.mockResolvedValue(
      result({
        status: "insufficient_evidence",
        ranking: [],
        evidenceCoverage: 0.2071,
        scenarios: [
          scenario({
            index: null,
            confidence: "insufficient_evidence",
            evidenceCoverage: 0.2071,
            explanation: {
              supporting: [],
              risks: [],
              missing: ["Rainfall reliability: PRECTOTCORR series missing for a phase"],
              cannotConclude: ["Nothing can be concluded about these rotations."],
            },
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("combobox", { name: /rotation you use now/i });
    await submit(user);

    expect(
      await screen.findByText(/not enough evidence to compare these rotations/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no winner, index or ordering is shown/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /ranking/i })).not.toBeInTheDocument();
    const cards = screen.getAllByText(/no index/i);
    expect(cards.length).toBeGreaterThan(0);
    expect(screen.queryByText(/^87\.1$/)).not.toBeInTheDocument();
  });

  it("reports a failed comparison, keeps the farm profile and offers a retry", async () => {
    mocked.compareRotations.mockRejectedValueOnce(
      new ApiError("NASA POWER did not respond within 20 s.", { code: "SOURCE_UNAVAILABLE", status: 502 }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("combobox", { name: /rotation you use now/i });

    await submit(user);

    expect(await screen.findByText(/the comparison could not be completed/i)).toBeInTheDocument();
    expect(screen.getByText(/NASA POWER did not respond within 20 s/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /faisalabad/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("87.1")).not.toBeInTheDocument();

    mocked.compareRotations.mockResolvedValueOnce(result());
    await user.click(screen.getByRole("button", { name: /retry comparison/i }));

    expect((await screen.findAllByText("87.1")).length).toBeGreaterThan(0);
    expect(mocked.compareRotations).toHaveBeenCalledTimes(2);
  });

  it("keeps the submit disabled while a request is in flight", async () => {
    let release: (value: EngineResult) => void = () => {};
    let releaseEvidence: (value: EvidenceResponse) => void = () => {};
    mocked.compareRotations.mockReturnValue(
      new Promise<EngineResult>((resolve) => {
        release = resolve;
      }),
    );
    mocked.getEvidence.mockReturnValue(
      new Promise<EvidenceResponse>((resolve) => {
        releaseEvidence = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("combobox", { name: /rotation you use now/i });

    await submit(user);

    const button = screen.getByRole("button", { name: /analyzing your farm/i });
    expect(button).toBeDisabled();

    release(result());
    expect(screen.getByRole("button", { name: /analyzing your farm/i })).toBeDisabled();

    releaseEvidence(evidence());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /analyze my farm/i })).toBeEnabled();
    });
  });

  it("shows an evidence-specific error while keeping a successful comparison", async () => {
    mocked.getEvidence.mockRejectedValue(
      new ApiError("The request timed out after 45 seconds.", { code: "TIMEOUT" }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("combobox", { name: /rotation you use now/i });
    await submit(user);

    expect(await screen.findByText(/evidence could not be retrieved/i)).toBeInTheDocument();
    expect(screen.getByText(/request timed out after 45 seconds/i)).toBeInTheDocument();
    expect((await screen.findAllByText("87.1")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /retry evidence/i })).toBeInTheDocument();
  });

  it("opens the sources panel with assumptions separated from measurements", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("combobox", { name: /rotation you use now/i });

    await user.click(screen.getByRole("button", { name: /sources & assumptions/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/NASA environmental observations/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/project assumptions and provisional thresholds/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/not affiliated with, endorsed by, or produced by NASA/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
