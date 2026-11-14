import type { EngineResult, EvidenceResponse } from "@fieldshift/shared";
import type { FarmProfileInput } from "./profile.js";

export interface AnalysisHistoryEntry {
  id: string;
  savedAt: string;
  profile: FarmProfileInput;
  evidence: EvidenceResponse;
  comparison: EngineResult;
}

const HISTORY_KEY = "agri.analysis-history.v1";
const MAX_ENTRIES = 12;

export function loadHistory(): AnalysisHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as AnalysisHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entry: AnalysisHistoryEntry): AnalysisHistoryEntry[] {
  const next = [entry, ...loadHistory().filter((item) => item.id !== entry.id)].slice(0, MAX_ENTRIES);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function deleteHistory(id: string): AnalysisHistoryEntry[] {
  const next = loadHistory().filter((item) => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}
