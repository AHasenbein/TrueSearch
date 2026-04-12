import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { ingestRouter } from "./routes/ingest.js";
import { papersRouter } from "./routes/papers.js";
import { extractionsRouter } from "./routes/extractions.js";

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/ingest", ingestRouter);
app.use("/api/papers", papersRouter);
app.use("/api/extractions", extractionsRouter);

async function main() {
  await connectDb();
  app.listen(config.port, () => {
    console.log(`TrueSearch API http://127.0.0.1:${config.port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
