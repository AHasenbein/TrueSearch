import mongoose, { Schema, type InferSchemaType } from "mongoose";

const paperSchema = new Schema(
  {
    title: { type: String, required: true },
    authors: [{ type: String }],
    year: { type: Number },
    doi: { type: String },
    abstract: { type: String },
    sourceUrl: { type: String },
    pdfUrl: { type: String },
    ingestedFrom: {
      type: String,
      enum: ["semantic_scholar", "crossref", "scrape", "manual"],
      required: true,
    },
    externalIds: { type: Schema.Types.Mixed },
    /** Normalized plain text passed to the LLM (abstract, TEI-to-text, or HTML body). */
    normalizedText: { type: String },
    grobidTeiXml: { type: String },
    parseStatus: {
      type: String,
      enum: ["pending", "parsed", "failed"],
      default: "pending",
    },
    parseError: { type: String },
  },
  { timestamps: true }
);

paperSchema.index({ doi: 1 }, { sparse: true });
paperSchema.index({ title: "text", abstract: "text" });

export type PaperDocument = InferSchemaType<typeof paperSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Paper = mongoose.model("Paper", paperSchema);
