# Challenge Requirements — Field Shift: Adapting Farms with NASA Data

**Challenge:** NASA International Space Apps Challenge 2026
**Official brief:** https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/
**Our project:** *Field Shift* — an independent entry. **Not endorsed by or affiliated with NASA.**
**Requirements captured:** 2026-11-14

---

## 1. The official statement (verbatim)

> "Farmers around the world navigate shifting temperatures, changing rainfall patterns, water
> shortages, extreme weather, and declining soil health. These pressures make it difficult to choose
> crop rotations that protect fields, conserve water, and support long-term resilience. Your challenge
> is to create a decision-support tool that uses NASA Earth observations along with local soil
> information, crop characteristics, and farmer priorities to help farmers explore rotation strategies
> that could strengthen soil health and adapt their farms to changing conditions."

*Source: the official challenge page, as reproduced on participating local-event sites (e.g.
spaceappschallenge.org/2026/find-a-team/*). Difficulty band: Intermediate–Advanced. Categories:
Arts & Multimedia, Earth Science, Software.*

---

## 2. Requirement decomposition

Each clause of the brief becomes a testable requirement. "Met by" points at the artefact that
discharges it.

| ID | Requirement from brief | What that means concretely | Met by |
|---|---|---|---|
| **R1** | "decision-support tool" | Not a dashboard, not a chatbot. The user must be able to *decide between options* and see why. | Comparison view (PRD §7.7 FR-9), engine spec |
| **R2** | "uses NASA Earth observations" | Real NASA products, retrieved live, with source metadata. Not invented numbers, not synthetic fixtures shown as real. | POWER (live), GIBS imagery (live), CMR metadata (live) |
| **R3** | "along with local soil information" | Soil data appropriate to the pilot, with provenance; missing soil must be shown as missing. | SoilGrids 2.0 + optional farmer-entered soil |
| **R4** | "crop characteristics" | Sowing/harvest windows, water demand, rotation behaviour, each with a citation. | Crop catalogue + AGRICULTURAL_EVIDENCE.md |
| **R5** | "farmer priorities" | The farmer's own weighting of water / soil health / climate resilience must change the output. | Priority weighting in engine spec §6 |
| **R6** | "help farmers explore rotation strategies" | ≥3 genuine alternatives compared side by side, including the current practice. | Scenario generator |
| **R7** | "strengthen soil health and adapt … to changing conditions" | Indicators must connect to soil-health and climate-adaptation reasoning, not just yield. | Indicator set: dry spells, heat days, wetness trend, residue/rotation diversity |
| **R8** | Implicit: global relevance | The pilot must sit where the datasets actually work. US-only products cannot carry the solution. | Faisalabad pilot; 10 US-only sources excluded |

---

## 3. Deliverable expectations from the challenge platform

The challenge materials on spaceappschallenge.org are organised as **Details / Resources / Teams**.
There is no mandatory API list, no prescribed stack, and no required schema. Judging is on the
submission narrative, the working prototype, and the data story. Consequences for us:

1. **A working, demonstrable end-to-end path outranks feature breadth.**
2. **Data provenance is part of the product**, because the brief is fundamentally about combining
   disparate Earth observations honestly.
3. **Local relevance matters**: the brief says "local soil information" — for us that means Pakistan,
   not a US county.

---

## 4. What the challenge does *not* require (and we therefore do not build)

- No requirement for user accounts, payments, or a marketplace.
- No requirement for yield prediction, financial forecasting or market prices.
- No requirement for forecasts of future weather. (POWER is historical/reanalysis: **not** a forecast.)
- No requirement for a specific pilot country. Our Pakistan choice is ours to justify.
- No requirement to use every listed resource. Coverage reality forbids it.

---

## 5. Judging-criteria alignment (self-assessment)

Space Apps judging is typically weighted across: *impact, creativity, validity, quality of the idea,
and the data/product*. Our position per dimension:

| Dimension | How Field Shift addresses it | Risk |
|---|---|---|
| **Impact** | Targets a real, specific decision (which rotation next season) for smallholders in an irrigated, water-stressed district | Impact is local until the pilot is generalised |
| **Creativity** | "Evidence-gated" comparison: the system refuses to score when evidence is thin, and shows what is missing | Restraint can read as a thin product if explanation is not clear |
| **Validity** | Every number traceable to a NASA/local source with units, date range, resolution; reanalysis labelled as reanalysis | POWER is modelled data — must not be oversold |
| **Quality of idea** | Farmer-priority weighting with transparent, deterministic arithmetic | Provisional weights must be labelled |
| **Data story** | 25 sources audited; 10 excluded for geographic reasons; 1 core NASA source + 2 imagery layers verified live | Direct SMAP/IMERG numeric extraction is credential-gated in the MVP |

---

## 6. Non-negotiable constraints derived from the brief + NASA usage terms

1. **No NASA endorsement claim.** Every surface that mentions NASA carries a disclaimer.
2. **No non-US-Government data presented as NASA data.** Local soil/crop sources are labelled by
   provider in the UI.
3. **Respect each source's data-use terms.** POWER/GIBS/CMR: open. Earthdata products: login + terms.
   SoilGrids: CC-BY 4.0 attribution (ISRIC). Punjab documents: cited, not republished.
4. **No fabricated observations.** Failed retrieval surfaces as *unavailable*, with the error and the
   affected scenario marked "insufficient evidence".
5. **No farm-level precision claim from coarse data.** 0.5° POWER cells and 9–11 km SMAP/IMERG cells
   are attributed to the *area around the farm*, never to the farm.

---

## 7. Acceptance checklist for the submission

- [ ] A user can complete the whole journey without an account.
- [ ] At least three rotations, including the farmer's current one, are compared.
- [ ] Every displayed environmental number has a source, variable name, unit, date range and resolution.
- [ ] A failing data source degrades the result openly and blocks unsupported conclusions.
- [ ] Changing farmer priorities visibly changes the ranking and the explanation.
- [ ] US-only datasets are absent from the evidence path.
- [ ] The README states clearly that this is an independent project.

*(Status of each item is tracked in [PROGRESS.md](PROGRESS.md).)*

---

## 8. Sources consulted

- Official challenge page: https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/
- Challenge resources tab (provided as `reference/Resources of NASA Data.pdf`, 5 pp., captured 2026-11-14)
- Independent dataset guidance for this challenge: https://spacedata.swapniltamse.com/challenges/field-shift-adapting-farms/
- 2026 team pages reproducing the brief text (e.g. `/2026/find-a-team/agroshift/`)

The PDF supplied in `reference/` is a print-to-PDF of the official **Resources** tab. Its full contents
and our per-source audit are recorded in [DATA_SOURCE_REGISTER.md](DATA_SOURCE_REGISTER.md).
