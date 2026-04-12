import { Router } from "express";
import { z } from "zod";
import { Extraction } from "../models/Extraction.js";

const router = Router();

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  editedValue: z.string().optional(),
  reviewerNote: z.string().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const ex = await Extraction.findByIdAndUpdate(
    req.params.id,
    {
      status: parsed.data.status,
      editedValue: parsed.data.editedValue,
      reviewerNote: parsed.data.reviewerNote,
    },
    { new: true }
  );
  if (!ex) return res.status(404).json({ error: "not found" });
  res.json(ex);
});

router.get("/", async (_req, res) => {
  const items = await Extraction.find().populate("paperId", "title year doi").sort({ updatedAt: -1 }).lean();
  res.json(items);
});

export const extractionsRouter = router;
