import { Router } from "express";
import { Paper } from "../models/Paper.js";
import { searchCrossref, workToAbstract } from "../services/crossref.js";
import { searchSemanticScholar } from "../services/semanticScholar.js";
import { fetchAndExtractText } from "../services/scraper.js";

const router = Router();

router.post("/semantic-scholar", async (req, res) => {
  const query = String(req.body?.query ?? "sargassum pyrolysis");
  const limit = Math.min(Number(req.body?.limit) || 12, 50);
  try {
    const hits = await searchSemanticScholar(query, limit);
    const created = [];
    for (const h of hits) {
      const doi = h.externalIds?.DOI;
      const dup = doi
        ? await Paper.findOne({ doi })
        : await Paper.findOne({ title: h.title, ingestedFrom: "semantic_scholar" });
      if (dup) {
        created.push(dup);
        continue;
      }
      const doc = await Paper.create({
        title: h.title,
        authors: h.authors?.map((a) => a.name) ?? [],
        year: h.year,
        doi,
        abstract: h.abstract,
        sourceUrl: h.url,
        pdfUrl: h.openAccessPdf?.url,
        ingestedFrom: "semantic_scholar",
        externalIds: h.externalIds ?? { paperId: h.paperId },
        normalizedText: [h.title, h.abstract].filter(Boolean).join("\n\n"),
        parseStatus: h.abstract ? "parsed" : "pending",
      });
      created.push(doc);
    }
    res.json({ count: created.length, papers: created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ingest failed";
    res.status(502).json({ error: msg });
  }
});

router.post("/crossref", async (req, res) => {
  const query = String(req.body?.query ?? "macroalgae biochar");
  const rows = Math.min(Number(req.body?.rows) || 12, 50);
  try {
    const works = await searchCrossref(query, rows);
    const created = [];
    for (const w of works) {
      const title = w.title?.[0];
      if (!title) continue;
      const doi = w.DOI;
      const dup = doi ? await Paper.findOne({ doi }) : null;
      if (dup) {
        created.push(dup);
        continue;
      }
      const authors =
        w.author?.map((a) => [a.given, a.family].filter(Boolean).join(" ")) ?? [];
      const year = w.issued?.["date-parts"]?.[0]?.[0];
      const pdfLink = w.link?.find((l) => l["content-type"] === "application/pdf")?.URL;
      const abs = workToAbstract(w);
      const doc = await Paper.create({
        title,
        authors,
        year,
        doi,
        abstract: abs,
        sourceUrl: doi ? `https://doi.org/${doi}` : undefined,
        pdfUrl: pdfLink,
        ingestedFrom: "crossref",
        externalIds: { DOI: doi },
        normalizedText: [title, abs].filter(Boolean).join("\n\n"),
        parseStatus: abs ? "parsed" : "pending",
      });
      created.push(doc);
    }
    res.json({ count: created.length, papers: created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ingest failed";
    res.status(502).json({ error: msg });
  }
});

/** Fallback engine: scrape a URL and store as a manual paper record. */
router.post("/scrape", async (req, res) => {
  const url = String(req.body?.url ?? "");
  if (!url.startsWith("http")) {
    return res.status(400).json({ error: "url must be http(s)" });
  }
  try {
    const text = await fetchAndExtractText(url);
    const title = String(req.body?.title ?? url);
    const doc = await Paper.create({
      title,
      authors: [],
      ingestedFrom: "scrape",
      sourceUrl: url,
      normalizedText: text,
      parseStatus: "parsed",
    });
    res.json({ paper: doc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "scrape failed";
    res.status(502).json({ error: msg });
  }
});

export const ingestRouter = router;
