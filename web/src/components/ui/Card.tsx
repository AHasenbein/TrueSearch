import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {(title || subtitle || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            {title ? <h2 className="text-sm font-semibold text-slate-800">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          {right ? <div>{right}</div> : null}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

