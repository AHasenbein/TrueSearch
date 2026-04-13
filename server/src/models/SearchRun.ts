import mongoose, { Schema, type InferSchemaType } from "mongoose";

const stepSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      required: true,
      default: "pending",
    },
    startedAt: { type: Date },
    endedAt: { type: Date },
    message: { type: String },
  },
  { _id: false }
);

const sourceSchema = new Schema(
  {
    sourceId: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String },
    sourceType: { type: String, enum: ["paper", "web"], required: true },
    trustScore: { type: Number, default: 0.5 },
    status: {
      type: String,
      enum: ["queued", "processing", "matched", "no_match", "failed"],
      default: "queued",
    },
    message: { type: String },
    metric: { type: String },
    value: { type: String },
    confidenceScore: { type: Number },
    sourceSnippet: { type: String },
    normalizedValue: { type: Number },
    normalizationWarnings: [{ type: String }],
    model: { type: String },
  },
  { _id: false }
);

const eventSchema = new Schema(
  {
    at: { type: String, required: true },
    type: { type: String, enum: ["step", "source", "system"], required: true },
    stepKey: { type: String },
    level: { type: String, enum: ["info", "warn", "error"], required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const searchRunSchema = new Schema(
  {
    metricQuery: { type: String, required: true },
    maxPapers: { type: Number, required: true },
    webLimit: { type: Number, required: true },
    yearMin: { type: Number },
    yearMax: { type: Number },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
      index: true,
    },
    expandedQueries: [{ type: String }],
    canonicalMetric: { type: String },
    steps: { type: [stepSchema], default: [] },
    sources: { type: [sourceSchema], default: [] },
    events: { type: [eventSchema], default: [] },
    papersScanned: { type: Number, default: 0 },
    matchesCount: { type: Number, default: 0 },
    normalizedSummary: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true }
);

export type SearchRunDocument = InferSchemaType<typeof searchRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SearchRun = mongoose.model("SearchRun", searchRunSchema);

