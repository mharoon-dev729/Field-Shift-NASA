# Product Requirements Document — Field Shift

**Version:** 1.0 (Phase 1)
**Date:** 2026-11-14
**Author:** Individual entrant, NASA Space Apps Challenge 2026
**Related:** [CHALLENGE_REQUIREMENTS.md](CHALLENGE_REQUIREMENTS.md) · [DATA_SOURCE_REGISTER.md](DATA_SOURCE_REGISTER.md) · [AGRICULTURAL_EVIDENCE.md](AGRICULTURAL_EVIDENCE.md) · [DECISION_ENGINE_SPEC.md](DECISION_ENGINE_SPEC.md)

---

## 7.1 Product overview

**Field Shift is a crop-rotation decision aid for a specific farm in Faisalabad district, Punjab,
Pakistan.** A farmer enters where their land is, what they grew this season and last, and what they
care about most — water, soil health, or resilience to a harsher climate. Field Shift then pulls real
NASA Earth-observation and modelled-climate data for that area, lines it up against the crop calendar
of each candidate rotation, and shows a side-by-side comparison that explains its reasoning, names its
uncertainties, and links every number to its source.

The distinguishing feature is not the UI. It is the **discipline**: Field Shift refuses to recommend
when the evidence cannot support a comparison. Every result carries the three questions a farmer
actually needs answered — *what do the observations say, what does that imply for each option, and
what is still unknown?*

**One sentence:** *Field Shift turns NASA environmental data into an explained, source-linked
comparison of crop rotations for one farm — and says so plainly when the data isn't good enough to
decide.*

**What it is not:** a weather app, a yield predictor, an AI oracle, or a financial planner.

---

## 7.2 Problem statement

A wheat–cotton farmer near Faisalabad has to commit to next season's crop months before the season
starts. The information that would help — how the last five seasons actually behaved (rain timing, heat
spells, dry gaps, soil wetness), and how those conditions interact with the water demand and calendar of
each rotation they could choose — exists, but it is scattered across:

- NASA archives that need Earthdata logins and HDF5 decoding;
- Punjab Agriculture Department PDFs with district statistics and crop calendars;
- their own memory of last year;
- and the advice of whoever is nearby.

Meanwhile the pressures named in the challenge brief are concrete here: a monsoon that arrives late or
all at once, canal water that is rationed by rotation (warabandi), groundwater that has to be pumped,
summer temperatures that touch the mid-40s °C, and soils that are alkaline and low in organic matter.

**The gap is not data. It is translation.** Nobody is converting NASA's gridded observations into
"This area's wheat window had 14 dry days in a row in March, twice in five years" and then comparing
that across the rotations a farmer can actually choose.

---

## 7.3 Target users

### Primary persona — "Asad", 34, owner-cultivator, 12 acres, Faisalabad district

- Grows wheat every rabi; alternates cotton and maize in kharif depending on water and last year's price.
- Has a smartphone, intermittent connectivity, and reads Urdu more comfortably than English.
- Knows his soil is "hard and whitish in places" but does not know pH or texture values.
- Does **not** want a satellite dashboard. Wants to know: *if I switch from cotton to maize this
  kharif, what changes for my water and my soil — and how sure are you?*
- Decision window: **April–May** for kharif choice, **October–November** for rabi choice.

### Secondary users

| User | Need | How Field Shift serves them |
|---|---|---|
| Extension officer / agri graduate | A defensible, citable comparison to discuss with farmers | Source register + "what this cannot conclude" panel |
| Hackathon judge / reviewer | Proof the NASA data is real and the logic is transparent | Evidence panel, raw observation table, engine spec |
| Researcher / student | A reproducible method | Deterministic engine + open documentation |

### Explicitly not a user
A large commercial farm with its own agronomist and variable-rate machinery. Field Shift's data
resolution cannot serve precision agriculture, and it must not pretend to.

---

## 7.4 Product goals

| ID | Goal | Success measure |
|---|---|---|
| G1 | Complete the journey end-to-end for the pilot district with real NASA data | 3+ rotations compared, all values sourced, no placeholder data on screen |
| G2 | Make the evidence legible to a non-specialist | Every indicator shows a plain-language sentence + a source line |
| G3 | Be honest about resolution and uncertainty | Reanalysis/coarse data labelled at the point of use; unknown soil shown as unknown |
| G4 | Let farmer priorities change the answer | Changing priority weights changes ranking *and* explanation text |
| G5 | Degrade safely | Any source failure yields "insufficient evidence" for the affected scenario, never a silent zero |
| G6 | Be maintainable by one person | Shared TypeScript types, one API, one DB, unit-tested engine |

---

## 7.5 Non-goals

Field Shift will **not**, in this version:

1. Predict yield, income, or profit. No crop is labelled "better yielding".
2. Replace an agronomist, extension officer, or soil test.
3. Claim to measure a specific field's soil moisture, temperature, or rainfall from satellite data. All
   environmental values are attributed to the surrounding grid cell/area.
4. Provide weather forecasts. POWER data is historical/reanalysis. If a forecast is shown at all, it
   must be a separately-verified forecast source, clearly labelled — and none is integrated now.
5. Claim guaranteed water savings or soil-health improvement.
6. Recommend pesticide, fertiliser dose, variety choice, or sowing date as prescriptive instructions.
7. Use USDA/US-only datasets as if they were global.
8. Model economics from foreign (US) price data.
9. Score a rotation when key evidence is missing; it returns *insufficient evidence* instead.
10. Support arbitrary global locations in v1 — one pilot district, honestly done, beats global coverage
    done carelessly. (Architecture keeps the door open.)

---

## 7.6 User journey

| # | Step | Screen | What the user does | What the system does | Failure behaviour |
|---|---|---|---|---|---|
| 1 | Open | Landing | Reads a 40-word explanation and one worked example | Nothing fetched | — |
| 2 | Understand | Landing | Reads the honesty statement: coarse data, no guarantees, independent project | — | — |
| 3 | Select location | Location | Taps a point on a map inside Faisalabad district, or picks a tehsil | Validates coordinates are inside the pilot boundary | Outside pilot → explained refusal, no fake data |
| 4 | Farm details | Farm | Season (rabi/kharif), farm size (optional), irrigation source | Stores nothing personally identifying | Blank size allowed |
| 5 | Crops | Crops | Picks current crop, previous crop, and season | Maps choices to catalogue entries with calendar + evidence | Crop without calendar → not offered |
| 6 | Soil (optional) | Soil | Optionally enters texture/pH/OM, or taps "I don't know" | If unknown, offers clearly-labelled SoilGrids prediction with uncertainty, or "unavailable" | Null soil stays null; never defaulted |
| 7 | Priorities | Priorities | Allocates importance across water / soil health / climate resilience (sliders, 3 presets) | Captures weights 0–1, normalises | All zero → blocked with explanation |
| 8 | Retrieve evidence | Loading | Waits (progress shown per source) | Fetches POWER daily + climatology, GIBS layer URLs, SoilGrids; validates and normalises | Per-source status: ok / partial / failed, with reason |
| 9 | Compare | Comparison | Reads ranked rotation cards | Runs deterministic engine over candidate rotations | If <2 scenarios scoreable → insufficient-evidence state |
| 10 | Explain | Scenario detail | Opens a rotation to see why | Shows supporting indicators, risks, missing data, what cannot be concluded | — |
| 11 | Review sources | Evidence | Checks provenance | Lists every source: URL, variable, unit, date range, resolution, retrieval time | Stale cache clearly dated |
| 12 | Save/export | Any | Copies a shareable summary (optional) | Generates a self-contained report with sources | Export failure never loses the on-screen result |

**Journey length target:** ≤ 6 screens to first comparison; ≤ 90 s on a mid-range phone with warm cache.

---

## 7.7 Functional requirements

### FR-1 Location selection
- FR-1.1 Accept a map point (lat/lon) or a tehsil selection within the pilot district.
- FR-1.2 Reject points outside the pilot boundary with an explicit reason; offer the nearest valid point.
- FR-1.3 Validate ranges: latitude −90…90, longitude −180…180; reject NaN/strings.
- FR-1.4 Display the coordinates and the POWER grid cell attributed to them, so the user sees the
  spatial unit being used.

### FR-2 Farm profile
- FR-2.1 Season (rabi | kharif), required.
- FR-2.2 Farm size in acres, optional; if given, validate 0.1–5000 and use only for per-acre framing,
  never for precision claims.
- FR-2.3 Irrigation source (canal | tubewell | both | rainfed), required for water-priority logic.
- FR-2.4 No name, phone, email or other personal identifier is collected in v1.

### FR-3 Crop information
- FR-3.1 Current crop (from catalogue), previous crop (from catalogue or "none / fallow").
- FR-3.2 Catalogue entries must carry: season, sowing window, harvest window, water-demand class,
  rotation notes, source URL, evidence quality. Entries missing a calendar are not selectable.
- FR-3.3 Show the cited window next to each crop name, not hidden behind an info icon.

### FR-4 NASA data retrieval
- FR-4.1 Server-side retrieval of POWER daily (season window + 5 prior seasons) and POWER climatology.
- FR-4.2 Server-side retrieval of ISRIC SoilGrids for the point (0–5, 5–15, 15–30 cm).
- FR-4.3 Build GIBS tile URLs for SMAP soil moisture, IMERG precipitation, MODIS NDVI for user-selected
  dates; the UI shows imagery with attribution and "visual context only — not used in the comparison".
- FR-4.4 Record retention (cache) keyed by rounded coordinates + variable + date range, with fetch time.
- FR-4.5 Hard timeouts (POWER 20 s, SoilGrids 15 s) and one retry with jitter.
- FR-4.6 Never substitute synthetic values at runtime.

### FR-5 Environmental indicators
Compute only from validated inputs, each returning value + unit + window + source id (or `null`):
- FR-5.1 Season rainfall total (mm) and number of rain days (≥1 mm).
- FR-5.2 Longest dry spell within the crop's critical window (consecutive days <1 mm).
- FR-5.3 Heat exposure: days with T2M_MAX ≥ 35 °C and ≥ 40 °C (thresholds exposed as config, sourced
  or labelled provisional).
- FR-5.4 Mean/min/max temperature for the window; count of days T2M_MIN ≤ 5 °C (frost proxy).
- FR-5.5 Modelled root-zone soil wetness (GWETROOT) seasonal mean and trend across 5 seasons.
- FR-5.6 Solar radiation mean (MJ/m²/day) for the window.
- FR-5.7 Climatological normal rainfall for the same calendar window (2001–2025) and the anomaly (%).
- FR-5.8 Soil context: clay/sand/soc/pH from SoilGrids with an explicit `predicted: true` flag and
  `null` when unavailable.

### FR-6 Data validation
- FR-6.1 Reject responses with POWER `fill_value` (−999) treated as numbers; convert to `null` and count.
- FR-6.2 Reject unit changes: expected units per variable are asserted against the response's own
  `parameters` metadata; mismatch → source marked invalid, not silently converted.
- FR-6.3 Reject a point whose POWER response geometry differs from the request by more than its grid
  tolerance (±0.625° lon, ±0.5° lat).
- FR-6.4 Reject date ranges outside documented coverage (POWER daily from 1980; climatology 2001–2025).
- FR-6.5 SoilGrids: `null` mean → `unknown`, never 0; invalid depth labels are a developer error surfaced
  in tests.
- FR-6.6 Every rejected value is logged (no secrets) and surfaced in the evidence panel as a data gap.

### FR-7 Crop-rotation scenarios
- FR-7.1 Always include the farmer's current rotation as the baseline, labelled "your current practice".
- FR-7.2 Offer 2–4 alternatives built from the documented Punjab rotation set (see AGRICULTURAL_EVIDENCE).
- FR-7.3 Each candidate must state *why it is included* (e.g. "documented Punjab rotation; legume phase
  fixes nitrogen" with citation).
- FR-7.4 Do not offer a rotation whose crops lack calendars or whose windows are outside data coverage.

### FR-8 Decision-support calculations
- FR-8.1 Deterministic, pure function of (profile, priorities, observations, catalogue weights).
- FR-8.2 Every component score carries its own evidence count; a component with no evidence is
  `null`, not 0.
- FR-8.3 Priority weights normalised to sum 1; a `null` component is redistributed across available
  components and the UI says so.
- FR-8.4 Output is a bounded comparative index 0–100 per scenario with an explicit label:
  *"comparative index, not a probability of success"*.
- FR-8.5 Evidence gate: if fewer than N of the required components are available, the scenario is
  returned as `insufficient_evidence` with the missing list. (N and components per the engine spec.)

### FR-9 Results explanation
- FR-9.1 Per scenario: supporting indicators (with numbers), risks, missing information, and what the
  system cannot conclude.
- FR-9.2 Explanation text is generated from templates over structured findings — not free-form LLM prose
  — so it is reproducible and auditable.
- FR-9.3 Ranking differences vs baseline are stated in words, including when the difference is small
  enough to be "not meaningful given the data".

### FR-10 Evidence citations
- FR-10.1 Each observation carries: source id, provider, product, variable, unit, date range, spatial
  resolution, retrieval timestamp, and URL.
- FR-10.2 The evidence panel is reachable in one tap from every result.
- FR-10.3 Reanalysis and imagery products are labelled by data class (live observation / historical /
  reanalysis / forecast / synthetic).

### FR-11 Error handling
- FR-11.1 Partial success is a first-class state.
- FR-11.2 Network and upstream errors produce actionable text ("NASA POWER did not respond; your
  comparison excludes rainfall-based indicators").
- FR-11.3 No stack traces, no upstream HTML, no secrets in error payloads.

### FR-12 Data freshness
- FR-12.1 Show the retrieval time and the newest observation date for each source.
- FR-12.2 POWER lags real time; the UI must not imply "today's weather".
- FR-12.3 Cached data older than 7 days is re-fetched; the UI shows the age.

### FR-13 Optional saved reports
- FR-13.1 Copy/export a self-contained summary (text/PDF-ready HTML) including sources and disclaimers.
- FR-13.2 Persisted analyses are anonymous, contain no personal identifiers, and are retrievable by
  opaque id only.

---

## 7.8 Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | First comparison p95 ≤ 8 s warm, ≤ 20 s cold on a broadband connection; POWER+SoilGrids fetched in parallel; UI shows progress per source. Bundle ≤ 250 kB gzip JS for the first route. |
| **Reliability** | Any single upstream failure degrades gracefully; no white screen; deterministic engine so results are reproducible from stored observations. |
| **Security** | Service-role Supabase key server-side only; `.env` gitignored; server-side validation of every field; restrictive CORS allowlist; no secrets or PII in logs; RLS enabled on every table. |
| **Accessibility** | WCAG 2.2 AA target: keyboard-reachable controls, visible focus, ≥4.5:1 text contrast, form labels, no colour-only encoding of ranking, `prefers-reduced-motion` respected. |
| **Responsive** | Mobile-first 360 px → desktop; single-column comparison on phones, table on wide screens. |
| **Maintainability** | TypeScript strict; shared types between web and API; engine isolated in pure modules with unit tests; one documented source-adapter interface. |
| **Data integrity** | Units and provenance stored with every observation; no destructive overwrite of cached observations; migrations versioned. |
| **API failure handling** | Timeouts, one retry with jitter, circuit breaker per source, structured error envelope `{error:{code,message,details}}`. |
| **i18n readiness** | English v1; user-facing strings centralised so Urdu can be added without touching engine code. |
| **Privacy** | No accounts in v1; no third-party analytics/trackers. |

---

## 7.9 MVP scope

### Must have (the vertical slice — must all work)
1. Pilot-district map/location picker with boundary validation.
2. Farm form: season, current crop, previous crop, irrigation, optional soil.
3. Priority weighting (water / soil health / climate resilience) with 3 presets.
4. POWER daily + climatology retrieval, validation, normalisation, caching.
5. Indicator computation (rainfall, dry spell, heat days, frost days, wetness, radiation, anomaly).
6. SoilGrids lookup with honest null handling.
7. Candidate rotation generation (≥3, incl. baseline) from a cited catalogue.
8. Deterministic comparison engine with evidence gate.
9. Comparison screen + per-scenario explanation (supporting / risks / missing / cannot conclude).
10. Evidence panel with full provenance and data-class labels.
11. GIBS imagery for SMAP / IMERG / MODIS NDVI as labelled visual context.
12. Partial-failure UX everywhere.
13. Supabase schema + migrations for sources, catalogue, cached observations, analyses.
14. Unit + API tests for engine, adapters and validation.

### Should have
- Shareable analysis permalink (opaque id).
- PDF-ready export.
- 5-season wetness trend chart with explicit "modelled" labelling.
- Urdu string table (structure only, translations later).

### Could have
- Tehsil-level area profiles instead of raw coordinates.
- Farmer-contributed rainfall note (validated as user-reported, never merged into NASA series).
- Direct SMAP/IMERG numeric series once Earthdata credentials and HDF5 decoding are set up.

### Not in the MVP
- Accounts/auth, saved farms, multi-user sharing.
- Yield, income or market modelling.
- Weather forecasts.
- Global location support.
- Satellite image classification or field-boundary delineation.
- LLM-generated recommendations.
- Mobile native apps.

---

## 7.10 Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| POWER reanalysis is over-interpreted as farm measurement | High | Credibility | Label at point of use; engine ignores sub-grid variation; docs repeat it |
| Only one real numeric source (POWER) makes comparisons thin | Medium | Depth | Add SoilGrids + crop-window alignment; be explicit that more sources are credential-gated |
| Provisional weights mistaken for science | High | Credibility | Weights in config with `provisional: true`; UI banner; decisions log entry |
| Crop parameter gaps (water demand) force guesses | High | Integrity | Missing parameter → component `null` → evidence gate; never default |
| Scope creep into yield/economics | Medium | Delivery | Non-goals restated in PRD + review checklist |
| SoilGrids nulls at the user's point | Medium | UX | Explicit "soil unavailable" state; farmer-entered value optional |
| Monsoon cloud cover defeats imagery | High | Visual only | Imagery is context, not evidence; date picker shows available dates |

---

## 7.11 Open questions (to resolve during Phase 2)

1. Which POWER parameter is the most defensible "soil moisture" proxy for the comparison —
   `GWETROOT`, `GWETPROF`, or the SMAP surface product? Decision needed before engine wiring.
2. Exact PAU/PARC-sourced water-demand classes for wheat, cotton, rice, maize, mungbean — currently
   `TO-VERIFY` (see AGRICULTURAL_EVIDENCE.md §5).
3. Whether the pilot boundary should be the district or a smaller canal command area for cleaner
   messaging.
4. Whether to accept Urdu numerals/dates in inputs (deferred).
