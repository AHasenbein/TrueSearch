import type { ReactNode } from "react";

export function ErrorBanner({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{body}</p>
      {actions ? <div className="mt-2 flex gap-2">{actions}</div> : null}
    </div>
  );
}

