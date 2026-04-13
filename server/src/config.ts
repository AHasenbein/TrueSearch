import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Root `.env` — npm workspaces often run the server with `cwd` = `server/`, which skips a repo-level `.env` if we only rely on `dotenv/config`. */
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const openRouterBaseUrl =
  process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";

/** Default: Gemini 2.0 Flash on OpenRouter — strong on long documents, typically low $/1M tokens vs frontier models. */
const defaultOpenRouterModel =
  process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.0-flash-001";

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: Number(process.env.PORT) || 8787,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/truesearch",
  grobidUrl: process.env.GROBID_URL || "http://127.0.0.1:8070",
  corsOrigin: process.env.CORS_ORIGIN || "http://127.0.0.1:5173",

  openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || "",
  openRouterBaseUrl,
  /** Full OpenRouter model id, e.g. google/gemini-2.0-flash-001, openai/gpt-4o-mini, deepseek/deepseek-chat */
  openRouterModel: defaultOpenRouterModel,
  /** Optional OpenRouter app attribution (https://openrouter.ai/docs/app-attribution) */
  openRouterHttpReferer: process.env.OPENROUTER_HTTP_REFERER?.trim() || "",
  openRouterAppTitle: process.env.OPENROUTER_APP_TITLE?.trim() || "TrueSearch",

  /** Google AI Studio / Gemini API (https://aistudio.google.com/apikey) — primary when set */
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY?.trim() || "",
  /** Gemini model id for the Google API (not the OpenRouter slug) */
  googleGeminiModel: process.env.GOOGLE_GEMINI_MODEL?.trim() || "gemini-2.0-flash",
  defaultMetricSearchLimit: envNumber("DEFAULT_METRIC_SEARCH_LIMIT", 12),
  defaultWebSearchLimit: envNumber("DEFAULT_WEB_SEARCH_LIMIT", 10),
  priceNormalizeStrict: process.env.PRICE_NORMALIZE_STRICT === "true",
  fxUsdPerCurrency: {
    EUR: envNumber("FX_USD_PER_EUR", 1.08),
    GBP: envNumber("FX_USD_PER_GBP", 1.27),
    JPY: envNumber("FX_USD_PER_JPY", 0.0068),
    CNY: envNumber("FX_USD_PER_CNY", 0.14),
    AUD: envNumber("FX_USD_PER_AUD", 0.66),
    CAD: envNumber("FX_USD_PER_CAD", 0.74),
    INR: envNumber("FX_USD_PER_INR", 0.012),
  } as Record<string, number>,
};
