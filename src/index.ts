import "dotenv/config";
import express from "express";
import cors from "cors";
import { initSnapshots, getSnapshot, listSnapshots } from "./snapshots.js";
import { createBot } from "./bot.js";

const PORT = Number(process.env.PORT || 3001);
const app = express();

app.use(cors());

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

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});

// Start Telegram bot
const bot = createBot();
bot.launch(() => {
  console.log("Telegram bot started");
});

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
