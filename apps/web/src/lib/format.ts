/** Display helpers. A missing value is never rendered as a number. */

export const NOT_AVAILABLE = "Not available";

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatUnit(value: string | null | undefined): string {
  if (!value) return "";
  return value === "1" ? "fraction (0–1)" : value;
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return NOT_AVAILABLE;
  return `${(fraction * 100).toFixed(0)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" });
}

export function formatWindow(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return NOT_AVAILABLE;
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

/** Short label for a variable, keeping the source code visible. */
export function variableLabel(variable: string, label?: string): string {
  return label ? `${label} (${variable})` : variable;
}

export function confidenceLabel(confidence: string): string {
  switch (confidence) {
    case "moderate":
      return "Moderate confidence";
    case "low":
      return "Low confidence";
    case "insufficient_evidence":
      return "Not enough evidence";
    default:
      return confidence;
  }
}

/** Criterion status as displayed to a farmer. */
export function criterionStatusLabel(available: boolean, status: string): string {
  if (!available) return "Not evaluated";
  return status === "partial" ? "Partial evidence" : "Evaluated";
}
