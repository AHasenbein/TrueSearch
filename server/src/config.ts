import "dotenv/config";

const openRouterBaseUrl =
  process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";

/** Default: Gemini 2.0 Flash on OpenRouter — strong on long documents, typically low $/1M tokens vs frontier models. */
const defaultOpenRouterModel =
  process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.0-flash-001";

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
};
