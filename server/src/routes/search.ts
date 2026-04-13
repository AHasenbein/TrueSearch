import { Router } from "express";
import { z } from "zod";
import { SearchRun } from "../models/SearchRun.js";
import { config } from "../config.js";
import { runMetricSearch, type MetricSearchProgressEvent, type StepKey } from "../services/metricSearch.js";
import { appendRunEvent } from "../services/searchRunEvents.js";

const router = Router();
const sseClients = new Map<string, Set<(payload: string) => void>>();
const activeRuns = new Set<string>();

const stepDefs: Array<{ key: StepKey; label: string }> = [
  { key: "queryExpansion", label: "Query expansion" },
  { key: "discovery", label: "Literature discovery" },
  { key: "webDiscovery", label: "Web discovery" },
  { key: "contentSelection", label: "Content selection" },
  { key: "extraction", label: "Extraction" },
  { key: "normalizationAndSummary", label: "Normalization & summary" },
];

const schema = z.object({
  metricQuery: z.string().min(3),
  maxPapers: z.number().int().min(1).max(40).optional(),
  webLimit: z.number().int().min(1).max(30).optional(),
  yearMin: z.number().int().min(1900).max(2100).optional(),
  yearMax: z.number().int().min(1900).max(2100).optional(),
});

function emitSse(runId: string, event: MetricSearchProgressEvent | { type: "done" }) {
  const listeners = sseClients.get(runId);
  if (!listeners?.size) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const send of listeners) send(payload);
}

function eventNow() {
  return new Date().toISOString();
}

function plainEvents(
  events: Array<{ toObject?: () => unknown; at?: string; type?: "step" | "source" | "system"; level?: "info" | "warn" | "error"; message?: string; stepKey?: string | null | undefined }>
) {
  return events.map((e) => {
    const obj = typeof e.toObject === "function" ? (e.toObject() as Record<string, unknown>) : (e as Record<string, unknown>);
    return {
      at: String(obj.at ?? eventNow()),
      type: (obj.type as "step" | "source" | "system") ?? "system",
      level: (obj.level as "info" | "warn" | "error") ?? "info",
      message: String(obj.message ?? ""),
      stepKey: obj.stepKey == null ? undefined : String(obj.stepKey),
    };
  });
}

async function appendEvent(
  runId: string,
  event: { type: "step" | "source" | "system"; level: "info" | "warn" | "error"; message: string; stepKey?: string }
) {
  const run = await SearchRun.findById(runId);
  if (!run) return;
  const next = appendRunEvent(plainEvents(run.events ?? []), {
    at: eventNow(),
    type: event.type,
    level: event.level,
    message: event.message,
    stepKey: event.stepKey,
  });
  run.set("events", next);
  await run.save();
}

async function updateStep(runId: string, key: StepKey, status: "running" | "completed" | "failed", message?: string) {
  const run = await SearchRun.findById(runId);
  if (!run) return;
  const step = run.steps.find((s) => s.key === key);
  if (!step) return;
  step.status = status;
  step.message = message;
  if (status === "running" && !step.startedAt) step.startedAt = new Date();
  if (status === "completed" || status === "failed") step.endedAt = new Date();
  const next = appendRunEvent(plainEvents(run.events ?? []), {
    at: eventNow(),
    type: "step",
    stepKey: key,
    level: status === "failed" ? "error" : "info",
    message: message ?? `${step.label} ${status}`,
  });
  run.set("events", next);
  await run.save();
}

async function processRun(runId: string): Promise<void> {
  activeRuns.add(runId);
  const run = await SearchRun.findById(runId);
  if (!run) {
    activeRuns.delete(runId);
    return;
  }
  run.status = "running";
  run.set("events", appendRunEvent(plainEvents(run.events ?? []), {
    at: eventNow(),
    type: "system",
    level: "info",
    message: "Run started",
  }));
  await run.save();

  try {
    const handleProgressEvent = async (event: MetricSearchProgressEvent) => {
      try {
        if (event.type === "step") {
          await updateStep(runId, event.key, event.status, event.message);
        } else {
          const latest = await SearchRun.findById(runId);
          if (!latest) return;
          const idx = latest.sources.findIndex((s) => s.sourceId === event.source.sourceId);
          const next = [...latest.sources.map((s) => s.toObject()), event.source];
          if (idx >= 0) {
            next[idx] = event.source;
          }
          latest.set("sources", next);
          const nextEvents = appendRunEvent(plainEvents(latest.events ?? []), {
            at: eventNow(),
            type: "source",
            level:
              event.source.status === "failed"
                ? "error"
                : event.source.status === "no_match"
                  ? "warn"
                  : "info",
            message: `[${event.source.sourceType}] ${event.source.title} -> ${event.source.status}`,
          });
          latest.set("events", nextEvents);
          await latest.save();
        }
        emitSse(runId, event);
      } catch (err) {
        await appendEvent(runId, {
          type: "system",
          level: "error",
          message: `progress-event failure: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    const result = await runMetricSearch(
      {
        metricQuery: run.metricQuery,
        maxPapers: run.maxPapers,
        webLimit: run.webLimit,
        yearMin: run.yearMin ?? undefined,
        yearMax: run.yearMax ?? undefined,
      },
      (event) => {
        void handleProgressEvent(event);
      }
    );

    const latest = await SearchRun.findById(runId);
    if (!latest) return;
    latest.status = "completed";
    latest.expandedQueries = result.expandedQueries;
    latest.canonicalMetric = result.canonicalMetric;
    latest.papersScanned = result.papersScanned;
    latest.matchesCount = result.matches.length;
    latest.normalizedSummary = result.normalizedSummary;
    latest.set("sources", result.sourceOutcomes);
    latest.set("events", appendRunEvent(plainEvents(latest.events ?? []), {
      at: eventNow(),
      type: "system",
      level: "info",
      message: "Run completed",
    }));
    await latest.save();
    emitSse(runId, { type: "done" });
  } catch (e) {
    const latest = await SearchRun.findById(runId);
    if (!latest) return;
    latest.status = "failed";
    latest.error = e instanceof Error ? e.message : "run failed";
    latest.set("events", appendRunEvent(plainEvents(latest.events ?? []), {
      at: eventNow(),
      type: "system",
      level: "error",
      message: latest.error,
    }));
    await latest.save();
  } finally {
    activeRuns.delete(runId);
  }
}

router.post("/runs", async (req, res) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const maxPapers = parsed.data.maxPapers ?? config.defaultMetricSearchLimit;
    const webLimit = parsed.data.webLimit ?? config.defaultWebSearchLimit;
    const run = await SearchRun.create({
      metricQuery: parsed.data.metricQuery,
      maxPapers,
      webLimit,
      yearMin: parsed.data.yearMin,
      yearMax: parsed.data.yearMax,
      status: "queued",
      steps: stepDefs.map((s) => ({ key: s.key, label: s.label, status: "pending" })),
      sources: [],
      events: [
        {
          at: eventNow(),
          type: "system",
          level: "info",
          message: "Run queued",
        },
      ],
      normalizedSummary: {
        averageApplicable: false,
        averageUsdPerTon: null,
        minUsdPerTon: null,
        maxUsdPerTon: null,
        countNormalized: 0,
        weightedConfidence: null,
      },
    });
    setImmediate(() => {
      void processRun(String(run._id)).catch(async (err) => {
        await appendEvent(String(run._id), {
          type: "system",
          level: "error",
          message: err instanceof Error ? err.message : "unhandled run error",
        });
      });
    });
    res.status(202).json({ runId: String(run._id), status: run.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed to start run";
    res.status(500).json({ error: msg });
  }
});

router.get("/runs/:id", async (req, res) => {
  try {
    const run = await SearchRun.findById(req.params.id).lean();
    if (!run) return res.status(404).json({ error: "not found" });
    res.json(run);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed to load run";
    res.status(500).json({ error: msg });
  }
});

router.get("/runs/:id/stream", async (req, res) => {
  const runId = req.params.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (payload: string) => res.write(payload);
  if (!sseClients.has(runId)) sseClients.set(runId, new Set());
  sseClients.get(runId)!.add(send);
  res.write(`data: ${JSON.stringify({ type: "connected", runId })}\n\n`);
  req.on("close", () => {
    const listeners = sseClients.get(runId);
    if (!listeners) return;
    listeners.delete(send);
    if (listeners.size === 0) sseClients.delete(runId);
  });
});

router.post("/metric", async (req, res) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const maxPapers = parsed.data.maxPapers ?? config.defaultMetricSearchLimit;
    const webLimit = parsed.data.webLimit ?? config.defaultWebSearchLimit;
    const run = await SearchRun.create({
      metricQuery: parsed.data.metricQuery,
      maxPapers,
      webLimit,
      yearMin: parsed.data.yearMin,
      yearMax: parsed.data.yearMax,
      status: "queued",
      steps: stepDefs.map((s) => ({ key: s.key, label: s.label, status: "pending" })),
      sources: [],
      events: [],
    });
    await processRun(String(run._id));
    const done = await SearchRun.findById(run._id).lean();
    if (!done) return res.status(500).json({ error: "failed to load completed run" });
    if (done.status === "failed")
      return res.status(500).json({ error: done.error ?? "metric search failed" });
    return res.json(done);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "metric search failed";
    return res.status(500).json({ error: msg });
  }
});

router.get("/runs", async (_req, res) => {
  try {
    const runs = await SearchRun.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select("metricQuery status papersScanned matchesCount normalizedSummary createdAt")
      .lean();
    res.json(runs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed to load runs";
    res.status(500).json({ error: msg });
  }
});

export function getSearchRuntimeStats() {
  let sseConnections = 0;
  for (const listeners of sseClients.values()) sseConnections += listeners.size;
  return {
    activeRuns: activeRuns.size,
    sseConnections,
  };
}

export const searchRouter = router;

