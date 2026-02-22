import "dotenv/config";
import express from "express";
import cors from "cors";
import { initSnapshots, getSnapshot, listSnapshots, createSnapshot } from "./snapshots.js";
import { createBot } from "./bot.js";
import { handleMcpPost, handleMcpSse } from "./mcp.js";
import { buildAnalysisPrompt, type ParsedFile } from "./file-parser.js";
import { analyzeData } from "./analyzer.js";
import { generateDashboard } from "./html-generator.js";

const PORT = Number(process.env.PORT || 3001);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const WEBHOOK_MODE = process.env.WEBHOOK_MODE === "true";

const app = express();

app.use(cors());
app.use(express.json());

// Health check (Alpic requirement)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// MCP endpoints (Alpic requirement)
app.post("/mcp", handleMcpPost);
app.get("/mcp", handleMcpSse);

// Serve snapshots
app.get("/s/:slug", (req, res) => {
  const html = getSnapshot(req.params.slug);
  if (!html) {
    res.status(404).send("<h1>Dashboard not found or expired</h1>");
    return;
  }
  res.type("html").send(html);
});

app.get("/api/snapshots", (_req, res) => {
  res.json(listSnapshots());
});

// API for remote dashboard creation (called by Alpic MCP tool)
app.post("/api/analyze", async (req, res) => {
  const { data, focus } = req.body || {};
  if (!data || typeof data !== "string") {
    res.status(400).json({ error: "Missing required field: data" });
    return;
  }
  try {
    const parsed: ParsedFile = {
      name: "input_data.txt",
      type: "text",
      preview: data.slice(0, 4000),
      rowCount: data.trim().split("\n").length,
    };
    const prompt = buildAnalysisPrompt([parsed], focus);
    const meta = await analyzeData(prompt);
    const html = generateDashboard(meta);
    const { slug } = createSnapshot(meta.title, html);
    const url = `${BASE_URL}/s/${slug}`;

    res.json({ url, title: meta.title, summary: meta.summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
});

app.get("/", (_req, res) => {
  res.send("<h1>Dashboard Bot</h1><p>Send data to the Telegram bot to generate dashboards.</p>");
});

// Init
initSnapshots();

// Telegram bot is optional — server runs without it (e.g. first deploy before env vars are set)
if (process.env.TELEGRAM_BOT_TOKEN) {
  const { bot, webhookPath, setupWebhook } = createBot();

  if (WEBHOOK_MODE) {
    app.use(webhookPath, bot.webhookCallback("/"));

    app.listen(PORT, async () => {
      console.log(`Express server running on port ${PORT} (webhook mode)`);
      await setupWebhook(BASE_URL);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`Express server running on http://localhost:${PORT} (polling mode)`);
    });

    bot.launch(() => {
      console.log("Telegram bot started (polling)");
    });
  }

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
} else {
  console.warn("TELEGRAM_BOT_TOKEN not set — running Express only (no Telegram bot)");
  app.listen(PORT, () => {
    console.log(`Express server running on port ${PORT} (no bot)`);
  });
}
