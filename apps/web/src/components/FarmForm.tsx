import { type CropCatalogueEntry, type RotationCatalogueEntry } from "@fieldshift/shared";
import { useState } from "react";

import type { FarmProfileInput, ProfileErrors, SeasonValue } from "../lib/profile.js";
import { Field } from "./ui.js";

interface Props {
  profile: FarmProfileInput;
  errors: ProfileErrors;
  rotations: RotationCatalogueEntry[];
  crops: CropCatalogueEntry[];
  pending: boolean;
  catalogueError: string | null;
  onChange: (patch: Partial<FarmProfileInput>) => void;
  onSubmit: () => void;
}

const PRIORITY_LABELS: Array<{ key: keyof FarmProfileInput["priorities"]; label: string; hint: string }> = [
  { key: "water", label: "Water", hint: "Weight rainfall reliability and water demand" },
  { key: "soilHealth", label: "Soil health", hint: "Weight rotation structure: legumes and diversity" },
  { key: "climateResilience", label: "Climate resilience", hint: "Weight heat exposure and frost risk" },
];

const SUPPORTED_AREAS = [
  { id: "faisalabad", label: "Faisalabad", province: "Punjab", lat: 31.4187, lon: 73.0791 },
  { id: "multan", label: "Multan", province: "Punjab", lat: 30.1575, lon: 71.5249 },
  { id: "bahawalpur", label: "Bahawalpur", province: "Punjab", lat: 29.3956, lon: 71.6836 },
  { id: "lahore", label: "Lahore", province: "Punjab", lat: 31.5204, lon: 74.3587 },
  { id: "sahiwal", label: "Sahiwal", province: "Punjab", lat: 30.6682, lon: 73.1114 },
] as const;

export function FarmForm({
  profile,
  errors,
  rotations,
  crops,
  pending,
  catalogueError,
  onChange,
  onSubmit,
}: Props) {
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedArea, setSelectedArea] = useState("faisalabad");
  const prioritySum =
    profile.priorities.water + profile.priorities.soilHealth + profile.priorities.climateResilience;

  function toggleCandidate(id: string, checked: boolean) {
    if (id === profile.currentRotationId) return;
    const next = checked
      ? [...new Set([...profile.candidateRotationIds, id])]
      : profile.candidateRotationIds.filter((x) => x !== id);
    onChange({ candidateRotationIds: next });
  }

  const matchingAreas = SUPPORTED_AREAS.filter((area) => `${area.label} ${area.province}`.toLowerCase().includes(locationQuery.toLowerCase()));
  function selectArea(area: (typeof SUPPORTED_AREAS)[number]) {
    setSelectedArea(area.id);
    setLocationQuery("");
    onChange({ locationLabel: `${area.label}, ${area.province}`, lat: String(area.lat), lon: String(area.lon) });
  }

  return (
    <section className="card farm-journey" aria-labelledby="profile-heading">
      <div className="journey-head">
        <div><h2 id="profile-heading">Set up your farm</h2><p className="muted">A guided profile for an evidence-based comparison.</p></div>
        <div className="stepper" aria-label="Five farm setup stages"><span className="active" /><span className="active" /><span className="active" /><span className="active" /><span className="active" /></div>
      </div>

      <form
        className="farm-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        noValidate
      >
        <fieldset>
          <legend>1. Farm location</legend>
          <div className="farm-location-picker">
            <label htmlFor="farm-location-search">Select your farm location</label>
            <input id="farm-location-search" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Search or select your farm location…" />
            <div className="location-options" role="listbox" aria-label="Supported farm areas">
              {matchingAreas.length === 0 ? <p className="muted small">No supported farm area found. Only documented Punjab farm areas are currently available.</p> : matchingAreas.map((area) => <button key={area.id} type="button" role="option" aria-selected={selectedArea === area.id} className={selectedArea === area.id ? "location-option selected" : "location-option"} onClick={() => selectArea(area)}><span>{area.label}</span><small>{area.province}</small></button>)}
            </div>
            <p className="location-selected" aria-live="polite">Selected area: <strong>{profile.locationLabel}</strong></p>
            <p className="field-hint">These are geographic farm areas, not verified individual farms. NASA POWER provides regional grid-cell estimates; the rotation catalogue is currently documented for Punjab.</p>
          </div>
          {errors["lat"] || errors["lon"] ? <p className="field-error" role="alert">{errors["lat"] ?? errors["lon"]}</p> : null}
        </fieldset>

        <fieldset>
          <legend>2. Growing season and analysis year</legend>
          <div className="field-row">
            <Field id="season" label="Planning season" hint="Rabi runs Nov–May; kharif runs Apr–Nov.">
              <select
                id="season"
                name="season"
                value={profile.season}
                onChange={(e) => onChange({ season: e.target.value as SeasonValue })}
              >
                <option value="kharif">Kharif</option>
                <option value="rabi">Rabi</option>
              </select>
            </Field>
            <Field
              id="planningYear"
              label="Analysis year"
              error={errors["planningYear"]}
              hint="The year the season's sowing window starts. Past seasons have complete evidence."
            >
              <input
                id="planningYear"
                name="planningYear"
                inputMode="numeric"
                value={profile.planningYear}
                onChange={(e) => onChange({ planningYear: e.target.value })}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>3. Current practice and crop rotations</legend>
          {catalogueError ? (
            <p className="field-error" role="alert">
              {catalogueError}
            </p>
          ) : null}
          <div className="field-row">
            <Field id="currentRotation" label="Rotation you use now" error={errors["candidateRotationIds"]}>
              <select
                id="currentRotation"
                name="currentRotation"
                value={profile.currentRotationId}
                onChange={(e) => {
                  const id = e.target.value;
                  onChange({
                    currentRotationId: id,
                    candidateRotationIds: [...new Set([...profile.candidateRotationIds, id])],
                  });
                }}
              >
                {rotations.map((rotation) => (
                  <option key={rotation.id} value={rotation.id}>
                    {rotation.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="previousCrop" label="Previous crop (optional)">
              <select
                id="previousCrop"
                name="previousCrop"
                value={profile.previousCropId}
                onChange={(e) => onChange({ previousCropId: e.target.value })}
              >
                <option value="">Not specified</option>
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset className="nested">
            <legend>Rotations to compare</legend>
            {rotations.length === 0 ? (
              <p className="muted small">
                No rotation is currently evaluable. Rations are only offered when every crop has a documented
                calendar.
              </p>
            ) : (
              <ul className="checklist">
                {rotations.map((rotation) => {
                  const isCurrent = rotation.id === profile.currentRotationId;
                  return (
                    <li key={rotation.id}>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={profile.candidateRotationIds.includes(rotation.id)}
                          disabled={isCurrent}
                          onChange={(e) => toggleCandidate(rotation.id, e.target.checked)}
                        />
                        <span>
                          {rotation.label}
                          {isCurrent ? <span className="muted small"> — your current rotation (always included)</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        </fieldset>

        <fieldset>
          <legend>4. Farm context</legend>
          <Field id="irrigation" label="Water source">
            <select
              id="irrigation"
              name="irrigation"
              value={profile.irrigation}
              onChange={(e) => onChange({ irrigation: e.target.value as FarmProfileInput["irrigation"] })}
            >
              <option value="canal">Canal</option>
              <option value="tubewell">Tubewell</option>
              <option value="both">Canal and tubewell</option>
              <option value="rainfed">Rainfed</option>
            </select>
          </Field>
        </fieldset>

        <details className="advanced-location soil-details">
          <summary>Additional soil details (optional)</summary>
        <fieldset>
          <legend>Soil (leave blank if unknown)</legend>
          <p className="field-hint">
            These are your own field observations, not NASA data. If blank, SoilGrids estimates are shown
            separately and clearly labelled as predictions.
          </p>
          <div className="field-row three">
            <Field id="soilTexture" label="Texture" error={errors["soilTexture"]}>
              <input
                id="soilTexture"
                name="soilTexture"
                placeholder="e.g. sandy clay loam"
                value={profile.soilTexture}
                onChange={(e) => onChange({ soilTexture: e.target.value })}
              />
            </Field>
            <Field id="soilPh" label="pH" error={errors["soilPh"]}>
              <input
                id="soilPh"
                name="soilPh"
                inputMode="decimal"
                placeholder="e.g. 8.0"
                value={profile.soilPh}
                onChange={(e) => onChange({ soilPh: e.target.value })}
              />
            </Field>
            <Field id="organicMatter" label="Organic matter (%)" error={errors["organicMatter"]}>
              <input
                id="organicMatter"
                name="organicMatter"
                inputMode="decimal"
                placeholder="e.g. 0.6"
                value={profile.organicMatter}
                onChange={(e) => onChange({ organicMatter: e.target.value })}
              />
            </Field>
          </div>
          <Field id="farmSizeAcres" label="Farm size (acres, optional)" error={errors["farmSizeAcres"]}>
            <input
              id="farmSizeAcres"
              name="farmSizeAcres"
              inputMode="decimal"
              value={profile.farmSizeAcres}
              onChange={(e) => onChange({ farmSizeAcres: e.target.value })}
            />
          </Field>
        </fieldset>
        </details>

        <fieldset>
          <legend>5. Your priorities</legend>
          <p className="field-hint">
            Weights are relative; the API normalises them. They re-weight the comparison, they cannot create
            evidence that does not exist.
          </p>
          {PRIORITY_LABELS.map(({ key, label, hint }) => (
            <div className="priority" key={key}>
              <label htmlFor={`priority-${key}`}>
                {label} — {Math.round(profile.priorities[key] * 100)}%
                <span className="muted small"> {hint}</span>
              </label>
              <input
                id={`priority-${key}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={profile.priorities[key]}
                onChange={(e) =>
                  onChange({
                    priorities: { ...profile.priorities, [key]: Number(e.target.value) },
                  })
                }
              />
            </div>
          ))}
          {prioritySum <= 0 ? (
            <p className="field-error" role="alert">
              Set at least one priority above zero.
            </p>
          ) : null}
          {errors["priorities"] ? (
            <p className="field-error" role="alert">
              {errors["priorities"]}
            </p>
          ) : null}
        </fieldset>

        <div className="actions">
          <button type="submit" className="button" disabled={pending || rotations.length === 0}>
            {pending ? "Analyzing your farm…" : "Analyze my farm"}
          </button>
          <p className="muted small" role="status" aria-live="polite">
            {pending
              ? "Retrieving NASA weather evidence and comparing your rotations. This can take a few seconds."
              : "Agri uses live evidence. It never fills data gaps with estimates."}
          </p>
        </div>
      </form>
    </section>
  );
}
