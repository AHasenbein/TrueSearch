import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { LogPanel } from "../components/ui/LogPanel";
import { ProgressBar } from "../components/ui/ProgressBar";
import { StatTile } from "../components/ui/StatTile";
import type { SearchRunResponse } from "../types";

export function SearchWorkspace({
  metricQuery,
  onMetricQueryChange,
  onRunSearch,
  searchBusy,
  searchError,
  networkError,
  onRetry,
  onReload,
  searchResult,
  eventFilter,
  onEventFilterChange,
}: {
  metricQuery: string;
  onMetricQueryChange: (v: string) => void;
  onRunSearch: () => void;
  searchBusy: boolean;
  searchError: string | null;
  networkError: string | null;
  onRetry: () => void;
  onReload: () => void;
  searchResult: SearchRunResponse | null;
  eventFilter: "all" | "system" | "step" | "source";
  onEventFilterChange: (v: "all" | "system" | "step" | "source") => void;
}) {
  const filteredEvents = (searchResult?.events ?? []).filter(
    (ev) => eventFilter === "all" || ev.type === eventFilter
  );
  const progress = progressFromSteps(searchResult?.steps ?? []);
  const matchedCount = searchResult?.sources.filter((s) => s.status === "matched").length ?? 0;
  const processedCount =
    searchResult?.sources.filter(
      (s) => s.status === "matched" || s.status === "no_match" || s.status === "failed"
    ).length ?? 0;

  return (
    <div className="space-y-6">
      {networkError ? (
        <ErrorBanner
          title="Connection issue"
          body={networkError}
          actions={
            <>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
              >
                Retry run
              </button>
              {searchResult?._id ? (
                <button
                  type="button"
                  onClick={onReload}
                  className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                >
                  Reload run
                </button>
              ) : null}
            </>
          }
        />
      ) : null}

      <Card
        title="Metric Search"
        subtitle="Expanded retrieval with pipeline visibility and source-level outcomes."
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              value={metricQuery}
              onChange={(e) => onMetricQueryChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              placeholder="amount of sargassum that washes up in florida in tons"
            />
            <button
              type="button"
              onClick={onRunSearch}
              disabled={searchBusy}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {searchBusy ? "Starting..." : "Run search"}
            </button>
          </div>
          {searchError ? <p className="text-sm text-rose-600">{searchError}</p> : null}

          {!searchResult ? (
            <EmptyState
              title="No active run yet"
              hint="Start with a natural language metric query to see pipeline progress and source evidence."
            />
          ) : (
            <div className="space-y-3">
              <Card
                title="Run Progress"
                right={<span className="text-xs text-slate-500">{progress}%</span>}
              >
                <ProgressBar value={progress} />
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {searchResult.steps.map((step) => (
                    <div key={step.key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-700">{step.label}</p>
                        <Badge
                          tone={
                            step.status === "completed"
                              ? "success"
                              : step.status === "running"
                                ? "info"
                                : step.status === "failed"
                                  ? "danger"
                                  : "neutral"
                          }
                        >
                          {step.status}
                        </Badge>
                      </div>
                      {step.message ? <p className="mt-1 text-xs text-slate-500">{step.message}</p> : null}
                    </div>
                  ))}
                </div>
              </Card>

              <LogPanel events={filteredEvents} filter={eventFilter} onFilterChange={onEventFilterChange} />

              <div className="grid gap-3 md:grid-cols-5">
                <StatTile label="Papers scanned" value={String(searchResult.papersScanned)} />
                <StatTile label="Matched values" value={String(matchedCount)} />
                <StatTile label="Processed sources" value={String(processedCount)} />
                <StatTile
                  label="Average (normalized)"
                  value={
                    searchResult.normalizedSummary.averageApplicable &&
                    searchResult.normalizedSummary.averageUsdPerTon != null
                      ? formatMoney(searchResult.normalizedSummary.averageUsdPerTon)
                      : "N/A"
                  }
                />
                <StatTile
                  label="Weighted confidence"
                  value={
                    searchResult.normalizedSummary.weightedConfidence != null
                      ? `${(searchResult.normalizedSummary.weightedConfidence * 100).toFixed(0)}%`
                      : "N/A"
                  }
                />
              </div>

              {searchResult.status === "failed" ? (
                <ErrorBanner
                  title="Run failed"
                  body={searchResult.error ?? "Unknown run failure"}
                  actions={
                    <button
                      type="button"
                      onClick={onRunSearch}
                      className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
                    >
                      Start new run
                    </button>
                  }
                />
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
                          <Badge
                            tone={
                              m.status === "matched"
                                ? "success"
                                : m.status === "no_match" || m.status === "failed"
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            {m.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{m.value ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-900">
                          {m.normalizedValue != null ? formatMoney(m.normalizedValue) : "N/A"}
                          {m.normalizationWarnings && m.normalizationWarnings.length > 0 ? (
                            <p className="text-xs text-amber-700">
                              {m.normalizationWarnings.join(" ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {m.confidenceScore != null ? `${(m.confidenceScore * 100).toFixed(0)}%` : "—"}
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
          )}
        </div>
      </Card>
    </div>
  );
}

function progressFromSteps(steps: Array<{ status: "pending" | "running" | "completed" | "failed" }>): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((s) => s.status === "completed").length;
  return Math.round((completed / steps.length) * 100);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

