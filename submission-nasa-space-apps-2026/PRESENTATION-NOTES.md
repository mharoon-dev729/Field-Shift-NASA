# Agri — Field Shift · NASA Space Apps Challenge 2026

## Project demonstration deck — build notes

**Deliverables in this folder**

| File | What it is |
|---|---|
| `Agri-Field-Shift-NASA-Demo.pptx` | Editable master, 7 slides, 16:9 (13.333 × 7.5 in) |
| `Agri-Field-Shift-NASA-Demo.pdf` | PDF export of the same layout, 7 pages, 960 × 540 pt |
| `presentation-preview/slide-01.png … slide-07.png` | Per-slide previews (1920 × 1080) |
| `presentation-preview/montage.png` | Contact sheet of all seven slides |
| `assets/shots/` | Raw captures from the live application |
| `assets/deck/` | Crops used by the slides (same files in PPTX and PDF) |
| `build/` | Scripts that regenerate everything from one layout spec |

Everything is generated from `build/deck-spec.mjs`; the PPTX renderer and the
HTML/PDF renderer read that one file, so geometry, copy and colours cannot drift
between the two outputs.

Rebuild with:

```bash
cd build
npm install          # pptxgenjs + puppeteer-core (dev-only, not part of the app)
node build.mjs       # PPTX + HTML + PDF + previews + montage
node validate-pptx.mjs
```

---

## Slide by slide

### 1 — Title
- **Purpose:** name the project and the challenge in one confident frame.
- **Content:** "Agri — Field Shift"; tagline "Crop-rotation decisions built on
  NASA Earth data — explained, source-linked, and honest about what the
  evidence cannot support."; challenge line; pilot area; live URL; the
  independence disclaimer.
- **Visual:** the same wheat-field photograph the product uses in its own hero
  (Unsplash, free licence). No AI-generated imagery anywhere in the deck.

### 2 — The problem
- **Purpose:** explain why the decision is hard, without invented statistics.
- **Content:** a farmer must commit months before the season; the evidence
  exists but not in usable form (Earthdata logins and HDF5 decoding; PDFs;
  undocumented local advice); "The missing piece is translation — not more
  data." Pilot card: Faisalabad district, 31.4187 N / 73.0791 E, POWER cell
  ~0.5° (about 50 km).
- **Sources:** `docs/PROJECT_OVERVIEW.md`, `README.md`.
- **Visual:** field photograph; pilot-area card on the image.

### 3 — Our solution
- **Purpose:** what the product does, for whom, and what it deliberately is not.
- **Content:** who it helps (farmers and extension advisors in the pilot
  district, no account); what it does (retrieves NASA POWER evidence for the
  farm's grid cell, aligns it with cited Punjab rotation calendars, explains
  every score and missing input); what it is **not** (forecast, yield or profit
  predictor, soil-test substitute). Five-step workflow panel mirrors the real
  form: location → season and analysis year → rotations → priorities →
  evidence/comparison.
- **Sources:** `apps/web/src/components/FarmForm.tsx`, `App.tsx`,
  `packages/shared/src/index.ts` (analysis-year window 1980 → last ended season).
- **Claim check:** determined engine with no ML/LLM at runtime —
  `apps/api/src/engine/*` contains no model calls; weights are labelled
  provisional in `engine/config.ts`.

### 4 — NASA data & technology
- **Purpose:** separate what NASA provides from everything else, and state what
  each source is allowed to influence.
- **Rows:** NASA POWER (MERRA-2 reanalysis, ~0.5° grid, daily, 1980–present) →
  scored evidence C1/C2/C5; ISRIC SoilGrids 2.0 (250 m predictions) → soil
  context only, never a soil test; NASA GIBS imagery (SMAP, IMERG, MODIS NDVI) →
  visual context only, **no pixel value is scored**; NASA CMR → metadata only;
  Punjab Crop Reporting Service / PAU → the agronomic reference behind every
  rotation offered.
- **Tech strip:** React 19 + TypeScript + Vite · Node 24 + Express + zod ·
  Supabase Postgres (5 tables, RLS) · Vercel.
- **Sources:** `apps/api/src/db/migrations/002_seed_sources.sql`,
  `apps/api/src/adapters/*`, `docs/DATA_SOURCE_REGISTER.md`, `README.md`.
- **Deliberately omitted:** the ten US-only challenge resources (SSURGO, PRISM,
  CDL, NAIP, …). They are documented as excluded because they do not cover
  Pakistan; the deck does not pretend otherwise.

### 5 — Actual product demonstration
- **Purpose:** show the real interface, not a mockup.
- **Screens (all live captures, 15 Nov 2026):** farm setup; season and analysis
  year (46 ended seasons, 1980 → 2025, default 2025); environmental evidence
  (NASA POWER values with coverage cards); rotation comparison (ranked, with
  confidence and index).
- **Capture method:** Chromium via `puppeteer-core`, deployed URL
  `https://nasa-hackathon-field-shift.vercel.app`, 1440 × 900 for the full
  screenshots, and a 1280 × 490 viewport for these four wide frames so the
  interesting band fills the frame without cutting content.
- **No staging, no retouching:** values, badges and warnings are whatever the
  live API returned at capture time.

### 6 — Evidence, reliability & impact
- **Purpose:** the honesty mechanisms are the product's differentiator.
- **Content:** evidence gate (below 35 % of applicable weight, or fewer than two
  components → `insufficient_evidence`, no ranking); "too small to call" (gaps
  under 5 index points are not meaningful); full provenance on every value; the
  sources drawer listing NASA observations, SoilGrids predictions, Punjab
  citations and provisional assumptions.
- **Impact wording:** explicitly labelled *potential impact — not a measured
  outcome*. No yield, income or adoption claim is made anywhere.
- **Sources:** `apps/api/src/engine/config.ts` (`GATE`, `MIN_MEANINGFUL_DELTA`,
  `MIN_COMPONENT_COVERAGE`), `apps/api/src/engine/compare.ts`,
  `apps/web/src/components/SourcesPanel.tsx`.

### 7 — Closing
- **Purpose:** one line, one link, one image.
- **Content:** "NASA data, local agronomy, and a refusal to guess."; three value
  chips; live URL and repository; team credit and the independence disclaimer.

---

## What was verified against the codebase

- Analysis-year options are genuinely ended seasons only, 1980 → latest
  complete year (default 2025 at capture time) —
  `packages/shared/src/index.ts`, `apps/web/src/components/FarmForm.tsx`.
- Five scored components C1–C5 and the evidence gate thresholds —
  `apps/api/src/engine/config.ts`.
- Water demand (C4) is currently unavailable because crop water-demand classes
  are unsourced; the API redistributes that weight. The deck does not claim C4
  works.
- Satellite imagery is rendered as context and never scored —
  `apps/api/src/adapters/gibs.ts`, `services/evidence.ts`.
- Rotation catalogue: four documented rotations; mungbean is not selectable
  because its sowing window is unsourced —
  `apps/api/src/db/migrations/003_seed_catalog.sql`.
- Live deployment returns 200 and serves this build (verified: the analysis-year
  select renders with 46 options and the comparison engine returns ranked
  scenarios).

## Limitations and things to re-check before submission

1. **PDF generation.** This machine has no Microsoft Office and no LibreOffice,
   so the PDF is a Chromium print of the same layout spec rather than an export
   from PowerPoint. Content, geometry, colours and images are identical; text
   metrics can differ by a pixel or two. If you need a byte-for-byte PowerPoint
   export, open the PPTX in PowerPoint and "Save as PDF" — the result is
   interchangeable.
2. **Fonts.** Georgia (headings) and Segoe UI (body). Both ship with Windows
   (Georgia also with macOS); on a machine without them PowerPoint substitutes
   a serif/sans, which can reflow a headline slightly. Check slide 2 and 6
   first if you present from another machine.
3. **Live values vary.** NASA POWER and SoilGrids are queried live. In the
   capture run SoilGrids timed out, so the evidence panel reported a lower
   source-coverage percentage than the comparison's scored-weight coverage.
   Slide 6 explains exactly that difference; do not read the two numbers as a
   contradiction, and re-capture if you want a run where every source answers.
4. **Screenshots are of the deployed build as of 15 Nov 2026.** If the
   application is redeployed with UI changes, re-run
   `build/capture.mjs` and `build/capture-slide5.mjs`, then `build/build.mjs`.
5. **Not opened in PowerPoint / Keynote / Google Slides.** The PPTX was
   validated structurally: archive integrity, 7 slides, well-formed XML per
   slide, 9 embedded images, all image relationships resolving, 7 speaker-note
   pages. Rendering was reviewed through the HTML mirror and the PDF.
6. **Speaker notes** are attached to every slide in the PPTX and say what each
   slide is for; they are not visible in the PDF.
7. **Photography** is two Unsplash images (free licence), one of which is the
   product's own hero image. No stock photo implies the pilot farmers, and no
   photo is presented as satellite data.

## Website / repository

- Live: https://nasa-hackathon-field-shift.vercel.app
- Code: https://github.com/mharoon-dev729/Field-Shift-NASA

Independent project — not affiliated with, endorsed by, or produced by NASA or
NASA Space Apps.
