# Decision Engine Specification — Field Shift

**Version:** 1.0 (Phase 1)
**Status:** Specification — implementation in Phase 3
**Principle:** transparent, deterministic, testable, and willing to say "insufficient evidence".

---

## 0. What the engine is and is not

The engine is a **pure function**:

```
compareRotations(input: EngineInput): EngineResult
```

No network access, no randomness, no clock (timestamps are passed in), no LLM. Given the same input it
returns byte-identical output. This makes every result reproducible, auditable, and unit-testable.

It produces a **comparative index** between scenarios for one farm, season and priority profile.

It does **not** produce:
- a probability of success,
- a yield prediction,
- a money figure,
- an absolute "suitability score" that could be compared across different farms or seasons.

> **Naming rule for the UI:** always "comparative index (0–100, relative to the other options shown)",
> never "score", "rating", or "chance".

---

## 1. Inputs

### 1.1 From the farmer (`FarmerProfile`)

| Field | Type | Required | Used for |
|---|---|---|---|
| `latitude`, `longitude` | number | yes | locating observations |
| `season` | `"rabi" \| "kharif"` | yes | selecting the planning window |
| `planningYear` | integer | yes | selecting the target season's window |
| `currentRotationId` | string | yes | baseline scenario |
| `previousCropId` | string \| null | no | rotation-legality / diversity check |
| `irrigation` | `"canal" \| "tubewell" \| "both" \| "rainfed"` | yes | water-supply context for C4 |
| `farmSizeAcres` | number \| null | no | per-acre framing only; never scored |
| `soil` | `{texture?, pH?, organicMatter?}` \| `null` | no | soil-context adjustment; `null` = unknown |
| `priorities` | `{water, soilHealth, climateResilience}` | yes | component weighting (§6) |

### 1.2 From the observation pipeline (`ObservationSet`)

Every observation is a record, never a bare number:

```ts
interface Observation<T> {
  value: T | null;              // null = missing/invalid, NEVER 0
  unit: string;                 // as declared by the source
  sourceId: string;             // FK to data_sources
  variable: string;             // e.g. "PRECTOTCORR"
  windowStart: string;          // ISO date
  windowEnd: string;
  spatialResolution: string;    // e.g. "0.5 x 0.625 deg (MERRA-2)"
  dataClass: "observation" | "historical" | "reanalysis" | "forecast" | "synthetic";
  retrievedAt: string;
  qualityFlags: string[];       // e.g. ["fill_value_removed:3"]
}
```

The engine **rejects** any observation whose `dataClass` is `"synthetic"` unless
`ALLOW_SYNTHETIC_FIXTURES=true` **and** the run is flagged `test: true`. A synthetic value can never
reach a user-facing result.

### 1.3 From the catalogue (`CropCatalogEntry`)

Per crop: season, sowing/harvest windows (ISO), `waterDemandClass` (`low|medium|high|null`),
`heatSensitivity` (`low|medium|high|null`), `isLegume`, `residueClass`, `sourceUrl`,
`evidenceQuality` (`high|medium|low`), `verified: boolean`.

Any parameter that is `null` or `verified === false` is treated as **unavailable** for scoring.

---

## 2. Data transformation pipeline

Order is fixed and each step is testable.

1. **Unit assertion.** Compare the source-declared unit against the expected unit per variable. Mismatch →
   throw `UnitMismatchError`, mark variable unavailable. No implicit conversion of unknown units.
   *Allowed conversions:* °C↔K (explicit, logged), mm/day↔mm (multiply by day count, logged).
2. **Fill-value removal.** POWER `-999` / `-999.0` → `null`. Count removed values in `qualityFlags`.
3. **Window alignment.** Intersect each candidate crop's sowing→harvest window with the planning window.
   A crop whose window has no overlap with the retrieved data range is *out of coverage*.
4. **Date coverage check.** Daily series must cover ≥90 % of the crop window's days; otherwise the
   variable is `partial` and the component is downgraded (§7).
5. **Aggregation.** Daily → per-window statistics (§4). Aggregations ignore `null` days and record
   `nValid` / `nExpected`.
6. **Normalisation.** Per-component raw values → 0–1 sub-scores (§5).
7. **Combination.** Weighted sum over available components only (§6–7).

---

## 3. Which NASA data feeds which component

| Component | Primary variables | Source | Data class |
|---|---|---|---|
| C1 Rainfall reliability | `PRECTOTCORR` daily; climatology `PRECTOTCORR` monthly | POWER | reanalysis |
| C2 Heat exposure | `T2M_MAX`, `T2M` | POWER | reanalysis |
| C3 Soil-health structure | none (catalogue attributes only) | PAU / CRS | reference |
| C4 Water demand vs supply | crop `waterDemandClass` + `PRECTOTCORR`, `GWETROOT` | POWER + catalogue | reanalysis + reference |
| C5 Frost risk (rabi only) | `T2M_MIN` | POWER | reanalysis |
| C6 Vegetation context | MODIS NDVI imagery | GIBS | observation |

**C6 is deliberately excluded from scoring.** NDVI at 250 m over a ~2 ha holding is a mixed pixel; using
it to rank a farmer's rotations would manufacture precision that does not exist. It is display-only.
This exclusion is a product decision recorded in [DECISIONS_LOG.md](DECISIONS_LOG.md) (D-07).

---

## 4. Indicator definitions

All computed over the **crop-specific window** for the candidate's kharif/rabi phase, for the target
season and each of up to 5 prior seasons.

### 4.1 Rainfall
| Indicator | Definition |
|---|---|
| `seasonRainMm` | Σ `PRECTOTCORR` over window (mm), counting only days with value ≥ 0 |
| `rainDays` | count(days with `PRECTOTCORR` ≥ 1.0 mm) |
| `longestDrySpellDays` | max run of consecutive days with `PRECTOTCORR` < 1.0 mm |
| `drySpellCount10` | count of runs ≥ 10 consecutive dry days |
| `normalRainMm` | Σ climatological monthly `PRECTOTCORR` × days-in-month for the window's months |
| `rainAnomalyPct` | (`seasonRainMm` − `normalRainMm`) / `normalRainMm` × 100, if `normalRainMm` > 0 |

### 4.2 Temperature
| Indicator | Definition |
|---|---|
| `meanT2M` | mean of daily `T2M` (°C) |
| `heatDays35` | count(days `T2M_MAX` ≥ 35 °C) |
| `heatDays40` | count(days `T2M_MAX` ≥ 40 °C) |
| `frostDays5` | count(days `T2M_MIN` ≤ 5 °C) — rabi only |

*Threshold justification:* 35 °C and 40 °C are **provisional operational thresholds**, not agronomic
optima. They are exposed in `engine.config.ts` as `{ provisional: true, note: "…" }` and shown in the UI
as "threshold chosen for this prototype; not a published crop-specific limit". No crop-specific cardinal
temperature is claimed until a PAU/PARC source is extracted (see AGRICULTURAL_EVIDENCE §5).

### 4.3 Soil wetness (modelled)
| Indicator | Definition |
|---|---|
| `meanGwetroot` | mean of daily `GWETROOT` (0–1) over window |
| `minGwetroot` | minimum daily `GWETROOT` |
| `wetnessTrend` | least-squares slope of seasonal-mean `GWETROOT` across up to 5 seasons (per season) |

`GWETROOT` is MERRA-2 **modelled root-zone wetness**, not SMAP, and not a measurement. Every display must
carry "modelled".

### 4.4 Radiation
`meanSolar` = mean `ALLSKY_SFC_SW_DWN` (MJ/m²/day) over window. Context only in v1 (no component).

---

## 5. Normalisation

Sub-scores are **relative to the scenarios in the current comparison**, not absolute. This is the honest
choice: we do not know what "good" rainfall is for a cotton season in Faisalabad, but we can say rotation
A's window is drier than rotation B's.

### 5.1 Min–max relative normalisation

For a component with raw values `v_i` across candidate scenarios `i`:

```
if max(v) == min(v):  sub_i = 0.5            // no discriminating information
else:                 sub_i = (v_i - min) / (max - min)
```

Then apply direction:

```
sub_i = direction === "higher_is_better" ? sub_i : 1 - sub_i
```

### 5.2 Ordinal normalisation (catalogue attributes)

For attributes with 3 classes (`low|medium|high`): `low → 0.0`, `medium → 0.5`, `high → 1.0`, then apply
direction. A `null` class makes the component unavailable for that scenario.

### 5.3 Categorical / boolean

Legume present → 1.0, absent → 0.0. Diversification (distinct crop genera in the rotation) →
`(distinct − 1) / 2`, capped at 1.0.

> Because normalisation is relative, **a scenario's index is only meaningful next to the others in the
> same run.** The API returns the whole set together and the UI never shows an index in isolation.

---

## 6. Components and weighting

### 6.1 Component definitions

| ID | Component | Raw measure | Direction | Farmer priority mapping |
|---|---|---|---|---|
| **C1** | Rainfall reliability | composite of `-|rainAnomalyPct|`, `-drySpellCount10`, `-longestDrySpellDays` | higher is better (less deficit/deviation) | `water` |
| **C2** | Heat exposure | `heatDays35` (+`heatDays40` weight 0.5) inside the crop window | lower is better | `climateResilience` |
| **C3** | Soil-health structure | legume phase + diversification + residue class | higher is better | `soilHealth` |
| **C4** | Water demand vs supply | crop `waterDemandClass` vs `meanGwetroot` and `rainAnomalyPct` | lower demand under drier conditions is better | `water` |
| **C5** | Frost risk (rabi only) | `frostDays5` | lower is better | `climateResilience` |

### 6.2 Weights — **PROVISIONAL**

These are starting values for a prototype, chosen so that a farmer's stated priority clearly moves the
result. They are **not** derived from agronomic literature, and must not be presented as such.

| Component | Base weight | Priority multiplier |
|---|---|---|
| C1 Rainfall reliability | 0.30 | × (0.5 + 1.0 × `w_water`) |
| C2 Heat exposure | 0.25 | × (0.5 + 1.0 × `w_climate`) |
| C3 Soil-health structure | 0.25 | × (0.5 + 1.0 × `w_soil`) |
| C4 Water demand vs supply | 0.15 | × (0.5 + 1.0 × `w_water`) |
| C5 Frost risk | 0.05 | × (0.5 + 1.0 × `w_climate`) |

Where `w_*` ∈ [0,1] and `w_water + w_soil + w_climate = 1` (validated server-side; all-zero rejected).

Effective weight:

```
w_eff_c = base_c × multiplier_c
W_c     = w_eff_c / Σ w_eff over available components
```

**Justification status:** `provisional`. Change control: any change requires a DECISIONS_LOG entry with
the reason and the affected tests. The UI displays a one-line note: *"Weighting is a prototype choice, not
an agronomic standard."*

### 6.3 Presets offered to the farmer

| Preset | water | soilHealth | climateResilience |
|---|---|---|---|
| Save water | 0.60 | 0.20 | 0.20 |
| Build soil | 0.20 | 0.60 | 0.20 |
| Weather-proof | 0.20 | 0.20 | 0.60 |
| Balanced | 0.34 | 0.33 | 0.33 |

Presets are also provisional but are transparent: the farmer sees the three sliders move.

---

## 7. Missing data and the evidence gate

### 7.1 Per-component availability

A component is **available** for a scenario only if:
- all its required observations exist with `value !== null`,
- coverage ≥ 90 % of expected days (else `partial` → treated as unavailable for scoring, reported in
  `limitations`),
- required catalogue attributes are `verified === true`.

Unavailable ⇒ `C_c = null` for that scenario. **Never 0.** A zero would silently penalise a scenario for
missing data, which is indistinguishable from a real bad result — the exact failure mode this project
exists to avoid.

### 7.2 Weight redistribution

When a scenario lacks component `c`, that weight is removed and the remaining weights renormalised **for
that scenario only**, and the run records `redistributed: [c]`. Because this changes comparability, the
result carries `comparabilityWarning: true` and a sentence naming the missing component.

### 7.3 Evidence gate (the refusal rule)

```
availableWeight = Σ W_c over available components
```

| Condition | Outcome |
|---|---|
| `availableWeight ≥ 0.60` **and** ≥ 3 components available | numeric index returned, `confidence: "moderate"` |
| `0.35 ≤ availableWeight < 0.60` | numeric index returned, `confidence: "low"`, prominent caveat |
| `availableWeight < 0.35` **or** < 2 components available | **`insufficient_evidence`** — no index, missing list returned |

Additionally, if **every** candidate returns `insufficient_evidence`, the whole result is
`insufficient_evidence` and the UI explains which sources failed.

### 7.4 "Not meaningful difference"

If two scenarios' indices differ by < 5 points (provisional constant `MIN_MEANINGFUL_DELTA`), the engine
labels the pair `difference_not_meaningful` and the explanation says so instead of implying a winner.
The ranking still shows order, but the UI must not frame it as a recommendation.

---

## 8. Uncertainty handling

Each scenario result carries:

| Field | Meaning |
|---|---|
| `index` | 0–100 comparative index, or `null` |
| `confidence` | `moderate` / `low` / `insufficient_evidence` |
| `evidenceCoverage` | `availableWeight` (0–1) |
| `components[]` | per-component `{id, sub, weight, available, note}` |
| `dataClasses` | which classes contributed (e.g. `["reanalysis","reference"]`) |
| `spatialCaveat` | "Values describe the ~0.5° MERRA-2 cell around your farm, not your field." |
| `limitations[]` | machine-readable reasons (`partial_coverage`, `missing_soil`, …) |

**Three uncertainty sources are surfaced, not averaged away:**
1. **Resolution** — every environmental value is coarser than a farm.
2. **Model** — POWER is reanalysis; wetness is modelled.
3. **Missingness** — soil often unknown; some components unavailable.

---

## 9. Explanation generation

Deterministic templates over structured findings; no generative AI at runtime.

### 9.1 Template inputs
`componentFindings[]` each with `{component, direction, magnitude, values, sources}`, plus
`risks[]`, `missing[]`, `cannotConclude[]`.

### 9.2 Templates (examples)

- **Supporting:** *"{crop} shows {advantage} during its {season} window: {value} {unit} against
  {baselineValue} {unit} for your current rotation ({sourceName}, {dateRange})."*
- **Risk:** *"{crop}'s window contains {n} days at or above 35 °C, which is {comparison} your current
  rotation."*
- **Missing:** *"Soil texture and pH were not provided and are unavailable at this location, so the
  soil-health comparison uses rotation structure only."*
- **Cannot conclude:** *"Field Shift cannot say whether this rotation would raise yield or income; no
  local yield-response evidence is included."*
- **Refusal:** *"There is not enough evidence to compare these rotations. Rainfall and wetness data could
  not be retrieved, and soil information is unavailable."*

### 9.3 Ordering rule
`supporting` → `risks` → `missing` → `cannotConclude`. Risks are never omitted, even when a scenario ranks
first. A first-place scenario with a serious risk must show it above the fold.

---

## 10. Output schema

```ts
interface EngineResult {
  runId: string;
  inputEcho: { season: string; planningYear: number; priorities: Priorities; point: [number, number] };
  status: "ok" | "insufficient_evidence" | "partial";
  indexLabel: "comparative index (0-100, relative to options shown)";
  weighting: { provisional: true; components: Record<string, number>; note: string };
  scenarios: ScenarioResult[];
  ranking: string[];                  // scenario ids, best first (empty if insufficient)
  evidenceCoverage: number;           // min across scenarios
  globalLimitations: string[];
  dataSources: SourceRef[];           // full provenance for the evidence panel
  generatedAt: string;
}

interface ScenarioResult {
  scenarioId: string;
  label: string;                      // e.g. "Wheat - Maize"
  isBaseline: boolean;
  index: number | null;
  confidence: "moderate" | "low" | "insufficient_evidence";
  evidenceCoverage: number;
  components: ComponentResult[];
  explanation: {
    supporting: string[];
    risks: string[];
    missing: string[];
    cannotConclude: string[];
  };
  limitations: string[];
  provenance: SourceRef[];            // per-scenario sources used
  whyIncluded: string;                // citation-backed reason (§7.3 PRD)
}

interface ComponentResult {
  id: "C1"|"C2"|"C3"|"C4"|"C5";
  label: string;
  sub: number | null;
  weight: number;
  available: boolean;
  raw: Record<string, number | null>;
  unit?: string;
  dataClass?: string;
}
```

---

## 11. Worked example (illustrative arithmetic only)

**Not real data** — values below are constructed to demonstrate the arithmetic; they must never be
shown to a user. Two kharif candidates, water-priority profile.

```
Candidate A (Wheat - Cotton):  rainAnomalyPct = -35 %, drySpellCount10 = 2, heatDays35 = 48
Candidate B (Wheat - Maize):   rainAnomalyPct = -32 %, drySpellCount10 = 2, heatDays35 = 41
```

C1 raw composite (negative deficit + negative dry spells):
`A: -(0.35) - 0.2*2 = -0.75`; `B: -(0.32) - 0.2*2 = -0.72`
(min–max) → `A: 0.0`, `B: 1.0` (higher composite better).

C2 `heatDays35`: `A: 48`, `B: 41`, lower better → `A: 0.0`, `B: 1.0`.

With `w_water = 0.6, w_soil = 0.2, w_climate = 0.2`, base weights C1 .30, C2 .25:
`w_eff(C1) = .30 × 1.10 = .33`; `w_eff(C2) = .25 × 0.70 = .175`; … normalised across available
components. B outranks A on both available components, so B's index > A's.

The point of the example is the *shape*: relative, transparent, and reproducible. Final numbers come from
real observations at request time.

---

## 12. Test cases (must all pass before Phase 3 exits)

| # | Case | Expected |
|---|---|---|
| T1 | All sources return valid data for 4 candidates | `status:"ok"`, 4 indices, ranking length 4, `confidence:"moderate"` |
| T2 | POWER returns `-999` for every precipitation day | precipitation component unavailable; not 0; other components scored |
| T3 | POWER returns no data / 500 | `status:"insufficient_evidence"` if availableWeight < 0.35; explicit reason; no fabricated numbers |
| T4 | POWER unit for `T2M` changes from `C` to `K` | `UnitMismatchError`; variable unavailable; logged; no silent conversion |
| T5 | Location outside coverage (e.g. 0 N, 0 E returns fill values) | out-of-coverage error; no index |
| T6 | SoilGrids returns `null` for all depths | soil component unavailable; `missing` mentions soil; scenario still scoreable on C1/C2/C3 |
| T7 | Farmer changes priority from "save water" to "build soil" | ranking changes when soil evidence is available; explanation text changes |
| T8 | Candidate crop has `waterDemandClass: null` | C4 unavailable; `whyIncluded` still explains inclusion; no default class used |
| T9 | Only 1 candidate has ≥3 available components | that candidate scored; others `insufficient_evidence`; comparability warning |
| T10 | Two candidates differ by 3 index points | `difference_not_meaningful`; UI must not name a winner |
| T11 | Priorities all zero | `ValidationError` before engine runs |
| T12 | Priorities do not sum to 1 | normalised server-side; echoed values sum to 1 |
| T13 | Observation `dataClass: "synthetic"` with `test:false` | rejected with error; never in output |
| T14 | Date range outside POWER coverage (1975) | coverage error; explicit message |
| T15 | Partial coverage: 70 % of window has valid days | component unavailable, `partial_coverage` limitation recorded |
| T16 | Same input twice | identical JSON except `runId`/`generatedAt` (determinism) |
| T17 | Rabi season | C5 present; kharif → C5 absent from weights, weights renormalised |
| T18 | Empty candidate list | `ValidationError` |

---

## 12.1 Phase 3 implementation status (what actually exists)

Implemented in `apps/api/src/engine/` as a pure module, exercised by 30 tests (`test/engine.test.ts`, E01–E20).

| Spec area | Status |
|---|---|
| Pure `compareRotations(input)` — no I/O, no clock, no randomness | ✅ implemented (`engine/compare.ts`) |
| §2 pipeline: unit assertion → fill removal → window alignment → coverage → aggregation | ✅ unit/fill/coverage done upstream (Phase 2) and re-checked here (≥90% per variable) |
| C1 rainfall composite | ✅ implemented; climatology term used when available, otherwise `status: "partial"` |
| C2 heat exposure | ✅ `heatDays35 + 0.5 × heatDays40` |
| C3 soil-health structure | ✅ legume + diversification (+ residue when documented) |
| C4 water demand vs supply | ✅ implemented, but **unavailable with the live catalogue** because every `water_demand_class` is NULL |
| C5 frost risk (rabi only) | ✅ implemented; excluded from kharif weights |
| §5 relative min–max normalisation | ✅ implemented across the scenarios in one run |
| §6 provisional weights and priority multipliers | ✅ implemented exactly as tabulated |
| §7 evidence gate (0.35 / 0.60, component floor) | ✅ implemented; refusal is `insufficient_evidence` with `index: null` |
| §7.4 `MIN_MEANINGFUL_DELTA = 5` | ✅ implemented as `pairwise[].meaningful` |
| §9 deterministic explanations | ✅ implemented, ordered supporting → risks → missing → cannotConclude |
| `analysis_runs` persistence (`GET /runs/:id`) | ⛔ **not implemented** — the engine returns a `runId` but nothing is stored yet |
| Multi-season climatology trend (§4.3 `wetnessTrend`) | ⛔ deferred: one planning cycle is evaluated, not five prior seasons |
| `previousCropId` rotation-legality check | ⛔ echoed only, not enforced |

### Implementation rules the spec left open (now fixed and documented)

1. **Cycle anchoring.** A rotation is evaluated over the planning season's phase plus the immediately
   preceding window of the other season: rabi Y uses rabi Y + kharif Y; kharif Y uses kharif Y + rabi Y−1.
   Without this the two phases of a rabi-anchored comparison would fall in different calendar years with no
   data on one side. Recorded as D-20.
2. **Cross-phase aggregation.** Rainfall totals, dry-spell counts, heat-day counts and frost days are summed
   across the rotation's phases; wetness is averaged across them; per-variable coverage is the **minimum**
   across phases, so one well-covered phase cannot hide a gap in the other.
3. **C1 arithmetic.** `composite = −|rainAnomalyPct| / 100 − 0.2 × drySpellCount10` (the worked example in
   §11). When the climatological normal is unavailable the composite falls back to
   `−0.2 × drySpellCount10 − 0.1 × longestDrySpellDays` and the criterion is marked `partial` with the
   missing input named — it is never silently presented as the full rule.
4. **C3 composition.** `(legume + diversification + residueClass) / 3` when residue is documented for every
   crop, otherwise `0.5 × legume + 0.5 × diversification` and `status: "partial"`. `diversification` uses
   distinct crop ids as the species proxy, because the catalogue has no genus column.
5. **C4 arithmetic** (spec gave direction but no formula): `demandOrdinal(max demand class) + (1 − meanGwetroot)`,
   lower is better. Available only when every crop in the rotation has a verified demand class **and** the
   modelled wetness series is present. With today's NULL classes it is always unavailable, and says so.
6. **C2 crop sensitivity.** `heat_sensitivity` is NULL for every crop, so no crop-specific cardinal
   temperature is applied; the operational 35/40 °C thresholds are used and labelled provisional.
7. **Source separation.** Environmental criteria carry `sourceId: nasa_power` / `dataClass: reanalysis`;
   C3 carries `sourceId: crop_catalog` / `dataClass: reference`. No criterion mixes the two.

---

## 13. Deliberate non-features

| Not implemented | Why |
|---|---|
| Machine-learning ranking | No labelled local outcome data exists; would be unverifiable |
| LLM narrative | Non-reproducible; violates traceability |
| Forecast-based scoring | No verified forecast source integrated |
| Yield/economics | No localised, citable response functions |
| Absolute suitability classes | Would imply cross-farm comparability that does not exist |
| NDVI in scoring | Mixed pixels at 250 m over 2 ha fields |
| Yield or income prediction | Still excludes any response function; the engine says so in every result |
| Persisted runs | `analysis_runs` exists in the schema but the Phase 3 engine does not write to it (D-24) |
