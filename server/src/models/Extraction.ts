import mongoose, { Schema, type InferSchemaType } from "mongoose";

const extractionSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },
    metric: { type: String, required: true },
    value: { type: String, required: true },
    confidenceScore: { type: Number, required: true, min: 0, max: 1 },
    sourceSnippet: { type: String, required: true },
    section: { type: String },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    editedValue: { type: String },
    reviewerNote: { type: String },
    model: { type: String },
  },
  { timestamps: true }
);

export type ExtractionDocument = InferSchemaType<typeof extractionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Extraction = mongoose.model("Extraction", extractionSchema);
