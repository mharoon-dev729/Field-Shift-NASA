# API Contract — Field Shift

**Version:** 1.0 (Phase 1) · Base path: `/api/v1` · Content type: `application/json`
**Source of truth for types:** `packages/shared/src/schemas.ts` (zod). This document and those schemas must
not diverge; a mismatch is a bug in whichever changed first.

---

## 0. Conventions

- **Validation:** every request is parsed with a strict zod schema. Unknown fields → `400 VALIDATION_ERROR`.
- **Errors** always use one envelope:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "human readable",
               "details": { "field": "latitude", "issue": "must be between -90 and 90" } } }
  ```
- **Error codes:** `VALIDATION_ERROR` (400), `OUT_OF_COVERAGE` (422), `INSUFFICIENT_EVIDENCE` (200 with
  `status` field — see §4), `SOURCE_UNAVAILABLE` (502), `SOURCE_INVALID_RESPONSE` (502),
  `RATE_LIMITED` (429), `NOT_FOUND` (404), `INTERNAL` (500).
- **Time:** all timestamps ISO-8601 UTC. Dates `YYYY-MM-DD`.
- **Auth:** none in v1. No endpoint requires a token; no endpoint accepts credentials from the client.
- **Caching:** `Cache-Control: no-store` on all personalised responses; `public, max-age=3600` allowed on
  `/sources` and `/crops` (static catalogue).
- **Idempotency:** all endpoints are GET except `/compare` (POST) and `/runs` (POST), which are pure and
  side-effect-limited to storing an anonymous run.

---

## 1. `GET /api/v1/health`

Liveness + dependency readiness.

**Response 200**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "time": "2026-11-14T09:00:00Z",
  "dependencies": {
    "database": { "status": "ok", "latencyMs": 12 },
    "nasa_power": { "status": "ok", "lastChecked": "2026-11-14T08:59:00Z" },
    "soilgrids": { "status": "degraded", "lastChecked": "2026-11-14T08:58:00Z" }
  }
}
```
`status`: `ok` | `degraded` (a non-critical dependency down) | `down` (DB unreachable → 503).

---

## 2. `GET /api/v1/pilot`

Pilot region metadata, so the client does not hardcode geography.

**Response 200**
```json
{
  "id": "faisalabad-pk",
  "name": "Faisalabad district",
  "province": "Punjab",
  "country": "Pakistan",
  "bbox": { "south": 30.75, "west": 72.45, "north": 31.95, "east": 73.75 },
  "anchor": { "lat": 31.4187, "lon": 73.0791 },
  "seasons": ["rabi", "kharif"],
  "disclaimer": "Independent project. Not affiliated with or endorsed by NASA.",
  "notes": [
    "Environmental values describe the ~0.5 deg NASA POWER cell around the farm, not the field.",
    "Rice is a minority kharif practice in this district; rice-wheat is offered because it is a documented Punjab rotation."
  ]
}
```

---

## 3. `GET /api/v1/crops`

Cited crop catalogue.

**Query:** `season` (optional, `rabi|kharif`), `includeUnverified` (default `false`).

**Response 200**
```json
{
  "crops": [
    {
      "id": "wheat",
      "name": "Wheat",
      "localName": "Gandum",
      "season": "rabi",
      "sowingWindow": { "start": "2026-11-01", "end": "2026-11-20" },
      "harvestWindow": { "start": "2027-04-01", "end": "2027-05-05" },
      "waterDemandClass": null,
      "heatSensitivity": null,
      "isLegume": false,
      "residueClass": null,
      "selectable": true,
      "verified": true,
      "sources": [
        { "title": "AARI wheat variety sowing windows", "url": "https://agripunjab.punjab.gov.pk/aari-cvwheat", "quality": "high" },
        { "title": "CRS Harvesting Calendar Rabi 2020", "url": "https://agripunjab.gov.pk/system/files/Calendar%20YES%20Rabi%202020.pdf", "quality": "high" }
      ],
      "limitations": ["Windows are district/province recommendations, not this farm's dates."]
    }
  ]
}
```
`selectable: false` when a required calendar is missing. `waterDemandClass: null` is intentional and must
not be replaced with a default (engine treats it as unavailable).

---

## 4. `GET /api/v1/evidence`

Environmental evidence for a point and date range. This is the traceable core.

**Query**
| Param | Type | Required | Validation |
|---|---|---|---|
| `lat` | number | yes | −90…90, must be inside pilot bbox |
| `lon` | number | yes | −180…180, inside pilot bbox |
| `season` | enum | yes | `rabi` \| `kharif` |
| `year` | integer | yes | 1980…current |
| `cropIds` | csv string | no | subset of catalogue ids |

**Response 200**
```json
{
  "point": { "requested": [31.4187, 73.0791], "resolvedGridPoint": [31.419, 73.079], "elevationM": 182.92 },
  "window": { "start": "2026-04-01", "end": "2026-11-15", "days": 229 },
  "sources": [
    {
      "id": "nasa_power",
      "provider": "NASA LaRC POWER",
      "product": "Daily point (MERRA-2 based)",
      "url": "https://power.larc.nasa.gov/",
      "dataClass": "reanalysis",
      "spatialResolution": "0.5 x 0.625 deg",
      "retrievedAt": "2026-11-14T09:00:02Z",
      "status": "ok"
    }
  ],
  "observations": [
    {
      "variable": "PRECTOTCORR", "unit": "mm/day", "value": 428.6,
      "aggregation": "sum", "windowStart": "2026-04-01", "windowEnd": "2026-11-15",
      "sourceId": "nasa_power", "dataClass": "reanalysis", "nValid": 229, "nExpected": 229,
      "qualityFlags": []
    }
  ],
  "indicators": [
    { "id": "seasonRainMm", "value": 428.6, "unit": "mm", "label": "Season rainfall (area)" },
    { "id": "longestDrySpellDays", "value": 27, "unit": "days", "label": "Longest dry spell" },
    { "id": "heatDays35", "value": 61, "unit": "days", "label": "Days at or above 35 C" }
  ],
  "imagery": [
    { "layer": "SMAP_L3_Passive_Enhanced_Day_Soil_Moisture", "date": "2026-06-02",
      "tileUrlTemplate": "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/…/{z}/{y}/{x}.png",
      "attribution": "NASA GIBS / NSIDC DAAC", "note": "Visual context only; not used in the comparison." }
  ],
  "limitations": [
    "POWER values are modelled (MERRA-2), not measurements at the farm.",
    "Imagery is coarse relative to a smallholding and is not used for scoring."
  ]
}
```

**Errors**
- `400 VALIDATION_ERROR` — bad lat/lon/year, or `year` outside coverage.
- `422 OUT_OF_COVERAGE` — point outside the pilot bbox, with `details.nearestValidPoint`.
- `502 SOURCE_UNAVAILABLE` — every source failed (partial failure returns 200 with per-source `status`).
- `502 SOURCE_INVALID_RESPONSE` — units/shape mismatch; `details.variable`, `details.expectedUnit`, `details.receivedUnit`.

---

### 4.1 Implementation status (Phase 2) and the exact response shape

Implemented in `apps/api/src/routes/evidence.ts` and validated by `evidenceQuerySchema`. Field names in the
real response are camelCase and slightly richer than the illustrative example above:

| Area | Actual behaviour |
|---|---|
| `request` | echoes `lat`, `lon`, `season`, `year`, and the resolved `windowStart` / `windowEnd` |
| `point` | `requested`, `resolvedGridPoint` (`{lat, lon}` or `null`), `elevationM` (`null` on a cache hit) |
| `sources[]` | `id`, `provider`, `product`, `url`, `dataClass`, `spatialResolution`, `status` (`ok`/`failed`/`unavailable`), `retrievedAt`, `cache`, `error` |
| `observations[]` | one per variable/aggregation, with `unit`, `windowStart`, `windowEnd`, `nValid`, `nExpected`, `qualityFlags` |
| `dailySeries[]` | validated daily values only, so the client can redraw a season |
| `soil` | `status` ∈ `ok` \| `unavailable` \| `failed`, per-property raw value, raw unit, converted value, `depth`, `predicted: true` |
| `indicators[]` | `id`, `value`, `unit`, `label` — rainfall, dry spells, heat days, frost days, wetness, radiation |
| `imagery[]` | `layer`, `tileUrlTemplate`, `attribution`, `note: "Visual context only"`; never scored |
| `quality` | `cacheStatus` per source, `temporalCoverage`, `sourcesOk` / `sourcesFailed` |
| `limitations[]` | plain-language caveats, including the reason each failed source is missing |

Partial failure is a first-class outcome: POWER ok + soil failed returns `200` with full POWER evidence and
an explicit soil limitation. Only a total failure returns `502 SOURCE_UNAVAILABLE`.

**Measured latency (pilot point, 2026-11-14):** cold `12.07 s` (dominated by the SoilGrids timeout), then
`0.025 s` and `0.006 s` from cache with the failure memo active.

---

## 5. `GET /api/v1/sources`

Data-source register for the evidence panel.

**Response 200**
```json
{
  "sources": [
    {
      "id": "nasa_power", "provider": "NASA LaRC", "product": "POWER Agroclimatology",
      "url": "https://power.larc.nasa.gov/docs/services/api/", "dataClass": "reanalysis",
      "variables": ["T2M","PRECTOTCORR","GWETROOT","ALLSKY_SFC_SW_DWN","RH2M","WS2M"],
      "units": { "T2M": "C", "PRECTOTCORR": "mm/day", "GWETROOT": "1" },
      "spatialResolution": "0.5 x 0.625 deg", "temporalResolution": "daily",
      "coverage": "global", "history": "1980-present (MERRA-2)",
      "auth": "none", "usableAtPilot": "yes",
      "limitations": ["Reanalysis, not observation", "Not a forecast"]
    }
  ]
}
```

---

## 6. `POST /api/v1/compare`

The core endpoint. Deterministic; identical input (modulo timestamps) yields identical output.

**Request**
```json
{
  "point": { "lat": 31.4187, "lon": 73.0791 },
  "season": "kharif",
  "planningYear": 2027,
  "currentRotationId": "wheat-cotton",
  "previousCropId": "wheat",
  "irrigation": "canal",
  "farmSizeAcres": 12,
  "soil": { "texture": "loam", "pH": 8.0, "organicMatter": null },
  "priorities": { "water": 0.6, "soilHealth": 0.2, "climateResilience": 0.2 },
  "candidateRotationIds": ["wheat-cotton", "wheat-maize", "wheat-maize-mung", "wheat-rice"]
}
```

**Validation**
| Rule | Failure |
|---|---|
| `lat`/`lon` inside pilot bbox | `422 OUT_OF_COVERAGE` |
| `planningYear` within `[1980, currentYear+1]` | `400` |
| `priorities` each 0…1, sum > 0 | `400` (normalised server-side, echoed normalised) |
| `currentRotationId` present in `candidateRotationIds` | `400` (baseline is always included) |
| every candidate id exists in catalogue and is `selectable` | `400` |
| `soil.pH` 3…11, `organicMatter` 0…20 % | `400` |
| `farmSizeAcres` 0.1…5000 if present | `400` |
| unknown fields | `400` |

**Response 200**
```json
{
  "runId": "0f8c…",
  "status": "ok",
  "indexLabel": "comparative index (0-100, relative to options shown)",
  "weighting": { "provisional": true, "components": { "C1": 0.33, "C2": 0.17, "C3": 0.22, "C4": 0.28, "C5": 0 },
                 "note": "Prototype weighting, not an agronomic standard." },
  "ranking": ["wheat-maize-mung", "wheat-maize", "wheat-cotton", "wheat-rice"],
  "evidenceCoverage": 0.72,
  "scenarios": [
    {
      "scenarioId": "wheat-maize-mung",
      "label": "Wheat – Maize + Summer Mung",
      "isBaseline": false,
      "index": 71.4,
      "confidence": "moderate",
      "evidenceCoverage": 0.72,
      "whyIncluded": "Documented Punjab rotation (PAU Package of Practices) adding a legume phase with a documented summer window.",
      "components": [
        { "id": "C1", "label": "Rainfall reliability", "sub": 0.68, "weight": 0.33, "available": true,
          "raw": { "rainAnomalyPct": -18.2, "drySpellCount10": 1 }, "unit": "mm/day", "dataClass": "reanalysis" },
        { "id": "C3", "label": "Soil-health structure", "sub": 1.0, "weight": 0.22, "available": true, "raw": { "legume": 1 } }
      ],
      "explanation": {
        "supporting": ["The maize+mung window shows 18% below-normal rainfall but fewer long dry spells than your current rotation."],
        "risks": ["41 days at or above 35 C fall inside this window."],
        "missing": ["Crop water-demand class is not yet verified for maize, so the water-demand component is excluded."],
        "cannotConclude": ["Field Shift cannot say whether this rotation would raise yield or income."]
      },
      "limitations": ["partial_component_weight"],
      "provenance": [{ "sourceId": "nasa_power", "variable": "PRECTOTCORR", "windowStart": "2027-04-01", "windowEnd": "2027-11-15" }]
    }
  ],
  "globalLimitations": [
    "Soil at this point is unavailable from SoilGrids; soil comparison uses rotation structure only."
  ],
  "dataSources": [{ "id": "nasa_power", "provider": "NASA LaRC", "dataClass": "reanalysis", "retrievedAt": "2026-11-14T09:00:02Z" }],
  "generatedAt": "2026-11-14T09:00:04Z"
}
```

**Response 200 — insufficient evidence** (not an HTTP error; it is a valid, honest answer)
```json
{
  "runId": "3ab1…",
  "status": "insufficient_evidence",
  "ranking": [],
  "scenarios": [
    { "scenarioId": "wheat-cotton", "index": null, "confidence": "insufficient_evidence",
      "evidenceCoverage": 0.22,
      "explanation": { "supporting": [], "risks": [],
        "missing": ["Rainfall series unavailable (NASA POWER error).", "Soil unavailable at this point."],
        "cannotConclude": ["Nothing can be concluded about these rotations from the data that could be retrieved."] } }
  ],
  "globalLimitations": ["NASA POWER did not respond within 20 s."]
}
```

**Errors**
- `400 VALIDATION_ERROR`
- `422 OUT_OF_COVERAGE`
- `429 RATE_LIMITED`
- `500 INTERNAL` (engine threw — a bug, never a data-quality outcome)

---

### 6.1 Implementation status (Phase 3) and a real response

Implemented in `apps/api/src/routes/compare.ts` + `services/compare.ts`; the request body is validated by
`compareRequestSchema` and the response is parsed by `engineResultSchema` in tests. Differences from the
illustrative payload above:

- `provenance` is an object (`{sourceId, variable, windowStart, windowEnd, dataClass, spatialResolution}`),
  not a flat `{sourceId, variable, …}` per scenario only: every **criterion** carries its own.
- each scenario also returns `redistributed`, `comparabilityWarning` and `confidence`.
- the run adds `pairwise: [{a, b, delta, meaningful}]` so a caller can apply the “not a meaningful
  difference” rule instead of inferring a winner.
- `weighting.components` contains the run-level normalised weights (`C5` is 0 for kharif).
- `inputEcho.priorities` is the **normalised** profile (sums to 1).
- `runId` is a UUIDv4 and nothing is persisted yet: `GET /runs/:id` is **not** implemented in this phase.

**Measured (live, pilot point, 2026-11-14):** kharif 2025 `status:"ok"`, coverage `0.8047`, ranking
`wheat-maize > wheat-rice > wheat-cotton` (indices 87.13 / 84.12 / 12.87), `C4` excluded for every option,
`wheat-maize-mung` excluded because mungbean is not selectable. The same request repeated returns a
byte-identical body apart from `runId` and `generatedAt`. Cold `6.98 s`, warm `0.036 s`.

```json
{
  "runId": "2f1c…",
  "engineVersion": "1.0.0",
  "status": "ok",
  "indexLabel": "comparative index (0-100, relative to options shown)",
  "ranking": ["wheat-maize", "wheat-rice", "wheat-cotton"],
  "evidenceCoverage": 0.8047,
  "weighting": { "provisional": true, "components": { "C1": 0.3905, "C2": 0.2071, "C3": 0.2071, "C4": 0.1953, "C5": 0 }, "note": "Weighting is a prototype choice, not an agronomic standard." },
  "scenarios": [{
    "scenarioId": "wheat-cotton", "isBaseline": true, "index": 12.87, "confidence": "moderate",
    "evidenceCoverage": 0.8047, "redistributed": ["C4"], "comparabilityWarning": true,
    "components": [
      { "id": "C1", "sub": 0, "weight": 0.4853, "available": true,
        "raw": { "seasonRainMm": 729.73, "normalRainMm": 467.26, "rainAnomalyPct": 56.17, "drySpellCount10": 11, "longestDrySpellDays": 57 },
        "ruleId": "R-RAIN-COMPOSITE-v1", "provenance": [{ "sourceId": "nasa_power", "variable": "PRECTOTCORR", "dataClass": "reanalysis" }] },
      { "id": "C4", "available": false, "sub": null, "weight": 0, "raw": { "waterDemandClass": null },
        "missing": ["Crop water-demand class is not sourced for: Wheat, Cotton, so no numeric water-demand score is produced."] }
    ],
    "explanation": {
      "supporting": ["Rainfall across the rabi and kharif windows totals 729.7 mm (+56.2% against the long-term normal; 11 spells of 10+ dry days). Source: NASA POWER, MERRA-2 reanalysis."],
      "risks": ["190 days at or above 35 C fall inside the rabi and kharif windows, 99 of them at or above 40 C (NASA POWER T2M_MAX, MERRA-2 reanalysis)."],
      "missing": ["Water demand vs supply: Crop water-demand class is not sourced for: Wheat, Cotton…"],
      "cannotConclude": ["Field Shift cannot say whether this rotation would raise yield or income: no localised yield-response evidence is included."]
    }
  }],
  "pairwise": [{ "a": "wheat-maize", "b": "wheat-rice", "delta": 3.01, "meaningful": false }],
  "globalLimitations": ["Rotation \"Wheat - Maize + Summer Mung\" was excluded because Mungbean is not selectable (its documented calendar is incomplete)."],
  "dataSources": [{ "id": "nasa_power", "scope": "environmental", "dataClass": "reanalysis" }, { "id": "crop_catalog", "scope": "agronomic", "dataClass": "reference" }],
  "generatedAt": "2026-11-14T11:41:12.884Z"
}
```

**Insufficient evidence is a 200.** Verified live for `kharif 2027` (entirely in the future): `status:
"insufficient_evidence"`, `ranking: []`, every `index: null`, coverage `0.2071`, and the reason
*“Environmental evidence for kharif 2027 could not be retrieved (The requested season window is entirely in
 the future)”* in `globalLimitations`.

---

## 7. `GET /api/v1/runs/:runId`

Retrieve a stored anonymous analysis (for sharing/export).

> **Status: not implemented in Phase 3.** The `analysis_runs` table exists and is ready, but the engine does
> not write runs yet (decision D-24). Calling this route returns `404 NOT_FOUND` from the router's fallback;
> no run has ever been stored, so nothing is lost.

**Response 200** — same shape as `/compare` plus `"storedAt"`.
**404 NOT_FOUND** — unknown or expired id. No enumeration: ids are random UUIDs; no listing endpoint.

---

## 8. `POST /api/v1/runs/:runId/export`

Server-rendered, self-contained HTML summary (printable to PDF) including disclaimers and the full source
list.

**Response 200** — `text/html; charset=utf-8`, `Content-Disposition: attachment`.
**404** — unknown id.

---

## 9. Contract consistency checks (enforced in CI/tests)

1. `packages/shared` zod schemas are the only source of request/response types.
2. The API's response is parsed by the same schema in integration tests, so a drifting handler fails CI.
3. `docs/API_CONTRACT.md` examples are validated against the schemas by a doc-lint test (Phase 5).
4. No endpoint may return a numeric environmental value without a `sourceId` and `unit` — asserted in
   response-level tests.

---

## 10. Versioning

`/api/v1` until the hackathon submission is frozen. Breaking changes require a DECISIONS_LOG entry and a
version bump; the frontend and the contract change in the same commit.
