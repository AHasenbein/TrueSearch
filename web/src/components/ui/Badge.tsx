export function Badge({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  children: string;
}) {
  const map: Record<typeof tone, string> = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    success: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    warning: "bg-amber-100 text-amber-800 ring-amber-200",
    danger: "bg-rose-100 text-rose-800 ring-rose-200",
    info: "bg-blue-100 text-blue-800 ring-blue-200",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${map[tone]}`}>
      {children}
    </span>
  );
}

