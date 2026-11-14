import type { AnalysisHistoryEntry } from "../lib/history.js";

interface Props {
  entries: AnalysisHistoryEntry[];
  onOpen: (entry: AnalysisHistoryEntry) => void;
  onDelete: (entry: AnalysisHistoryEntry) => void;
}

export function HistorySection({ entries, onOpen, onDelete }: Props) {
  return (
    <section className="card history-section" id="history" aria-labelledby="history-heading">
      <div className="card-head">
        <div>
          <h2 id="history-heading">Analysis history</h2>
          <p className="muted">Saved only in this browser. Previous analyses are never re-run or replaced with new data.</p>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="history-empty"><strong>Your completed analyses will appear here.</strong><p>Run an analysis to save its original evidence and comparison for later review.</p></div>
      ) : (
        <div className="history-list">
          {entries.map((entry) => (
            <article className="history-entry" key={entry.id}>
              <div><strong>{entry.profile.locationLabel || "Location unavailable"}</strong><span>{new Date(entry.savedAt).toLocaleString()}</span></div>
              <div><span>{entry.profile.season === "kharif" ? "Kharif" : "Rabi"} {entry.profile.planningYear}</span><span>{Math.round(entry.comparison.evidenceCoverage * 100)}% evidence coverage</span></div>
              <div className="history-actions">
                <button type="button" className="button button-secondary" onClick={() => onOpen(entry)}>View original analysis</button>
                <details className="history-menu">
                  <summary aria-label={`Actions for analysis from ${new Date(entry.savedAt).toLocaleString()}`}>•••</summary>
                  <button type="button" className="history-delete" onClick={() => onDelete(entry)}>Delete analysis</button>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
