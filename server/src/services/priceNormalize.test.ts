import test from "node:test";
import assert from "node:assert/strict";
import { normalizePriceToUsdPerTon, normalizeQuantityToTons } from "./priceNormalize.js";

test("normalizes USD per kg into USD per ton", () => {
  const out = normalizePriceToUsdPerTon("USD 2.5 per kg");
  assert.equal(out.normalizedUsdPerTon, 2500);
  assert.ok(out.normalizationConfidence > 0.8);
});

test("normalizes EUR per tonne with FX mapping", () => {
  const out = normalizePriceToUsdPerTon("EUR 100 per tonne");
  assert.ok(out.normalizedUsdPerTon !== null);
  assert.ok((out.normalizedUsdPerTon ?? 0) > 100);
});

test("normalizes quantity to tons", () => {
  const out = normalizeQuantityToTons("Estimated 300,000 tons washed ashore");
  assert.equal(out.normalizedTons, 300000);
});

