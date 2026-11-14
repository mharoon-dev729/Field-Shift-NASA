import { PILOT, type CropCatalogueEntry, type RotationCatalogueEntry } from "@fieldshift/shared";
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

interface PlaceResult { display_name: string; lat: string; lon: string; }

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
  const [locationState, setLocationState] = useState<"idle" | "locating" | "selected" | "denied" | "unavailable">("idle");
  const [locationQuery, setLocationQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const prioritySum =
    profile.priorities.water + profile.priorities.soilHealth + profile.priorities.climateResilience;

  function toggleCandidate(id: string, checked: boolean) {
    if (id === profile.currentRotationId) return;
    const next = checked
      ? [...new Set([...profile.candidateRotationIds, id])]
      : profile.candidateRotationIds.filter((x) => x !== id);
    onChange({ candidateRotationIds: next });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationState("unavailable");
      return;
    }
    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({ lat: coords.latitude.toFixed(5), lon: coords.longitude.toFixed(5) });
        setLocationState("selected");
      },
      (error) => setLocationState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function searchFarmLocation(event: React.FormEvent) {
    event.preventDefault();
    const query = locationQuery.trim();
    if (!query) return;
    setSearching(true);
    setPlaceError(null);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=pk&q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Search service unavailable");
      const results: unknown = await response.json();
      setPlaceResults(Array.isArray(results) ? results.filter((item): item is PlaceResult => typeof item === "object" && item !== null && "display_name" in item && "lat" in item && "lon" in item) : []);
    } catch {
      setPlaceError("We could not search places right now. Try again or choose your location on the map.");
    } finally { setSearching(false); }
  }

  function selectPlace(place: PlaceResult) {
    onChange({ lat: Number(place.lat).toFixed(5), lon: Number(place.lon).toFixed(5) });
    setLocationQuery(place.display_name.split(",").slice(0, 2).join(","));
    setPlaceResults([]);
    setLocationState("selected");
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
          <div className="location-card">
            <h3>Faisalabad, Punjab</h3>
            <p>Select your farm location to ground the analysis in local conditions. Your precise coordinates stay private and are used only to request the analysis.</p>
            {locationState === "selected" ? <p className="location-status">✓ Location selected</p> : null}
            {locationState === "locating" ? <p className="location-status">Finding your location…</p> : null}
            {locationState === "denied" ? <p className="location-status">Location access was declined. You can continue with the pilot area.</p> : null}
            {locationState === "unavailable" ? <p className="location-status">We could not determine a location on this device. You can continue with the pilot area.</p> : null}
            <div className="location-actions">
              <button type="button" className="button button-primary" disabled={locationState === "locating"} onClick={useCurrentLocation}>{locationState === "locating" ? "Finding location…" : "Use my current location"}</button>
              <button type="button" className="button button-secondary" onClick={() => { onChange({ lat: String(PILOT.anchor.lat), lon: String(PILOT.anchor.lon) }); setLocationState("selected"); }}>Use Faisalabad pilot area</button>
            </div>
          </div>
          <div className="location-methods">
            <form className="location-search" onSubmit={searchFarmLocation}>
              <label htmlFor="farm-location-search">Search for my farm location</label>
              <div><input id="farm-location-search" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="City, district, town, or village" /><button className="button button-secondary" type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button></div>
              <p className="field-hint">Search results are supplied by OpenStreetMap. The selected point is used for NASA data; it is not a field measurement.</p>
            </form>
            {placeError ? <p className="field-error" role="alert">{placeError}</p> : null}
            {placeResults.length > 0 ? <ul className="place-results">{placeResults.map((place) => <li key={`${place.lat}-${place.lon}`}><button type="button" onClick={() => selectPlace(place)}>{place.display_name}</button></li>)}</ul> : null}
            <details className="map-selector"><summary>Select on map</summary><p>Choose an approximate farm point within Pakistan. NASA data is gridded, so it represents the surrounding area rather than a field-level measurement.</p><div className="map-grid" role="application" aria-label="Pakistan map selector" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const lon = 60 + ((event.clientX - rect.left) / rect.width) * 20; const lat = 37 - ((event.clientY - rect.top) / rect.height) * 14; onChange({ lat: lat.toFixed(5), lon: lon.toFixed(5) }); setLocationState("selected"); }}><span aria-hidden="true">+</span></div></details>
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
