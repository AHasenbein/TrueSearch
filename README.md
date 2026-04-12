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
   - `POST /api/papers/:id/extract` uses **Google AI Studio (Gemini)** when `GOOGLE_AI_API_KEY` is set (see [AI Studio keys](https://aistudio.google.com/apikey)), default `GOOGLE_GEMINI_MODEL=gemini-2.0-flash`. If Google returns rate limits / quota errors, the server **falls back to [OpenRouter](https://openrouter.ai/)** when `OPENROUTER_API_KEY` is set. You can use only Google, only OpenRouter, or both for resilience.

4. **Storage**  
   - MongoDB collections `papers` and `extractions` with validation status.

5. **Dashboard**  
   - React + Tailwind (`web/`): table + side panel, Approve / Save edit / Reject.

## Quickstart

```bash
cp .env.example .env
# add GOOGLE_AI_API_KEY and/or OPENROUTER_API_KEY to .env
# add MONGODB_URI if you use MongoDB Atlas (otherwise default is local mongodb://127.0.0.1:27017/truesearch)
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
