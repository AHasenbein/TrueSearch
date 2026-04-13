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

6. **Metric search + aggregation**
   - `POST /api/search/runs` starts a staged search pipeline (query expansion -> literature discovery -> targeted web discovery -> extraction -> normalization).
   - `GET /api/search/runs/:id` returns live run state, including step statuses and source outcomes.
   - `GET /api/search/runs/:id/stream` streams progress events (SSE).
   - `POST /api/search/metric` remains as a compatibility shim that runs and returns a completed snapshot.
   - Price values are normalized to USD per metric ton when possible, with warnings/confidence when assumptions are needed.
   - Summary includes weighted average, min/max, normalized count, and weighted confidence.

## Quickstart

```bash
cp .env.example .env
# add GOOGLE_AI_API_KEY and/or OPENROUTER_API_KEY to .env
# add MONGODB_URI if you use MongoDB Atlas (otherwise default is local mongodb://127.0.0.1:27017/truesearch)
# Put `.env` in the **repo root** (same folder as `package.json`), not only inside `server/`.
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

### Metric search endpoint

```bash
curl -s -X POST http://127.0.0.1:8787/api/search/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "metricQuery":"amount of sargassum that washes up in florida in tons",
    "maxPapers": 28,
    "webLimit": 12
  }'
```

Then poll:

```bash
curl -s http://127.0.0.1:8787/api/search/runs/RUN_ID
```

Run response includes:
- `steps[]` with status/message
- `sources[]` with red/green-compatible outcomes (`matched`, `no_match`, `failed`)
- `expandedQueries` used for higher-recall retrieval
- `normalizedSummary` for weighted aggregate

### Metric-search environment knobs

- `DEFAULT_METRIC_SEARCH_LIMIT` default batch size for `/api/search/metric`
- `DEFAULT_WEB_SEARCH_LIMIT` max targeted web candidates per run
- `PRICE_NORMALIZE_STRICT=true|false` strict mode requires explicit currency + unit
- `FX_USD_PER_*` static conversion rates used for deterministic currency normalization

## License

MIT
