import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { parseFile, buildAnalysisPrompt, type ParsedFile } from "./file-parser.js";
import { analyzeData } from "./analyzer.js";
import { generateDashboard } from "./html-generator.js";
import { createSnapshot } from "./snapshots.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";

export interface BotInstance {
  bot: Telegraf;
  webhookPath: string;
  setupWebhook: (baseUrl: string) => Promise<void>;
}

export function createBot(): BotInstance {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const bot = new Telegraf(token);

  // Webhook secret derived from bot token ID (deterministic, no extra env var needed)
  const webhookSecret = token.split(":")[0];
  const webhookPath = `/webhook/${webhookSecret}`;

  async function setupWebhook(baseUrl: string) {
    const url = `${baseUrl}${webhookPath}`;
    await bot.telegram.setWebhook(url);
    console.log(`Webhook set to ${url}`);
  }

  bot.start((ctx) => {
    ctx.reply(
      "Hi! I'm Dashboard Bot.\n\n" +
        "Send me a data file (CSV, XLSX, JSON, HTML, TSV, etc.) or paste raw data as text, " +
        "and I'll analyze it with AI and generate an interactive dashboard for you.\n\n" +
        "You can add a caption to a file to customize the analysis focus.\n\n" +
        "/help — supported formats",
    );
  });

  bot.help((ctx) => {
    ctx.reply(
      "Supported formats:\n" +
        "- CSV, TSV, PSV\n" +
        "- XLSX, XLS, ODS\n" +
        "- JSON, JSONL\n" +
        "- HTML (tables)\n" +
        "- Plain text / logs\n\n" +
        "How to use:\n" +
        "1. Send a file — I'll parse and analyze it\n" +
        "2. Add a caption to focus the analysis (e.g. \"focus on revenue trends\")\n" +
        "3. Paste data as text — works too\n" +
        "4. Get a link to your dashboard!",
    );
  });

  // Document handler
  bot.on(message("document"), async (ctx) => {
    const doc = ctx.message.document;
    const caption = ctx.message.caption || undefined;

    const status = await ctx.reply("Parsing file...");

    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const parsed = await parseFile({ name: doc.file_name || "file", buffer });

      await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined, "Analyzing with AI...");

      const prompt = buildAnalysisPrompt([parsed], caption);
      const meta = await analyzeData(prompt);

      await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined, "Generating dashboard...");

      const html = generateDashboard(meta);
      const { slug } = createSnapshot(meta.title, html);
      const url = `${BASE_URL}/s/${slug}`;

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        `Your dashboard is ready!\n\n${meta.title}\n${meta.summary}\n\n${url}`,
      );
    } catch (err: any) {
      console.error("Error processing document:", err);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        `Error: ${err.message || "Something went wrong"}`,
      );
    }
  });

  // Text handler — treat as raw data paste
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;

    // Ignore commands (already handled)
    if (text.startsWith("/")) return;

    // Minimum data threshold
    if (text.length < 10) {
      await ctx.reply("Send me a data file or paste some data (at least a few rows of CSV, JSON, etc.).");
      return;
    }

    const status = await ctx.reply("Analyzing with AI...");

    try {
      const parsed: ParsedFile = {
        name: "pasted_data.txt",
        type: "text",
        preview: text.slice(0, 4000),
        rowCount: text.trim().split("\n").length,
      };

      const prompt = buildAnalysisPrompt([parsed]);
      const meta = await analyzeData(prompt);

      await ctx.telegram.editMessageText(ctx.chat.id, status.message_id, undefined, "Generating dashboard...");

      const html = generateDashboard(meta);
      const { slug } = createSnapshot(meta.title, html);
      const url = `${BASE_URL}/s/${slug}`;

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        `Your dashboard is ready!\n\n${meta.title}\n${meta.summary}\n\n${url}`,
      );
    } catch (err: any) {
      console.error("Error processing text:", err);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        `Error: ${err.message || "Something went wrong"}`,
      );
    }
  });

  return { bot, webhookPath, setupWebhook };
}
