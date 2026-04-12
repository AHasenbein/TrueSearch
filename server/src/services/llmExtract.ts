import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { z } from "zod";
import { config } from "../config.js";

const rowSchema = z.object({
  metric: z.string(),
  value: z.string(),
  confidence_score: z.number().min(0).max(1),
  source_snippet: z.string(),
  section: z.string().optional(),
});

const responseSchema = z.array(rowSchema);

const SYSTEM = `You are a precise scientific information extractor for sargassum / macroalgae pyrolysis and biochar literature.
You MUST output valid JSON only: a single JSON array. No markdown fences, no commentary.
For every metric you extract, you MUST include the exact verbatim sentence (or contiguous clause) from the document that justifies the value — this is mandatory provenance.
If the text does not contain a metric, omit it. Do not invent numbers or snippets.
Use snake_case keys exactly as specified.`;

function userPrompt(documentText: string): string {
  return `Extract pyrolysis-relevant quantitative and categorical findings from the document below.

Target examples (non-exhaustive): peak_temperature, heating_rate, residence_time, biochar_yield_percent, biochar_surface_area, syngas_composition, reactor_type, feedstock_moisture, elemental_C_H_N, HHV, ash_content.

Return JSON array of objects with keys:
- metric (string slug)
- value (string, include units in the string)
- confidence_score (number 0-1)
- source_snippet (exact sentence from the document — copy verbatim)
- section (optional: e.g. Methodology, Results)

Document:
---
${documentText.slice(0, 120_000)}
---`;
}

export type ProvenanceRow = z.infer<typeof rowSchema>;

export type ExtractionRunMeta = {
  usedProvider: "google" | "openrouter";
  /** Model identifier for logs / UI */
  usedModel: string;
};

export type ProvenanceExtractionResult = {
  rows: ProvenanceRow[];
} & ExtractionRunMeta;

function parseJsonArrayFromModelOutput(raw: string): ProvenanceRow[] {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("[");
  const jsonEnd = trimmed.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("Model did not return a JSON array");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  } catch {
    throw new Error("Failed to parse JSON from model output");
  }

  return responseSchema.parse(parsed);
}

function openRouterClient(): OpenAI {
  const defaultHeaders: Record<string, string> = {};
  if (config.openRouterHttpReferer) {
    defaultHeaders["HTTP-Referer"] = config.openRouterHttpReferer;
  }
  if (config.openRouterAppTitle) {
    defaultHeaders["X-OpenRouter-Title"] = config.openRouterAppTitle;
  }

  return new OpenAI({
    apiKey: config.openRouterApiKey,
    baseURL: config.openRouterBaseUrl,
    defaultHeaders: Object.keys(defaultHeaders).length ? defaultHeaders : undefined,
  });
}

async function extractViaOpenRouter(documentText: string): Promise<ProvenanceExtractionResult> {
  const client = openRouterClient();
  const completion = await client.chat.completions.create({
    model: config.openRouterModel,
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt(documentText) },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  const rows = parseJsonArrayFromModelOutput(raw);
  return {
    rows,
    usedProvider: "openrouter",
    usedModel: config.openRouterModel,
  };
}

async function extractViaGoogleGemini(documentText: string): Promise<ProvenanceExtractionResult> {
  const genAI = new GoogleGenerativeAI(config.googleAiApiKey);
  const model = genAI.getGenerativeModel({
    model: config.googleGeminiModel,
    systemInstruction: SYSTEM,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(userPrompt(documentText));
  const raw = result.response.text()?.trim() ?? "";
  const rows = parseJsonArrayFromModelOutput(raw);
  return {
    rows,
    usedProvider: "google",
    usedModel: config.googleGeminiModel,
  };
}

/** True when the provider is asking us to back off (quota, RPM, concurrency). */
function isLikelyThrottleError(err: unknown): boolean {
  if (err == null) return false;

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const status = o.status ?? o.statusCode ?? o.code;
    if (status === 429 || status === "429") return true;

    const nested = o.error as Record<string, unknown> | undefined;
    if (nested && (nested.code === 429 || nested.status === "RESOURCE_EXHAUSTED")) {
      return true;
    }

    const msg = String(o.message ?? nested?.message ?? o.error ?? "");
    const lower = msg.toLowerCase();
    if (
      lower.includes("resource exhausted") ||
      lower.includes("resource_exhausted") ||
      lower.includes("too many requests") ||
      lower.includes("rate limit") ||
      lower.includes("quota exceeded") ||
      /\b429\b/.test(lower)
    ) {
      return true;
    }
  }

  const s = String(err);
  return /\b429\b|resource exhausted|rate limit|quota/i.test(s);
}

/**
 * Prefer Google AI Studio (Gemini) when `GOOGLE_AI_API_KEY` is set.
 * On throttle / quota errors, fall back to OpenRouter if `OPENROUTER_API_KEY` is set.
 * If only OpenRouter is configured, uses OpenRouter directly.
 */
export async function extractWithProvenance(
  documentText: string
): Promise<ProvenanceExtractionResult> {
  const hasGoogle = Boolean(config.googleAiApiKey);
  const hasOpenRouter = Boolean(config.openRouterApiKey);

  if (!hasGoogle && !hasOpenRouter) {
    throw new Error(
      "Set GOOGLE_AI_API_KEY and/or OPENROUTER_API_KEY (need at least one LLM provider)"
    );
  }

  if (hasGoogle) {
    try {
      return await extractViaGoogleGemini(documentText);
    } catch (err) {
      if (isLikelyThrottleError(err) && hasOpenRouter) {
        return await extractViaOpenRouter(documentText);
      }
      throw err;
    }
  }

  return extractViaOpenRouter(documentText);
}
