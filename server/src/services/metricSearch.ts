import { Paper } from "../models/Paper.js";
import { searchCrossref, workToAbstract } from "./crossref.js";
import { expandMetricQuery, extractWithProvenance, type ProvenanceRow } from "./llmExtract.js";
import { normalizePriceToUsdPerTon, normalizeQuantityToTons } from "./priceNormalize.js";
import { fetchAndExtractText } from "./scraper.js";
import { searchSemanticScholar } from "./semanticScholar.js";
import { discoverWebSources } from "./sourceDiscovery.js";

export type StepKey =
  | "queryExpansion"
  | "discovery"
  | "webDiscovery"
  | "contentSelection"
  | "extraction"
  | "normalizationAndSummary";

type MetricSearchInput = {
  metricQuery: string;
  maxPapers: number;
  webLimit: number;
  yearMin?: number;
  yearMax?: number;
};

type MetricMatch = {
  paperId: string;
  paperTitle: string;
  year?: number;
  doi?: string;
  sourceUrl?: string;
  metric: string;
  value: string;
  confidenceScore: number;
  sourceSnippet: string;
  section?: string;
  normalizedUsdPerTon: number | null;
  normalizationConfidence: number;
  normalizationWarnings: string[];
  model: string;
  sourceType: "paper" | "web";
};

export type MetricSearchResult = {
  expandedQueries: string[];
  canonicalMetric: string;
  papersScanned: number;
  sourceOutcomes: SourceOutcome[];
  matches: MetricMatch[];
  normalizedSummary: {
    averageApplicable: boolean;
    averageUsdPerTon: number | null;
    minUsdPerTon: number | null;
    maxUsdPerTon: number | null;
    countNormalized: number;
    weightedConfidence: number | null;
  };
};

export type SourceOutcome = {
  sourceId: string;
  title: string;
  url?: string;
  sourceType: "paper" | "web";
  trustScore: number;
  status: "queued" | "processing" | "matched" | "no_match" | "failed";
  message?: string;
  metric?: string;
  value?: string;
  confidenceScore?: number;
  sourceSnippet?: string;
  normalizedValue?: number | null;
  normalizationWarnings?: string[];
  model?: string;
};

export type MetricSearchProgressEvent =
  | { type: "step"; key: StepKey; status: "running" | "completed" | "failed"; message?: string }
  | { type: "source"; source: SourceOutcome };

type WebCandidate = {
  title: string;
  url: string;
  sourceType: "web";
  trustScore: number;
};

type CandidatePaper = {
  title: string;
  doi?: string;
  authors: string[];
  year?: number;
  abstract?: string;
  sourceUrl?: string;
  pdfUrl?: string;
  ingestedFrom: "semantic_scholar" | "crossref";
};

function dedupeCandidates(candidates: CandidatePaper[]): CandidatePaper[] {
  const byDoi = new Set<string>();
  const byTitle = new Set<string>();
  const out: CandidatePaper[] = [];
  for (const c of candidates) {
    const doi = c.doi?.toLowerCase().trim();
    const title = c.title.toLowerCase().trim();
    if (doi && byDoi.has(doi)) continue;
    if (byTitle.has(title)) continue;
    if (doi) byDoi.add(doi);
    byTitle.add(title);
    out.push(c);
  }
  return out;
}

function inYearRange(year: number | undefined, yearMin?: number, yearMax?: number): boolean {
  if (!year) return true;
  if (yearMin && year < yearMin) return false;
  if (yearMax && year > yearMax) return false;
  return true;
}

function isLikelyPriceRow(row: ProvenanceRow): boolean {
  const blob = `${row.metric} ${row.value} ${row.source_snippet}`.toLowerCase();
  const hasPriceCue =
    blob.includes("price") ||
    blob.includes("cost") ||
    blob.includes("market") ||
    blob.includes("usd") ||
    blob.includes("eur") ||
    blob.includes("$");
  const hasMassCue =
    blob.includes("/t") ||
    blob.includes("/kg") ||
    blob.includes("per ton") ||
    blob.includes("per tonne") ||
    blob.includes("per kg");
  return hasPriceCue || hasMassCue;
}

async function discoverCandidates(input: MetricSearchInput): Promise<CandidatePaper[]> {
  const [ss, cr] = await Promise.all([
    searchSemanticScholar(input.metricQuery, input.maxPapers),
    searchCrossref(input.metricQuery, input.maxPapers),
  ]);

  const ssCandidates: CandidatePaper[] = ss
    .map((h) => ({
      title: h.title,
      doi: h.externalIds?.DOI,
      authors: h.authors?.map((a) => a.name) ?? [],
      year: h.year,
      abstract: h.abstract,
      sourceUrl: h.url,
      pdfUrl: h.openAccessPdf?.url,
      ingestedFrom: "semantic_scholar" as const,
    }))
    .filter((c) => inYearRange(c.year, input.yearMin, input.yearMax));

  const crCandidates: CandidatePaper[] = cr
    .map((w) => ({
      title: w.title?.[0] ?? "",
      doi: w.DOI,
      authors: w.author?.map((a) => [a.given, a.family].filter(Boolean).join(" ")) ?? [],
      year: w.issued?.["date-parts"]?.[0]?.[0],
      abstract: workToAbstract(w),
      sourceUrl: w.DOI ? `https://doi.org/${w.DOI}` : undefined,
      pdfUrl: w.link?.find((l) => l["content-type"] === "application/pdf")?.URL,
      ingestedFrom: "crossref" as const,
    }))
    .filter((c) => Boolean(c.title))
    .filter((c) => inYearRange(c.year, input.yearMin, input.yearMax));

  return dedupeCandidates([...ssCandidates, ...crCandidates]).slice(0, input.maxPapers);
}

function dedupeWebCandidates(candidates: WebCandidate[]): WebCandidate[] {
  const seen = new Set<string>();
  const out: WebCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}

async function ensurePaperDoc(candidate: CandidatePaper): Promise<{
  id: string;
  title: string;
  year?: number;
  doi?: string;
  sourceUrl?: string;
  normalizedText: string;
}> {
  const existing = candidate.doi
    ? await Paper.findOne({ doi: candidate.doi })
    : await Paper.findOne({ title: candidate.title });

  if (existing) {
    const text = existing.normalizedText || [existing.title, existing.abstract].filter(Boolean).join("\n\n");
    return {
      id: String(existing._id),
      title: existing.title,
      year: existing.year ?? undefined,
      doi: existing.doi ?? undefined,
      sourceUrl: existing.sourceUrl ?? undefined,
      normalizedText: text,
    };
  }

  const created = await Paper.create({
    title: candidate.title,
    authors: candidate.authors,
    year: candidate.year,
    doi: candidate.doi,
    abstract: candidate.abstract,
    sourceUrl: candidate.sourceUrl,
    pdfUrl: candidate.pdfUrl,
    ingestedFrom: candidate.ingestedFrom,
    externalIds: candidate.doi ? { DOI: candidate.doi } : undefined,
    normalizedText: [candidate.title, candidate.abstract].filter(Boolean).join("\n\n"),
    parseStatus: candidate.abstract ? "parsed" : "pending",
  });

  return {
    id: String(created._id),
    title: created.title,
    year: created.year ?? undefined,
    doi: created.doi ?? undefined,
    sourceUrl: created.sourceUrl ?? undefined,
    normalizedText: created.normalizedText ?? "",
  };
}

function summarize(matches: MetricMatch[]): MetricSearchResult["normalizedSummary"] {
  const normalized = matches.filter((m) => m.normalizedUsdPerTon != null);
  if (normalized.length === 0) {
    return {
      averageApplicable: false,
      averageUsdPerTon: null,
      minUsdPerTon: null,
      maxUsdPerTon: null,
      countNormalized: 0,
      weightedConfidence: null,
    };
  }

  let numerator = 0;
  let denominator = 0;
  let confidenceNumerator = 0;
  const values: number[] = [];

  for (const m of normalized) {
    const v = m.normalizedUsdPerTon!;
    const w = Math.max(0.01, m.confidenceScore * m.normalizationConfidence);
    numerator += v * w;
    denominator += w;
    confidenceNumerator += w;
    values.push(v);
  }

  return {
    averageApplicable: true,
    averageUsdPerTon: Number((numerator / denominator).toFixed(3)),
    minUsdPerTon: Number(Math.min(...values).toFixed(3)),
    maxUsdPerTon: Number(Math.max(...values).toFixed(3)),
    countNormalized: normalized.length,
    weightedConfidence: Number((confidenceNumerator / normalized.length).toFixed(3)),
  };
}

function isPriceIntent(metricQuery: string): boolean {
  const q = metricQuery.toLowerCase();
  return q.includes("price") || q.includes("cost") || q.includes("usd") || q.includes("market");
}

function toSourceOutcomeFromPaper(candidate: CandidatePaper): SourceOutcome {
  return {
    sourceId: candidate.doi || candidate.title,
    title: candidate.title,
    url: candidate.sourceUrl,
    sourceType: "paper",
    trustScore: 0.85,
    status: "queued",
  };
}

function toSourceOutcomeFromWeb(candidate: WebCandidate): SourceOutcome {
  return {
    sourceId: candidate.url,
    title: candidate.title,
    url: candidate.url,
    sourceType: "web",
    trustScore: candidate.trustScore,
    status: "queued",
  };
}

function applyNormalization(value: string, metricQuery: string) {
  if (isPriceIntent(metricQuery)) {
    const p = normalizePriceToUsdPerTon(value);
    return {
      normalizedUsdPerTon: p.normalizedUsdPerTon,
      normalizationConfidence: p.normalizationConfidence,
      warnings: p.warnings,
    };
  }
  const q = normalizeQuantityToTons(value);
  return {
    normalizedUsdPerTon: q.normalizedTons,
    normalizationConfidence: q.normalizationConfidence,
    warnings: q.warnings,
  };
}

export async function runMetricSearch(
  input: MetricSearchInput,
  onProgress?: (event: MetricSearchProgressEvent) => void
): Promise<MetricSearchResult> {
  onProgress?.({ type: "step", key: "queryExpansion", status: "running" });
  const expansion = await expandMetricQuery(input.metricQuery);
  const expandedQueries = [...new Set([expansion.canonical_metric, ...expansion.expanded_queries])].slice(0, 8);
  onProgress?.({
    type: "step",
    key: "queryExpansion",
    status: "completed",
    message: `${expandedQueries.length} query variants`,
  });

  onProgress?.({ type: "step", key: "discovery", status: "running" });
  const candidateGroups = await Promise.all(
    expandedQueries.map((q) =>
      discoverCandidates({
        ...input,
        metricQuery: q,
      })
    )
  );
  const candidates = dedupeCandidates(candidateGroups.flat()).slice(0, input.maxPapers);
  onProgress?.({
    type: "step",
    key: "discovery",
    status: "completed",
    message: `${candidates.length} paper candidates`,
  });

  onProgress?.({ type: "step", key: "webDiscovery", status: "running" });
  const webGroups = await Promise.all(
    expandedQueries.slice(0, 4).map((q) => discoverWebSources(q, Math.max(3, Math.floor(input.webLimit / 2))))
  );
  const webCandidates = dedupeWebCandidates(webGroups.flat()).slice(0, input.webLimit);
  onProgress?.({
    type: "step",
    key: "webDiscovery",
    status: "completed",
    message: `${webCandidates.length} web candidates`,
  });

  onProgress?.({ type: "step", key: "contentSelection", status: "running" });
  const sourceOutcomes: SourceOutcome[] = [
    ...candidates.map(toSourceOutcomeFromPaper),
    ...webCandidates.map(toSourceOutcomeFromWeb),
  ];
  sourceOutcomes.forEach((s) => onProgress?.({ type: "source", source: s }));
  onProgress?.({
    type: "step",
    key: "contentSelection",
    status: "completed",
    message: `${sourceOutcomes.length} total sources`,
  });

  onProgress?.({ type: "step", key: "extraction", status: "running" });
  const matches: MetricMatch[] = [];
  for (const candidate of candidates) {
    const sourceId = candidate.doi || candidate.title;
    const outcome = sourceOutcomes.find((s) => s.sourceId === sourceId && s.sourceType === "paper");
    if (!outcome) continue;
    outcome.status = "processing";
    onProgress?.({ type: "source", source: { ...outcome } });

    try {
      const paper = await ensurePaperDoc(candidate);
      const text = paper.normalizedText;
      if (!text) {
        outcome.status = "no_match";
        outcome.message = "No parsable text";
        onProgress?.({ type: "source", source: { ...outcome } });
        continue;
      }
      const extraction = await extractWithProvenance(text, {
        metricQuery: input.metricQuery,
      });
      const modelLabel = `${extraction.usedProvider}:${extraction.usedModel}`;
      let hasMatch = false;

      for (const row of extraction.rows) {
        if (!isLikelyPriceRow(row) && isPriceIntent(input.metricQuery)) continue;
        const normalized = applyNormalization(row.value, input.metricQuery);
        hasMatch = true;
        matches.push({
          paperId: sourceId,
          paperTitle: paper.title,
          year: paper.year,
          doi: paper.doi,
          sourceUrl: paper.sourceUrl,
          metric: row.metric,
          value: row.value,
          confidenceScore: row.confidence_score,
          sourceSnippet: row.source_snippet,
          section: row.section,
          normalizedUsdPerTon: normalized.normalizedUsdPerTon,
          normalizationConfidence: normalized.normalizationConfidence,
          normalizationWarnings: normalized.warnings,
          model: modelLabel,
          sourceType: "paper",
        });
        outcome.status = "matched";
        outcome.metric = row.metric;
        outcome.value = row.value;
        outcome.confidenceScore = row.confidence_score;
        outcome.sourceSnippet = row.source_snippet;
        outcome.normalizedValue = normalized.normalizedUsdPerTon;
        outcome.normalizationWarnings = normalized.warnings;
        outcome.model = modelLabel;
        onProgress?.({ type: "source", source: { ...outcome } });
      }
      if (!hasMatch) {
        outcome.status = "no_match";
        outcome.message = "Processed, no matching metric values";
      }
      onProgress?.({ type: "source", source: { ...outcome } });
    } catch (e) {
      outcome.status = "failed";
      outcome.message = e instanceof Error ? e.message : "Extraction failed";
      onProgress?.({ type: "source", source: { ...outcome } });
    }
  }

  for (const candidate of webCandidates) {
    const outcome = sourceOutcomes.find((s) => s.sourceId === candidate.url && s.sourceType === "web");
    if (!outcome) continue;
    outcome.status = "processing";
    onProgress?.({ type: "source", source: { ...outcome } });
    try {
      const text = await fetchAndExtractText(candidate.url);
      if (!text || text.length < 150) {
        outcome.status = "no_match";
        outcome.message = "Not enough extractable text";
        onProgress?.({ type: "source", source: { ...outcome } });
        continue;
      }
      const extraction = await extractWithProvenance(text, { metricQuery: input.metricQuery });
      const modelLabel = `${extraction.usedProvider}:${extraction.usedModel}`;
      const row = extraction.rows.find((r) => (isPriceIntent(input.metricQuery) ? isLikelyPriceRow(r) : true));
      if (!row) {
        outcome.status = "no_match";
        outcome.message = "Processed, no matching metric values";
        onProgress?.({ type: "source", source: { ...outcome } });
        continue;
      }
      const normalized = applyNormalization(row.value, input.metricQuery);
      matches.push({
        paperId: outcome.sourceId,
        paperTitle: outcome.title,
        year: undefined,
        doi: undefined,
        sourceUrl: outcome.url,
        metric: row.metric,
        value: row.value,
        confidenceScore: row.confidence_score,
        sourceSnippet: row.source_snippet,
        section: row.section,
        normalizedUsdPerTon: normalized.normalizedUsdPerTon,
        normalizationConfidence: normalized.normalizationConfidence,
        normalizationWarnings: normalized.warnings,
        model: modelLabel,
        sourceType: "web",
      });
      outcome.status = "matched";
      outcome.metric = row.metric;
      outcome.value = row.value;
      outcome.confidenceScore = row.confidence_score;
      outcome.sourceSnippet = row.source_snippet;
      outcome.normalizedValue = normalized.normalizedUsdPerTon;
      outcome.normalizationWarnings = normalized.warnings;
      outcome.model = modelLabel;
      onProgress?.({ type: "source", source: { ...outcome } });
    } catch (e) {
      outcome.status = "failed";
      outcome.message = e instanceof Error ? e.message : "Web extraction failed";
      onProgress?.({ type: "source", source: { ...outcome } });
    }
  }
  onProgress?.({ type: "step", key: "extraction", status: "completed" });
  onProgress?.({ type: "step", key: "normalizationAndSummary", status: "running" });
  const normalizedSummary = summarize(matches);
  onProgress?.({
    type: "step",
    key: "normalizationAndSummary",
    status: "completed",
    message: `${matches.length} matches`,
  });

  return {
    expandedQueries,
    canonicalMetric: expansion.canonical_metric,
    papersScanned: candidates.length,
    sourceOutcomes,
    matches,
    normalizedSummary,
  };
}

