export type RunEventType = "step" | "source" | "system";

export type RunEvent = {
  at: string;
  type: RunEventType;
  stepKey?: string;
  level: "info" | "warn" | "error";
  message: string;
};

export function appendRunEvent(events: RunEvent[], next: RunEvent, max = 400): RunEvent[] {
  const merged = [...events, next];
  if (merged.length <= max) return merged;
  return merged.slice(merged.length - max);
}

export function progressFromSteps(
  steps: Array<{ status: "pending" | "running" | "completed" | "failed" }>
): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((s) => s.status === "completed").length;
  return Math.round((completed / steps.length) * 100);
}

