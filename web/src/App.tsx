import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { SearchWorkspace } from "./features/SearchWorkspace";
import { ExtractionReview } from "./features/ExtractionReview";
import type { ExtractionRow, SearchRunResponse } from "./types";

export default function App() {
  const [rows, setRows] = useState<ExtractionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExtractionRow | null>(null);
  const [note, setNote] = useState("");
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [metricQuery, setMetricQuery] = useState("price of biochar from sargassum per ton");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchRunResponse | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<"all" | "system" | "step" | "source">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<ExtractionRow[]>("/api/extractions");
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected) {
      setEditValue(selected.editedValue ?? selected.value);
      setNote(selected.reviewerNote ?? "");
    }
  }, [selected]);

  const stats = useMemo(() => {
    const approved = rows.filter((r) => r.status === "approved").length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const rejected = rows.filter((r) => r.status === "rejected").length;
    return { approved, pending, rejected, total: rows.length };
  }, [rows]);

  async function patchStatus(status: ExtractionRow["status"]) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api<ExtractionRow>(`/api/extractions/${selected._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          editedValue: editValue !== selected.value ? editValue : undefined,
          reviewerNote: note || undefined,
        }),
      });
      setRows((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
      setSelected(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function runMetricSearch() {
    if (!metricQuery.trim()) return;
    setSearchBusy(true);
    setSearchError(null);
    setNetworkError(null);
    try {
      const created = await api<{ runId: string; status: string }>("/api/search/runs", {
        method: "POST",
        body: JSON.stringify({
          metricQuery: metricQuery.trim(),
          maxPapers: 28,
          webLimit: 12,
        }),
      });
      const run = await api<SearchRunResponse>(`/api/search/runs/${created.runId}`);
      setSearchResult(run);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Metric search failed";
      setSearchError(msg);
      if (msg.includes("ECONNREFUSED") || msg.includes("Failed to fetch")) {
        setNetworkError("API unavailable. Confirm server is running on port 8787.");
      }
    } finally {
      setSearchBusy(false);
    }
  }

  useEffect(() => {
    if (!searchResult?._id) return;
    if (searchResult.status === "completed" || searchResult.status === "failed") return;
    const id = window.setInterval(async () => {
      try {
        const run = await api<SearchRunResponse>(`/api/search/runs/${searchResult._id}`);
        setSearchResult(run);
        setNetworkError(null);
      } catch {
        setNetworkError("Lost connection to API while polling run progress.");
      }
    }, 1600);
    return () => window.clearInterval(id);
  }, [searchResult?._id, searchResult?.status]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">TrueSearch</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Research Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Search, inspect, and validate evidence with a consistent interface designed for
            high-recall retrieval and provenance-backed review.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <SearchWorkspace
          metricQuery={metricQuery}
          onMetricQueryChange={setMetricQuery}
          onRunSearch={() => void runMetricSearch()}
          searchBusy={searchBusy}
          searchError={searchError}
          networkError={networkError}
          onRetry={() => void runMetricSearch()}
          onReload={() => {
            if (!searchResult?._id) return;
            void api<SearchRunResponse>(`/api/search/runs/${searchResult._id}`)
              .then((run) => {
                setSearchResult(run);
                setNetworkError(null);
              })
              .catch(() => setNetworkError("Reload failed. API still unreachable."));
          }}
          searchResult={searchResult}
          eventFilter={eventFilter}
          onEventFilterChange={setEventFilter}
        />

        <ExtractionReview
          rows={rows}
          loading={loading}
          error={error}
          selected={selected}
          setSelected={setSelected}
          onRefresh={() => void load()}
          editValue={editValue}
          setEditValue={setEditValue}
          note={note}
          setNote={setNote}
          busy={busy}
          onPatchStatus={(status) => void patchStatus(status)}
        />
      </main>
    </div>
  );
}
