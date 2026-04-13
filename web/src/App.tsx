import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";

type PaperRef = {
  _id: string;
  title?: string;
  year?: number;
  doi?: string;
};

type ExtractionRow = {
  _id: string;
  paperId: PaperRef | string;
  metric: string;
  value: string;
  confidenceScore: number;
  sourceSnippet: string;
  section?: string;
  status: "pending" | "approved" | "rejected";
  editedValue?: string;
  reviewerNote?: string;
  model?: string;
};

type MetricMatch = {
  paperId: string;
  paperTitle: string;
  year?: number;
  doi?: string;
  sourceUrl?: string;
  metric: string;
  value: string;
  confidenceScore: number;
  sourceSnippet: string;
  section?: string;
  normalizedUsdPerTon: number | null;
  normalizationConfidence: number;
  normalizationWarnings: string[];
  model: string;
  sourceType?: "paper" | "web";
};

type SearchStep = {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  message?: string;
};

type SourceOutcome = {
  sourceId: string;
  title: string;
  url?: string;
  sourceType: "paper" | "web";
  trustScore: number;
  status: "queued" | "processing" | "matched" | "no_match" | "failed";
  message?: string;
  metric?: string;
  value?: string;
  confidenceScore?: number;
  sourceSnippet?: string;
  normalizedValue?: number | null;
  normalizationWarnings?: string[];
  model?: string;
};

type SearchRunResponse = {
  _id: string;
  metricQuery: string;
  status: "queued" | "running" | "completed" | "failed";
  expandedQueries?: string[];
  canonicalMetric?: string;
  papersScanned: number;
  steps: SearchStep[];
  sources: SourceOutcome[];
  events?: Array<{
    at: string;
    type: "step" | "source" | "system";
    stepKey?: string;
    level: "info" | "warn" | "error";
    message: string;
  }>;
  normalizedSummary: {
    averageApplicable: boolean;
    averageUsdPerTon: number | null;
    minUsdPerTon: number | null;
    maxUsdPerTon: number | null;
    countNormalized: number;
    weightedConfidence: number | null;
  };
  error?: string;
};

function paperTitle(row: ExtractionRow): string {
  const p = row.paperId;
  if (p && typeof p === "object") return p.title ?? "—";
  return "—";
}

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
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">
              TrueSearch
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">Provenance review</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Click a row to inspect the verbatim source snippet behind each extracted metric.
              Approve verified rows, edit values when the model is slightly off, or reject bad
              extractions to refine prompts.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <StatPill label="Pending" value={stats.pending} tone="amber" />
            <StatPill label="Approved" value={stats.approved} tone="emerald" />
            <StatPill label="Rejected" value={stats.rejected} tone="rose" />
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          {networkError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p className="font-semibold">Connection issue</p>
              <p>{networkError}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void runMetricSearch()}
                  className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
                >
                  Retry run
                </button>
                {searchResult?._id ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const run = await api<SearchRunResponse>(`/api/search/runs/${searchResult._id}`);
                        setSearchResult(run);
                        setNetworkError(null);
                      } catch {
                        setNetworkError("Reload failed. API still unreachable.");
                      }
                    }}
                    className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                  >
                    Reload run
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Metric search</h2>
              <p className="mt-1 text-xs text-slate-500">
                Query expansion, broader discovery, and live pipeline status with source-level
                outcomes (green matched / red no-match).
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  value={metricQuery}
                  onChange={(e) => setMetricQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  placeholder="price of biochar from sargassum per ton"
                />
                <button
                  type="button"
                  onClick={() => void runMetricSearch()}
                  disabled={searchBusy}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {searchBusy ? "Starting..." : "Run search"}
                </button>
              </div>

              {searchError ? <p className="text-sm text-rose-600">{searchError}</p> : null}

              {searchResult ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Progress
                      </p>
                      <p className="text-xs text-slate-600">{progressFromSteps(searchResult.steps)}%</p>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-teal-600 transition-all"
                        style={{ width: `${progressFromSteps(searchResult.steps)}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Pipeline status:{" "}
                      <span className="capitalize text-slate-800">{searchResult.status}</span>
                    </p>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      {searchResult.steps.map((step) => (
                        <div
                          key={step.key}
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            step.status === "completed"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : step.status === "running"
                                ? "border-blue-200 bg-blue-50 text-blue-900"
                                : step.status === "failed"
                                  ? "border-rose-200 bg-rose-50 text-rose-900"
                                  : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <p className="font-semibold">{step.label}</p>
                          <p className="capitalize">{step.status}</p>
                          {step.message ? <p className="mt-1">{step.message}</p> : null}
                        </div>
                      ))}
                    </div>
                    {searchResult.expandedQueries?.length ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Expanded queries: {searchResult.expandedQueries.join(" | ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-950 text-slate-100">
                    <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                        Pipeline log
                      </p>
                      <select
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                        value={eventFilter}
                        onChange={(e) =>
                          setEventFilter(e.target.value as "all" | "system" | "step" | "source")
                        }
                      >
                        <option value="all">All</option>
                        <option value="system">System</option>
                        <option value="step">Step</option>
                        <option value="source">Source</option>
                      </select>
                    </div>
                    <div className="max-h-52 overflow-auto p-3 font-mono text-xs leading-relaxed">
                      {(searchResult.events ?? [])
                        .filter((ev) => eventFilter === "all" || ev.type === eventFilter)
                        .slice(-120)
                        .map((ev, idx) => (
                          <p
                            key={`${ev.at}-${idx}`}
                            className={
                              ev.level === "error"
                                ? "text-rose-300"
                                : ev.level === "warn"
                                  ? "text-amber-300"
                                  : "text-emerald-300"
                            }
                          >
                            [{new Date(ev.at).toLocaleTimeString()}] {ev.type.toUpperCase()} {ev.message}
                          </p>
                        ))}
                      {(searchResult.events ?? []).length === 0 ? (
                        <p className="text-slate-400">No events yet.</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <SummaryStat
                      label="Papers scanned"
                      value={String(searchResult.papersScanned)}
                    />
                    <SummaryStat
                      label="Matched values"
                      value={String(searchResult.sources.filter((s) => s.status === "matched").length)}
                    />
                    <SummaryStat
                      label="Processed sources"
                      value={String(
                        searchResult.sources.filter(
                          (s) => s.status === "matched" || s.status === "no_match" || s.status === "failed"
                        ).length
                      )}
                    />
                    <SummaryStat
                      label="Average (USD/t)"
                      value={
                        searchResult.normalizedSummary.averageApplicable &&
                        searchResult.normalizedSummary.averageUsdPerTon != null
                          ? formatMoney(searchResult.normalizedSummary.averageUsdPerTon)
                          : "N/A"
                      }
                    />
                    <SummaryStat
                      label="Weighted confidence"
                      value={
                        searchResult.normalizedSummary.weightedConfidence != null
                          ? `${(searchResult.normalizedSummary.weightedConfidence * 100).toFixed(0)}%`
                          : "N/A"
                      }
                    />
                  </div>

                  {searchResult.status === "failed" ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      <p className="font-semibold">Run failed</p>
                      <p>{searchResult.error ?? "Unknown run failure"}</p>
                      <button
                        type="button"
                        onClick={() => void runMetricSearch()}
                        className="mt-2 rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
                      >
                        Start new run
                      </button>
                    </div>
                  ) : null}

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Extracted</th>
                          <th className="px-3 py-2 font-medium">Normalized</th>
                          <th className="px-3 py-2 font-medium">Conf.</th>
                          <th className="px-3 py-2 font-medium">Snippet</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {searchResult.sources.map((m, idx) => (
                          <tr
                            key={`${m.sourceId}-${idx}`}
                            className={
                              m.status === "matched"
                                ? "bg-emerald-50/50"
                                : m.status === "no_match" || m.status === "failed"
                                  ? "bg-rose-50/40"
                                  : ""
                            }
                          >
                            <td className="px-3 py-2 text-slate-700">
                              {m.url ? (
                                <a
                                  href={m.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-medium text-teal-700 hover:underline"
                                >
                                  {m.title}
                                </a>
                              ) : (
                                <span className="font-medium text-slate-800">{m.title}</span>
                              )}
                              <p className="text-xs text-slate-500">{m.sourceType.toUpperCase()}</p>
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                  m.status === "matched"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : m.status === "no_match" || m.status === "failed"
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {m.status.replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{m.value ?? "—"}</td>
                            <td className="px-3 py-2 text-slate-900">
                              {m.normalizedValue != null
                                ? formatMoney(m.normalizedValue)
                                : "N/A"}
                              {m.normalizationWarnings && m.normalizationWarnings.length > 0 ? (
                                <p className="text-xs text-amber-700">
                                  {m.normalizationWarnings.join(" ")}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {m.confidenceScore != null
                                ? `${(m.confidenceScore * 100).toFixed(0)}%`
                                : "—"}
                            </td>
                            <td className="max-w-xl px-3 py-2 text-xs leading-relaxed text-slate-700">
                              {m.sourceSnippet ?? m.message ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Extracted metrics</h2>
            <span className="text-xs text-slate-500">{stats.total} rows</span>
          </div>
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Loading…</p>
          ) : error ? (
            <p className="px-4 py-10 text-center text-sm text-rose-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              No extractions yet. Use the API to ingest papers, parse text, then run extraction.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Paper</th>
                    <th className="px-4 py-3 font-medium">Metric</th>
                    <th className="px-4 py-3 font-medium">Value</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr
                      key={row._id}
                      onClick={() => setSelected(row)}
                      className={`cursor-pointer transition hover:bg-teal-50/60 ${
                        selected?._id === row._id ? "bg-teal-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {paperTitle(row)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.metric}</td>
                      <td className="px-4 py-3 text-slate-900">
                        {row.editedValue ?? row.value}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {(row.confidenceScore * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </section>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {!selected ? (
              <p className="text-sm text-slate-500">
                Select a metric row to open its provenance card.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {paperTitle(selected)}
                  </p>
                  <h3 className="text-lg font-semibold text-slate-900">{selected.metric}</h3>
                  <p className="text-xs text-slate-500">
                    Model: {selected.model ?? "—"}
                    {selected.section ? ` · ${selected.section}` : ""}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Extracted value</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-inner focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Source snippet</label>
                  <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                    {selected.sourceSnippet}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Reviewer note</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-inner focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional context for your decision"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patchStatus("approved")}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patchStatus("pending")}
                    className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Save edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patchStatus("rejected")}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  “Save edit” keeps the row pending while persisting your corrected value and note.
                  Use Approve when the snippet and value match your verification.
                </p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function progressFromSteps(steps: SearchStep[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((s) => s.status === "completed").length;
  return Math.round((completed / steps.length) * 100);
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "rose";
}) {
  const tones: Record<typeof tone, string> = {
    amber: "bg-amber-50 text-amber-900 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-900 ring-emerald-100",
    rose: "bg-rose-50 text-rose-900 ring-rose-100",
  };
  return (
    <div
      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {label}: {value}
    </div>
  );
}

function StatusBadge({ status }: { status: ExtractionRow["status"] }) {
  const map: Record<ExtractionRow["status"], string> = {
    pending: "bg-amber-50 text-amber-800 ring-amber-100",
    approved: "bg-emerald-50 text-emerald-800 ring-emerald-100",
    rejected: "bg-rose-50 text-rose-800 ring-rose-100",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${map[status]}`}
    >
      {status}
    </span>
  );
}
