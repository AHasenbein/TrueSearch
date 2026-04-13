import mongoose, { Schema, type InferSchemaType } from "mongoose";

const metricSearchRunSchema = new Schema(
  {
    metricQuery: { type: String, required: true },
    maxPapers: { type: Number, required: true },
    yearMin: { type: Number },
    yearMax: { type: Number },
    papersScanned: { type: Number, required: true },
    matchesCount: { type: Number, required: true },
    normalizedSummary: { type: Schema.Types.Mixed, required: true },
    matches: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

export type MetricSearchRunDocument = InferSchemaType<typeof metricSearchRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MetricSearchRun = mongoose.model("MetricSearchRun", metricSearchRunSchema);

