import "dotenv/config";
import express from "express";
import cors from "cors";
import { initSnapshots, getSnapshot, listSnapshots } from "./snapshots.js";
import { createBot } from "./bot.js";
import { handleMcpPost, handleMcpSse } from "./mcp.js";

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

app.get("/", (_req, res) => {
  res.send("<h1>Dashboard Bot</h1><p>Send data to the Telegram bot to generate dashboards.</p>");
});

// Init
initSnapshots();

const { bot, webhookPath, setupWebhook } = createBot();

if (WEBHOOK_MODE) {
  // Webhook mode — for Alpic / production
  // Express strips the mount path prefix, so Telegraf filter sees "/"
  app.use(webhookPath, bot.webhookCallback("/"));

  app.listen(PORT, async () => {
    console.log(`Express server running on port ${PORT} (webhook mode)`);
    await setupWebhook(BASE_URL);
  });
} else {
  // Polling mode — for local development
  app.listen(PORT, () => {
    console.log(`Express server running on http://localhost:${PORT} (polling mode)`);
  });

  bot.launch(() => {
    console.log("Telegram bot started (polling)");
  });
}

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
