import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { ingestRouter } from "./routes/ingest.js";
import { papersRouter } from "./routes/papers.js";
import { extractionsRouter } from "./routes/extractions.js";

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

/** Allow /api/health always; other /api routes need an active Mongo connection. */
app.use((req, res, next) => {
  const path = req.originalUrl.split("?")[0];
  if (path === "/api/health") return next();
  if (!path.startsWith("/api")) return next();
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Database not connected",
      hint:
        "Set MONGODB_URI in .env (e.g. your MongoDB Atlas connection string) or run local Mongo: docker compose up -d mongo",
    });
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1,
  });
});

app.use("/api/ingest", ingestRouter);
app.use("/api/papers", papersRouter);
app.use("/api/extractions", extractionsRouter);

async function main() {
  const server = app.listen(config.port, () => {
    console.log(`TrueSearch API http://127.0.0.1:${config.port}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${config.port} is already in use. Stop the other process or set PORT in .env to a free port.`
      );
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  try {
    await connectDb();
    console.log("MongoDB connected.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("MongoDB connection failed:", msg);
    console.error(
      "API is running; /api routes will return 503 until the database is reachable. Set MONGODB_URI in .env or run: docker compose up -d mongo"
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
