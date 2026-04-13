import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import type { ExtractionRow } from "../types";

function paperTitle(row: ExtractionRow): string {
  const p = row.paperId;
  if (p && typeof p === "object") return p.title ?? "—";
  return "—";
}

export function ExtractionReview({
  rows,
  loading,
  error,
  selected,
  setSelected,
  onRefresh,
  editValue,
  setEditValue,
  note,
  setNote,
  busy,
  onPatchStatus,
}: {
  rows: ExtractionRow[];
  loading: boolean;
  error: string | null;
  selected: ExtractionRow | null;
  setSelected: (row: ExtractionRow) => void;
  onRefresh: () => void;
  editValue: string;
  setEditValue: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  busy: boolean;
  onPatchStatus: (status: ExtractionRow["status"]) => void;
}) {
  const approved = rows.filter((r) => r.status === "approved").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card
        title="Extraction Review"
        subtitle="Click any row to inspect provenance and approve, edit, or reject."
        right={
          <div className="flex items-center gap-2">
            <Badge tone="warning">Pending: {String(pending)}</Badge>
            <Badge tone="success">Approved: {String(approved)}</Badge>
            <Badge tone="danger">Rejected: {String(rejected)}</Badge>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        }
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading extractions...</p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-rose-600">{error}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No extracted rows yet"
            hint="Ingest and extract papers, then review provenance here."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                    <td className="px-4 py-3 font-medium text-slate-800">{paperTitle(row)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.metric}</td>
                    <td className="px-4 py-3 text-slate-900">{row.editedValue ?? row.value}</td>
                    <td className="px-4 py-3 text-slate-600">{(row.confidenceScore * 100).toFixed(0)}%</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          row.status === "approved"
                            ? "success"
                            : row.status === "rejected"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <Card title="Provenance" subtitle="Validate evidence and decide row status.">
          {!selected ? (
            <EmptyState title="No row selected" hint="Select an extraction row to inspect details." />
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
                  onClick={() => onPatchStatus("approved")}
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPatchStatus("pending")}
                  className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  Save edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPatchStatus("rejected")}
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}

