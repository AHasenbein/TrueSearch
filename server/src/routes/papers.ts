import { Router } from "express";
import path from "node:path";
import { Paper } from "../models/Paper.js";
import { Extraction } from "../models/Extraction.js";
import { processPdfWithGrobid, teiXmlToPlainText } from "../services/grobid.js";
import { extractWithProvenance } from "../services/llmExtract.js";
import { fetchAndExtractText } from "../services/scraper.js";
import { config } from "../config.js";

const router = Router();

router.get("/", async (_req, res) => {
  const papers = await Paper.find().sort({ createdAt: -1 }).lean();
  res.json(papers);
});

router.get("/:id", async (req, res) => {
  const paper = await Paper.findById(req.params.id).lean();
  if (!paper) return res.status(404).json({ error: "not found" });
  const extractions = await Extraction.find({ paperId: paper._id }).sort({ createdAt: -1 }).lean();
  res.json({ paper, extractions });
});

/** Phase 2: normalize text — from URL (HTML), local PDF via GROBID, or refresh from abstract only. */
router.post("/:id/parse", async (req, res) => {
  const paper = await Paper.findById(req.params.id);
  if (!paper) return res.status(404).json({ error: "not found" });

  const mode = String(req.body?.mode ?? "auto"); // auto | html_url | grobid_pdf

  try {
    if (mode === "grobid_pdf" || (mode === "auto" && req.body?.pdfPath)) {
      const pdfPath = path.resolve(String(req.body.pdfPath));
      const tei = await processPdfWithGrobid(pdfPath);
      paper.grobidTeiXml = tei;
      paper.normalizedText = teiXmlToPlainText(tei);
      paper.parseStatus = "parsed";
      paper.parseError = undefined;
      await paper.save();
      return res.json({ paper });
    }

    const url =
      (req.body?.url as string | undefined) ||
      paper.sourceUrl ||
      paper.pdfUrl;
    if (mode === "html_url" || (mode === "auto" && url && url.startsWith("http"))) {
      const text = await fetchAndExtractText(url!);
      paper.normalizedText = [paper.title, paper.abstract, text].filter(Boolean).join("\n\n");
      paper.parseStatus = "parsed";
      paper.parseError = undefined;
      await paper.save();
      return res.json({ paper });
    }

    // Default: use abstract/title only
    paper.normalizedText = [paper.title, paper.abstract].filter(Boolean).join("\n\n");
    paper.parseStatus = paper.normalizedText ? "parsed" : "failed";
    paper.parseError = paper.normalizedText ? undefined : "no text available";
    await paper.save();
    return res.json({ paper });
  } catch (e) {
    paper.parseStatus = "failed";
    paper.parseError = e instanceof Error ? e.message : "parse failed";
    await paper.save();
    res.status(500).json({ error: paper.parseError });
  }
});

/** Phase 3: LLM extraction with provenance rows persisted. */
router.post("/:id/extract", async (req, res) => {
  const paper = await Paper.findById(req.params.id);
  if (!paper) return res.status(404).json({ error: "not found" });

  let text = paper.normalizedText;
  if (!text && paper.abstract) {
    text = [paper.title, paper.abstract].filter(Boolean).join("\n\n");
  }
  if (!text) {
    return res.status(400).json({ error: "No normalized text; run parse first" });
  }

  try {
    const rows = await extractWithProvenance(text);
    await Extraction.deleteMany({ paperId: paper._id, status: "pending" });
    const docs = await Extraction.insertMany(
      rows.map((r) => ({
        paperId: paper._id,
        metric: r.metric,
        value: r.value,
        confidenceScore: r.confidence_score,
        sourceSnippet: r.source_snippet,
        section: r.section,
        status: "pending" as const,
        model: config.openRouterModel,
      }))
    );
    res.json({ extractions: docs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "extract failed";
    res.status(500).json({ error: msg });
  }
});

export const papersRouter = router;
