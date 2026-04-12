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

export async function extractWithProvenance(documentText: string): Promise<ProvenanceRow[]> {
  if (!config.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

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
  const jsonStart = raw.indexOf("[");
  const jsonEnd = raw.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("Model did not return a JSON array");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    throw new Error("Failed to parse JSON from model output");
  }

  return responseSchema.parse(parsed);
}
