import { config } from "../config.js";

export type NormalizedPrice = {
  normalizedUsdPerTon: number | null;
  normalizationConfidence: number;
  currency: string | null;
  amount: number | null;
  unit: string | null;
  warnings: string[];
};

export type NormalizedQuantity = {
  normalizedTons: number | null;
  normalizationConfidence: number;
  warnings: string[];
};

type UnitSpec = {
  kind: "ton" | "kg";
  factorToTon: number;
};

const currencyPattern =
  /\b(USD|US\$|EUR|GBP|JPY|CNY|RMB|AUD|CAD|INR)\b|(\$|€|£|¥)/i;
const amountPattern = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/;

const perTonPattern = /(per|\/)\s*(metric\s*)?(ton|tonne|t)\b|\/\s*t\b/i;
const perKgPattern = /(per|\/)\s*((kilo)?gram(s)?|kg)\b|\/\s*kg\b/i;

function parseCurrency(text: string): string | null {
  const match = text.match(currencyPattern);
  if (!match) return null;
  const raw = (match[1] ?? match[2] ?? "").toUpperCase();
  if (raw === "$" || raw === "US$") return "USD";
  if (raw === "€") return "EUR";
  if (raw === "£") return "GBP";
  if (raw === "¥") return "JPY";
  if (raw === "RMB") return "CNY";
  return raw || null;
}

function parseAmount(text: string): number | null {
  const match = text.match(amountPattern);
  if (!match) return null;
  const n = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

function parseUnit(text: string): UnitSpec | null {
  if (perKgPattern.test(text)) {
    return { kind: "kg", factorToTon: 1000 };
  }
  if (perTonPattern.test(text)) {
    return { kind: "ton", factorToTon: 1 };
  }
  return null;
}

function usdPerCurrency(currency: string): number | null {
  if (currency === "USD") return 1;
  const fromEnv = config.fxUsdPerCurrency[currency];
  return typeof fromEnv === "number" && Number.isFinite(fromEnv) ? fromEnv : null;
}

export function normalizePriceToUsdPerTon(valueText: string): NormalizedPrice {
  const warnings: string[] = [];
  const currency = parseCurrency(valueText);
  const amount = parseAmount(valueText);
  const unit = parseUnit(valueText);

  if (amount == null) {
    return {
      normalizedUsdPerTon: null,
      normalizationConfidence: 0,
      currency,
      amount: null,
      unit: unit?.kind ?? null,
      warnings: ["No numeric amount detected."],
    };
  }

  let confidence = 1;

  if (!currency) {
    if (config.priceNormalizeStrict) {
      return {
        normalizedUsdPerTon: null,
        normalizationConfidence: 0,
        currency: null,
        amount,
        unit: unit?.kind ?? null,
        warnings: ["Currency missing under strict mode."],
      };
    }
    warnings.push("Currency missing; assumed USD.");
    confidence -= 0.25;
  }

  const resolvedCurrency = currency ?? "USD";
  const fx = usdPerCurrency(resolvedCurrency);
  if (fx == null) {
    return {
      normalizedUsdPerTon: null,
      normalizationConfidence: 0,
      currency: resolvedCurrency,
      amount,
      unit: unit?.kind ?? null,
      warnings: [`No FX mapping configured for ${resolvedCurrency}.`],
    };
  }

  if (!unit) {
    if (config.priceNormalizeStrict) {
      return {
        normalizedUsdPerTon: null,
        normalizationConfidence: 0,
        currency: resolvedCurrency,
        amount,
        unit: null,
        warnings: ["Unit missing under strict mode."],
      };
    }
    warnings.push("Unit missing; assumed per metric ton.");
    confidence -= 0.25;
  }

  const factorToTon = unit?.factorToTon ?? 1;
  const normalizedUsdPerTon = amount * fx * factorToTon;

  return {
    normalizedUsdPerTon,
    normalizationConfidence: Math.max(0, Number(confidence.toFixed(3))),
    currency: resolvedCurrency,
    amount,
    unit: unit?.kind ?? "ton",
    warnings,
  };
}

export function normalizeQuantityToTons(valueText: string): NormalizedQuantity {
  const amount = parseAmount(valueText);
  if (amount == null) {
    return {
      normalizedTons: null,
      normalizationConfidence: 0,
      warnings: ["No numeric quantity detected."],
    };
  }
  if (perKgPattern.test(valueText) || /\bkg\b/i.test(valueText)) {
    return {
      normalizedTons: Number((amount / 1000).toFixed(6)),
      normalizationConfidence: 0.9,
      warnings: [],
    };
  }
  if (perTonPattern.test(valueText) || /\b(ton|tons|tonne|tonnes|t)\b/i.test(valueText)) {
    return {
      normalizedTons: amount,
      normalizationConfidence: 0.95,
      warnings: [],
    };
  }
  return {
    normalizedTons: amount,
    normalizationConfidence: 0.6,
    warnings: ["Unit missing; assumed tons."],
  };
}

