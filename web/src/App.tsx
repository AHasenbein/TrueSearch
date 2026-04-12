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
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
