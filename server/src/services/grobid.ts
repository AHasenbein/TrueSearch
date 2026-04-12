import fs from "node:fs/promises";
import { config } from "../config.js";

/**
 * Sends a local PDF path to GROBID and returns TEI XML.
 * Run GROBID locally, e.g. `docker run -t --rm -p 8070:8070 lfoppiano/grobid:0.8.0`
 */
export async function processPdfWithGrobid(pdfPath: string): Promise<string> {
  const buf = await fs.readFile(pdfPath);
  const body = new FormData();
  body.append("input", new Blob([buf], { type: "application/pdf" }), "document.pdf");

  const res = await fetch(`${config.grobidUrl}/api/processFulltextDocument`, {
    method: "POST",
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GROBID error ${res.status}: ${text.slice(0, 500)}`);
  }
  return text;
}

/** Very small TEI → plain text helper so the LLM sees readable prose (not raw XML). */
export function teiXmlToPlainText(teiXml: string): string {
  return teiXml
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
