# TrueSearch

Research-grade ingestion and AI extraction for sargassum / macroalgae pyrolysis literature, with **click-through provenance** (verbatim `source_snippet` per metric), MongoDB storage, and a human validation UI.

## Architecture

1. **Ingestion (dual engine)**  
   - Primary: Semantic Scholar + Crossref search endpoints (`POST /api/ingest/semantic-scholar`, `POST /api/ingest/crossref`).  
   - Fallback: static HTML scrape (`POST /api/ingest/scrape`).

2. **Parsing**  
   - HTML: Cheerio-based article text extraction.  
   - PDF: GROBID full text (`POST /api/papers/:id/parse` with `mode: "grobid_pdf"` and `pdfPath`).

3. **AI extraction**  
   - Strict JSON array with `metric`, `value`, `confidence_score`, `source_snippet`, optional `section`.  
   - `POST /api/papers/:id/extract` uses **[OpenRouter](https://openrouter.ai/)** (`OPENROUTER_API_KEY`). Default model is **`google/gemini-2.0-flash-001`** (capable on long documents, usually inexpensive per token). Swap `OPENROUTER_MODEL` for e.g. `openai/gpt-4o-mini` or `deepseek/deepseek-chat` as you prefer cost vs. quality.

4. **Storage**  
   - MongoDB collections `papers` and `extractions` with validation status.

5. **Dashboard**  
   - React + Tailwind (`web/`): table + side panel, Approve / Save edit / Reject.

## Quickstart

```bash
cp .env.example .env
# add OPENROUTER_API_KEY to .env (get a key at https://openrouter.ai/)
docker compose up -d mongo grobid   # optional grobid until you parse PDFs
npm install
npm run dev
```

- API: `http://127.0.0.1:8787`  
- UI: `http://127.0.0.1:5173` (proxies `/api` to the server in dev)

### Example API flow

```bash
curl -s -X POST http://127.0.0.1:8787/api/ingest/semantic-scholar \
  -H 'Content-Type: application/json' \
  -d '{"query":"sargassum pyrolysis","limit":3}' | jq '.papers[0]._id'

# replace PAPER_ID
curl -s -X POST http://127.0.0.1:8787/api/papers/PAPER_ID/parse -H 'Content-Type: application/json' -d '{}'
curl -s -X POST http://127.0.0.1:8787/api/papers/PAPER_ID/extract -H 'Content-Type: application/json' -d '{}'
```

For PDFs, download the file locally then:

```bash
curl -s -X POST http://127.0.0.1:8787/api/papers/PAPER_ID/parse \
  -H 'Content-Type: application/json' \
  -d '{"mode":"grobid_pdf","pdfPath":"/absolute/path/to/paper.pdf"}'
```

## License

MIT
