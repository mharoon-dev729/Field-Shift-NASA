# Agri — Transformation Plan

## Overview

This plan transforms the existing Field Shift frontend into the premium **Agri** application, maintaining all backend functionality while replacing the UI/UX with a professional agricultural technology product design.

**Constraint summary:**
- ✅ Preserve all API contracts and endpoints
- ✅ Preserve all decision-engine logic
- ✅ Preserve all NASA data integrity rules
- ✅ Preserve all existing tests (no deletions/weakening)
- ✅ Preserve `.env` and `.gitignore` unchanged
- ✅ No new git commits or deployments
- ✅ All changes in `apps/web/src/` only

## Implementation Phases

### Phase A — Brand Identity & Design System (completed)
- Color palette, typography, component conventions documented in `docs/Agri_DESIGN_SYSTEM.md`
- All styling uses CSS custom properties (CSS variables) for consistency

### Phase B — Application Shell & Navigation (in progress)
- Replace "Field Shift" branding with "Agri"
- Premium navigation sidebar (desktop) / bottom navigation (mobile)
- Consistent page headers with Agri branding
- Focus-managed drawer/overlay patterns

### Phase C — Landing / Home Experience
- Hero section with Agri identity
- Friendly headline: "Plan your best season with Agri"
- Simple explanation in plain English
- Primary CTA: "Start Farm Analysis"
- Agricultural illustration

### Phase D — Farm Profile & Location (major UX change)
- Replace manual lat/lon with "Use My Current Location" + map selection
- Human-readable location labels (district/city when available)
- Manual fallback with city/village/district search
- All location states handled: not selected, detecting, selected, permission denied, unavailable

### Phase E — Analysis Year Experience
- Year dropdown with supported years only
- Default: previous full growing season
- Contextual tooltip explaining the year selects the historical analysis window
- Clear message when data unavailable for selected year

### Phase F — Farm Profile Form Redesign
- Guided multi-step flow:
  1. Where is your farm? (location)
  2. Which season are you planning for?
  3. What crops are you considering? (visual cards)
  4. What is your irrigation situation?
  5. What matters most? (priority sliders)
- Visual crop selection cards
- Priority weights explained in simple language
- Progress indicator for multi-step

### Phase G — Crop Selection Experience
- Attractive visual cards per crop
- Crop icon/image, name, short description
- Selection state with clear visual feedback
- Only eligible/selectable crops from backend catalogue

### Phase H — Data & Evidence Presentation
- Translate scientific terminology → farmer-friendly language
- Simple charts with clear labels
- Visual indicators for rainfall reliability, heat exposure, soil, water, frost
- Coverage and confidence indicators
- Tooltips with contextual explanations

### Phase I — Rotation Comparison & Results
- Premium comparison cards with clear hierarchy
- Which rotations are being compared: visible
- Why a rotation may be suitable: explained
- Evaluated factors: listed with status
- Evidence summary: what supports the result
- Confidence label visible
- Insufficient-evidence state: dedicated, thoughtful design
- No fake winner badges, no visual certainty when evidence insufficient

### Phase J — Sources & Transparency
- Organized source cards by category
- Clearly distinguish: NASA data, soil info, agricultural research, app assumptions
- Readable source names, descriptions
- Links to original sources where available
- Assumptions clearly separated from measured observations

### Phase K — Icons, Imagery & Illustrations
- Lucide icon library integrated
- Agricultural illustrations in empty states and hero section
- No emoji as main visual identity
- Thoughtful imagery only where it adds value

### Phase L — Micro-interactions & Animations
- Smooth page transitions (0.3s crossfade)
- Subtle card hover effects (background lift, border change)
- Button hover/press states (scale 0.95, color shift)
- Selection feedback (0.15s scale + color)
- Loading skeletons for all content sections
- Progress indicators with deterministic pacing
- Gentle chart entrance animations (staggered fade-in)
- Map marker press feedback
- Respects `prefers-reduced-motion`

### Phase M — Responsive Design
- Tested at: 360px, 375px, 390px, 430px, 768px, 1024px, 1280px, 1440px
- Mobile first-class: no horizontal overflow, no cut-off buttons, comfortable touch targets
- Map responsive sizing
- Drawer/modal behavior adapted for mobile

### Phase N — Accessibility & Usability
- Color contrast ratio ≥ 4.5:1 for normal text, ≥ 3:1 for large text
- Keyboard navigation: Tab order logical, focus visible
- Focus states: `outline: 2px solid var(--agri-primary)` on interactive elements
- Semantic HTML: proper heading hierarchy, labels associated
- Accessible dialogs: trap focus, ESC to close, aria-modal
- Clear validation messages: linked to inputs via `aria-describedby`
- Error recovery actions always visible
- Important info not communicated through color alone

### Phase O — Testing & Verification
- All existing API tests: must pass unchanged
- All existing frontend tests: must pass unchanged
- TypeScript typecheck: 0 errors
- Production build: 0 errors
- Browser journey: complete from landing through results
- Location permission granted: tested
- Location permission denied: tested
- Manual location selection: tested
- Analysis year selection: tested
- Crop selection: tested
- API loading/error states: tested
- Normal comparison results: tested
- Insufficient-evidence results: tested
- Sources and provenance: tested
- All responsive viewport widths: tested

### Phase P — Dependencies
- `@lucide/react` — icon library (lightweight, tree-shakeable)
- Minor CSS additions only — no new build dependencies
- Existing Vite + React + TypeScript stack preserved

### Phase Q — Files Modified (comprehensive)
- `apps/web/src/main.tsx` — bootstrap, Agri provider
- `apps/web/src/App.tsx` — full rewrite with Agri shell
- `apps/web/src/index.html` — favicon/meta updates
- `apps/web/src/styles.css` — complete redesign with CSS variables
- `apps/web/src/components/FarmForm.tsx` — guided form + location
- `apps/web/src/components/ComparisonSection.tsx` — premium results
- `apps/web/src/components/EvidenceSection.tsx` — farmer-friendly data
- `apps/web/src/components/SourcesPanel.tsx` — organized transparency
- `apps/web/src/components/ComparisonSection.tsx` — comparison cards
- `apps/web/src/components/ScenarioCard.tsx` — individual scenario display
- `apps/web/src/components/ui.tsx` — updated primitives with Agri styling
- `apps/web/src/lib/profile.ts` — may add location state
- `apps/web/src/lib/format.ts` — may add farmer-friendly format helpers
- `apps/web/src/components/EmptyState.tsx` — new component (if needed)
- `apps/web/src/components/LocationSelector.tsx` — new component (if needed)
- `apps/web/src/components/Herosection.tsx` — new component (if needed)

## Key Preservation Rules (strict)

| What | How Preserved |
|---|---|
| API contracts | Same endpoints, same request/response shapes |
| Decision engine | Identical C1–C5 logic, same evidence gate, same redistribution |
| NASA data integrity | Same null handling, same quality flags, same provenance |
| Test suite | All 128 tests unchanged and passing |
| `.env` | Never modified |
| `.gitignore` | Never modified |
| Backend logic | Zero changes to API servers, adapters, or engine |

## Delivery

- Comprehensive report at end (Section 21 of Phase 5 prompt)
- List of most important files changed
- No deployment, no git push, no credential changes