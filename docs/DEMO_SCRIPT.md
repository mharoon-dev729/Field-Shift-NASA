# Field Shift — Demo Script

**Goal:** A 3‑minute guided walk‑through for a judge or collaborator. Uses real NASA POWER data at the Faisalabad pilot point. No network surprises — all fetches are cached after the first cold run.

## Before You Start

- Run `npm install && npm run db:migrate --workspace @fieldshift/api && npm run typecheck && npm test`.
- Run `npm run dev:api` (http://localhost:8000) and `npm run dev:web` (http://localhost:5173).
- Wait for the dev servers to show no errors and the API health check to return `200 ok`.

## Script

### 1. Introduce the farming problem (30 s)

> "A farmer with about twelve acres in Faisalabad district has to commit to next season's crop months before it starts. The information that would help — how recent seasons actually behaved in their area, and how that fits the water demand and calendar of each rotation they could choose — exists in NASA archives and provincial agriculture documents, but not in a form a farmer can use. Field Shift does the translation."

**What the user sees:** Landing screen with the four‑sentence honesty statement.

**Script text:**
> "This is an independent project. It is not affiliated with, endorsed by, or produced by NASA or NASA Space Apps. NASA does not endorse any non‑U.S. Government entity."

### 2. Open Field Shift and enter a farm profile (1 min 30 s)

> "Let's begin. The app pre‑loads the pilot centre of Faisalabad district — latitude 31.4187 N, longitude 73.0791 E. I'm going to keep the defaults, but I could change the coordinates if I wanted to."

**Actions:**
1. The form shows the pilot coordinates already filled in (lat 31.4187, lon 73.0791).
2. Season selector: **Kharif** (April–November). (Rabi runs November–May.)
3. Analysis year: **2025** (past season — complete evidence). (2027 would show insufficient evidence.)
4. Current rotation: **Wheat – Cotton** (the farmer's baseline).
5. Previous crop: leave blank (optional).
6. Irrigation: **Canal** (the dominant source in the pilot area).
7. Optional soil: leave blank — the app will show SoilGrids as "unavailable" for this point, which is honest.
8. Priorities: set **Water** to 60%, **Soil health** to 20%, **Climate resilience** to 20% (sliders add to 100%).

**What the user sees:** Farm form with all fields filled, priority sliders at the requested percentages, honesty banner at the bottom.

### 3. Retrieve environmental evidence (45 s)

> "Now I'll fetch the NASA evidence for this farm's area and the kharif 2025 growing window. The app contacts the server, which pulls POWER daily values and climatology, checks SoilGrids, and returns a fully‑provenanced response."

**Action:** Click the **Retrieve evidence and compare rotations** button.

**What the user sees (timeline, ~8 s cold / ~25 ms warm):**
- Progress is shown per source (POWER, SoilGrids).
- After the fetch, the **Environmental evidence** section appears with:
  - Season rainfall total: **670.6 mm** (modelled, reanalysis — labelled as such).
  - Days with at least 1 mm rain: **73 days**.
  - Longest dry spell: **55 days**.
  - Days at or above 35 °C: **151 days**.
  - Mean temperature: **30.2 °C**.
  - Mean root‑zone soil wetness: **0.43** (modelled, dimensionless — labelled *not a satellite measurement*).
  - All 8 daily‑series observations with units, dates and source IDs.
  - Quality flags where applicable.
  - Limitations listed at the bottom (POWER is reanalysis, SoilGrids is a prediction at 250 m, values describe the area around the farm, not the field).
  - Two status badges: `nasa_power: ok`, `soilgrids: partial` (available but with caveats).

**Script text:**
> "The evidence comes from NASA POWER — a MERRA‑2 based reanalysis on a ~0.5 degree grid, roughly 50 km. That means every value describes the area around the farm, not the field itself. SoilGrids is a digital soil‑map prediction, not a laboratory test of this field. When SoilGrids has no value at this point, it is shown as *unknown*, never as zero."

### 4. Compare rotations (45 s)

> "With the evidence in hand, the app runs the deterministic decision engine. It scores each candidate rotation against the five components, re‑weights by my priorities, and produces a comparative index from 0 to 100 — relative to the options in this run, not an absolute suitability score."

**Action:** The comparison runs automatically after evidence is fetched. The **Rotation comparison** section appears.

**What the user sees:**
- Three scenario cards side by side:
  1. **Wheat – Maize** — index **87.1**, confidence **moderate**.
  2. **Wheat – Rice** — index **84.1**, confidence **moderate**.
  3. **Wheat – Cotton** (baseline, labelled "your current practice") — index **12.9**, confidence **moderate**.
- Below each card: a **criterion breakdown** showing C1 (rainfall reliability), C2 (heat exposure), C3 (soil‑health structure), C4 (water demand vs supply — *unavailable*, weight redistributed), and C5 (frost risk — not applicable in kharif, weights renormalised).
- A **pairwise differences** note: "Wheat‑maize and Wheat‑rice differ by 3.0 index points — inside the 5‑point band, so neither is presented as better."
- **Evidence coverage: 80%**.

**Script text:**
> "Wheat‑maize scores higher because it has more favourable rainfall in the window and fewer long dry spells. Wheat‑cotton scores much lower — its C1 (rainfall reliability) is the same, but its heat exposure is much worse, and C4 (water demand vs supply) is unavailable for every option, so that weight is redistributed and the index drops. The index is not a probability of success; it is a comparative rank *relative to the other options shown*. C4 is currently unavailable because the water‑demand classes for these crops have not yet been sourced from PAU — the UI says so explicitly."

### 5. Open the sources and limitations panel (45 s)

> "Let's see where the numbers come from and what the system cannot claim."

**Action:** Click the **Sources & assumptions** button in the top right.

**What the user sees (drawer, four groups):**
- **NASA environmental observations** — POWER Agroclimatology, provider NASA LaRC, product URL, data class reanalysis, spatial resolution 0.5 × 0.625 deg, limitations "Reanalysis, not observation; Not a forecast".
- **Soil information** — ISRIC SoilGrids 2.0, 250 m resolution, data class observation, predicted: true. If unavailable: explicit "soil data unavailable here" message.
- **Agricultural research and crop requirements** — Punjab CRS *Package of Practices for Crops of Punjab*, PAU, AARI wheat varieties, CRS crop calendars. Each cited with URL and quality.
- **Project assumptions and provisional thresholds** — weights are provisional; C4 excluded until water‑demand classes are sourced; two options fewer than 5 index points apart are "not a meaningful difference"; environmental values describe the ~0.5° MERRA‑2 cell, not the field.

**Script text:**
> "Every value on screen is traceable. POWER gives us the rainfall and temperature — reanalysis, not a measurement at the farm. SoilGrids gives us a predicted clay/sand/pH context at 250 m — labelled as a prediction, not a soil test. The agricultural rotation rules come from the Government of Punjab and Punjab Agricultural University, cited with exact PDF links. The weights you see (0.30 / 0.25 / 0.25 / 0.15 / 0.05) are a prototype choice, not an agronomic standard. And when the evidence is too thin, the system says so — no winner, no fabricated index."

### 6. Insufficient‑evidence demonstration (45 s)

> "Let me show what happens when the evidence can't support a comparison. I'll change the analysis year to 2027 — a future season where POWER has no daily data yet."

**Action:**
1. Edit the **Analysis year** field from `2025` to `2027`.
2. Press **Retrieve evidence and compare rotations** again.

**What the user sees:**
- The **Rotation comparison** section changes instantly.
- No ranking is shown.
- A banner: **Not enough evidence to compare these rotations** — Field Shift will not rank options when the evidence cannot support a comparison. No winner, index or ordering is shown.
- Each scenario card shows **index: null**, confidence **insufficient_evidence**, and a bulleted list of what is missing: "Rainfall reliability: PRECTOTCORR series missing for a phase", "Heat exposure: T2M_MAX series missing for a phase", "Crop water‑demand class is not sourced for: Wheat, Cotton, so no numeric water‑demand score is produced."
- **Global limitations** list the reasons: "The requested season window is entirely in the future", "Values describe the ~0.5 deg MERRA‑2 cell around the farm, not the field itself", "Crop water‑demand classes are not yet sourced".
- **No pairwise comparisons** are shown (empty).
- The **Evidence** section still shows the (now outdated) NASA data from the previous fetch, or grays out with a message that the comparison cannot proceed.

**Script text:**
> "This is the key differentiator. When the data cannot support a comparison, Field Shift refuses to guess. It does not show a winner. It does not invent an index. It explains what is missing and why the result cannot be trusted yet. The user leaves understanding exactly what would be needed to make the comparison possible — more seasons of POWER data, sourced crop water‑demand classes, and so on."

### 7. Wrap‑up (30 s)

> "That's Field Shift. It translates NASA Earth‑observation data into an explained, source‑linked comparison of crop rotations for one farm, and it refuses to recommend when the evidence isn't good enough. The prototype is focused on the Faisalabad pilot district, the data are openly attributed, and the limitations are never hidden."

**What the user sees:** The footers and disclaimer at the bottom of the page.

**Script text:**
> "This is an independent project. Not affiliated with, endorsed by, or produced by NASA or NASA Space Apps. It is submitted for the NASA Space Apps Challenge 2026, brief *Field Shift: Adapting Farms with NASA Data*."

## technical notes for the demo runner

- **First run** (cold): POWER + SoilGrids take ~8‑12 s. The UI shows progress per source.
- **Second+ run** (warm): cached POWER returns in ~25 ms, SoilGrids still ~12 s if it needs to re‑query ISRIC.
- **No Earthdata login** is required for any of the open data used (POWER, GIBS, CMR).
- **If a network block occurs** (e.g. devtools route‑blocking), the insufficient‑evidence screen appears with the source name.
- **The demo works on desktop** (the primary viewport) and gracefully falls back to a single‑column layout on mobile (< 480 px).

## Demo Checklist

- [ ] Landing screen with honesty banner visible.
- [ ] Farm form pre‑loaded with Faisalabad pilot coordinates.
- [ ] Season, year, current rotation, priorities all settable.
- [ ] Evidence fetch completes (cold ~8 s, warm ~25 ms).
- [ ] Three rotation cards displayed with indices, confidence, and criterion breakdowns.
- [ ] C4 (water demand) shown as unavailable for every option, weight redistributed.
- [ ] Pairwise differences labelled meaningful / not meaningful.
- [ ] Sources & assumptions drawer opens with four groups.
- [ ] Year changed to 2027 → insufficient‑evidence screen, no fabricated index.
- [ ] Honesty banner visible throughout (reanalysis label, soil prediction label, independent project disclaimer).