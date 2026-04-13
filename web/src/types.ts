export type PaperRef = {
  _id: string;
  title?: string;
  year?: number;
  doi?: string;
};

export type ExtractionRow = {
  _id: string;
  paperId: PaperRef | string;
  metric: string;
  value: string;
  confidenceScore: number;
  sourceSnippet: string;
  section?: string;
  status: "pending" | "approved" | "rejected";
  editedValue?: string;
  reviewerNote?: string;
  model?: string;
};

export type SearchStep = {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  message?: string;
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

export type SearchEvent = {
  at: string;
  type: "step" | "source" | "system";
  stepKey?: string;
  level: "info" | "warn" | "error";
  message: string;
};

export type SearchRunResponse = {
  _id: string;
  metricQuery: string;
  status: "queued" | "running" | "completed" | "failed";
  expandedQueries?: string[];
  canonicalMetric?: string;
  papersScanned: number;
  steps: SearchStep[];
  sources: SourceOutcome[];
  events?: SearchEvent[];
  normalizedSummary: {
    averageApplicable: boolean;
    averageUsdPerTon: number | null;
    minUsdPerTon: number | null;
    maxUsdPerTon: number | null;
    countNormalized: number;
    weightedConfidence: number | null;
  };
  error?: string;
};

