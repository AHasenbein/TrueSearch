import type { SearchEvent } from "../../types";

export function LogPanel({
  events,
  filter,
  onFilterChange,
}: {
  events: SearchEvent[];
  filter: "all" | "system" | "step" | "source";
  onFilterChange: (next: "all" | "system" | "step" | "source") => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Pipeline log</p>
        <select
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value as "all" | "system" | "step" | "source")}
        >
          <option value="all">All</option>
          <option value="system">System</option>
          <option value="step">Step</option>
          <option value="source">Source</option>
        </select>
      </div>
      <div className="max-h-56 overflow-auto p-3 font-mono text-xs leading-relaxed">
        {events.map((ev, idx) => (
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
        {events.length === 0 ? <p className="text-slate-400">No events yet.</p> : null}
      </div>
    </div>
  );
}

