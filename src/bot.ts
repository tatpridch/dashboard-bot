import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { parseFile, buildAnalysisPrompt, type ParsedFile } from "./file-parser.js";
import { analyzeData } from "./analyzer.js";
import { generateDashboard, type Theme } from "./html-generator.js";
import { createSnapshot } from "./snapshots.js";
import { screenshotDashboard } from "./screenshot.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";

// Conversation state per user
interface UserState {
  step: "idle" | "awaiting_confirm" | "awaiting_theme" | "awaiting_focus";
  parsed?: ParsedFile;
  theme?: Theme;
  focus?: string;
}

const sessions = new Map<number, UserState>();

function getState(userId: number): UserState {
  if (!sessions.has(userId)) sessions.set(userId, { step: "idle" });
  return sessions.get(userId)!;
}

function resetState(userId: number) {
  sessions.set(userId, { step: "idle" });
}

export interface BotInstance {
  bot: Telegraf;
  webhookPath: string;
  setupWebhook: (baseUrl: string) => Promise<void>;
}

export function createBot(): BotInstance {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const bot = new Telegraf(token);

  const webhookSecret = token.split(":")[0];
  const webhookPath = `/webhook/${webhookSecret}`;

  async function setupWebhook(baseUrl: string) {
    const url = `${baseUrl}${webhookPath}`;
    await bot.telegram.setWebhook(url);
    console.log(`Webhook set to ${url}`);
  }

  // ── Commands ──

  bot.start((ctx) => {
    resetState(ctx.from.id);
    ctx.reply(
      "👋 Hi! I'm Dashboard Bot.\n\n" +
        "Send me a data file (CSV, XLSX, JSON, HTML, TSV, etc.) or paste raw data as text, " +
        "and I'll analyze it with AI and generate an interactive dashboard.\n\n" +
        "/help — supported formats\n" +
        "/cancel — reset at any point",
    );
  });

  bot.help((ctx) => {
    ctx.reply(
      "📋 Supported formats:\n" +
        "CSV, TSV, PSV, XLSX, XLS, ODS, JSON, JSONL, HTML (tables), plain text, logs\n\n" +
        "How it works:\n" +
        "1. Send a file or paste data\n" +
        "2. Choose 🌙 Dark or ☀️ Light theme\n" +
        "3. Add focus instructions (or skip)\n" +
        "4. Get a dashboard link + screenshot!\n\n" +
        "/cancel — start over at any point",
    );
  });

  bot.command("cancel", async (ctx) => {
    resetState(ctx.from.id);
    await ctx.reply(
      "🔄 Reset! Send a new file or paste data to start.",
    );
  });

  // ── Inline keyboard handler ──

  bot.on("callback_query", async (ctx) => {
    const data = (ctx.callbackQuery as any).data as string;
    if (!data) return;
    await ctx.answerCbQuery();

    const state = getState(ctx.from.id);

    // ── Cancel from any step ──
    if (data === "cancel") {
      resetState(ctx.from.id);
      await ctx.editMessageText("🔄 Cancelled. Send a new file or paste data to start fresh.");
      return;
    }

    // ── New dashboard (after completion) ──
    if (data === "new_dashboard") {
      resetState(ctx.from.id);
      await ctx.reply("─────────────────────\n📊 Ready for new data! Send a file or paste text.");
      return;
    }

    // ── Confirmation for small files ──
    if (data === "confirm_yes" && state.step === "awaiting_confirm") {
      state.step = "awaiting_theme";
      await ctx.editMessageText(
        "Choose a theme for your dashboard:",
        Markup.inlineKeyboard([
          [Markup.button.callback("🌙 Dark", "theme_dark"), Markup.button.callback("☀️ Light", "theme_light")],
          [Markup.button.callback("✖ Cancel", "cancel")],
        ]),
      );
      return;
    }

    if (data === "confirm_no" && state.step === "awaiting_confirm") {
      resetState(ctx.from.id);
      await ctx.editMessageText("OK, send me a different file or paste data.");
      return;
    }

    // ── Theme selection ──
    if (data.startsWith("theme_") && state.step === "awaiting_theme") {
      state.theme = data === "theme_light" ? "light" : "dark";
      state.step = "awaiting_focus";
      await ctx.editMessageText(
        `Theme: ${state.theme === "dark" ? "🌙 Dark" : "☀️ Light"}\n\n` +
          "Want to add analysis focus?\n" +
          'Type a message (e.g. "focus on revenue trends") or press Skip.',
        Markup.inlineKeyboard([
          [Markup.button.callback("⏭ Skip — analyze as-is", "focus_skip")],
          [Markup.button.callback("✖ Cancel", "cancel")],
        ]),
      );
      return;
    }

    // ── Skip focus ──
    if (data === "focus_skip" && state.step === "awaiting_focus") {
      await ctx.editMessageText(
        `Theme: ${state.theme === "dark" ? "🌙 Dark" : "☀️ Light"} | Focus: general`,
      );
      await runAnalysis(ctx, state);
      return;
    }
  });

  // ── Document handler ──

  bot.on(message("document"), async (ctx) => {
    const state = getState(ctx.from.id);

    // If user sends a new file mid-flow, reset and start over
    if (state.step !== "idle") {
      resetState(ctx.from.id);
    }
    const freshState = getState(ctx.from.id);

    const doc = ctx.message.document;
    const caption = ctx.message.caption || undefined;

    const status = await ctx.reply("⏳ Parsing file...");

    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const parsed = await parseFile({ name: doc.file_name || "file", buffer });
      freshState.parsed = parsed;

      if (caption) {
        freshState.focus = caption;
      }

      // Check if data is too small
      if (parsed.rowCount <= 1 || parsed.preview.trim().length < 10) {
        freshState.step = "awaiting_confirm";
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          status.message_id,
          undefined,
          `⚠️ This file seems very small (${parsed.rowCount} row(s), ${parsed.preview.trim().length} chars).\n\nProceed anyway?`,
          {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback("✅ Yes, analyze it", "confirm_yes"), Markup.button.callback("❌ No", "confirm_no")],
              [Markup.button.callback("✖ Cancel", "cancel")],
            ]).reply_markup,
          },
        );
        return;
      }

      freshState.step = "awaiting_theme";
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        `✅ Parsed: ${parsed.name} (${parsed.type}, ~${parsed.rowCount} rows)\n\nChoose a theme:`,
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback("🌙 Dark", "theme_dark"), Markup.button.callback("☀️ Light", "theme_light")],
            [Markup.button.callback("✖ Cancel", "cancel")],
          ]).reply_markup,
        },
      );
    } catch (err: any) {
      console.error("Error parsing document:", err);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        `❌ Error: ${err.message || "Something went wrong"}`,
      );
      resetState(ctx.from.id);
    }
  });

  // ── Text handler ──

  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    const state = getState(ctx.from.id);

    // If awaiting focus, treat text as focus instruction
    if (state.step === "awaiting_focus") {
      state.focus = text;
      await ctx.reply(
        `Theme: ${state.theme === "dark" ? "🌙 Dark" : "☀️ Light"} | Focus: "${text}"`,
      );
      await runAnalysis(ctx, state);
      return;
    }

    // If mid-flow, reset
    if (state.step !== "idle") {
      resetState(ctx.from.id);
    }
    const freshState = getState(ctx.from.id);

    if (text.length < 10) {
      await ctx.reply("Send me a data file or paste some data (at least a few rows).");
      return;
    }

    const parsed: ParsedFile = {
      name: "pasted_data.txt",
      type: "text",
      preview: text.slice(0, 4000),
      rowCount: text.trim().split("\n").length,
    };
    freshState.parsed = parsed;

    if (parsed.rowCount <= 1) {
      freshState.step = "awaiting_confirm";
      await ctx.reply(
        `⚠️ Very little data (${parsed.rowCount} row). Proceed?`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Yes", "confirm_yes"), Markup.button.callback("❌ No", "confirm_no")],
          [Markup.button.callback("✖ Cancel", "cancel")],
        ]),
      );
      return;
    }

    freshState.step = "awaiting_theme";
    await ctx.reply(
      `✅ Got ${parsed.rowCount} rows of data.\n\nChoose a theme:`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🌙 Dark", "theme_dark"), Markup.button.callback("☀️ Light", "theme_light")],
        [Markup.button.callback("✖ Cancel", "cancel")],
      ]),
    );
  });

  // ── Analysis pipeline ──

  async function runAnalysis(ctx: any, state: UserState) {
    const chatId = ctx.chat!.id;
    const userId = ctx.from!.id;

    const status = await ctx.reply("🔍 Analyzing with AI...");

    try {
      const prompt = buildAnalysisPrompt([state.parsed!], state.focus);
      const meta = await analyzeData(prompt);

      await ctx.telegram.editMessageText(chatId, status.message_id, undefined, "🎨 Generating dashboard...");

      const theme = state.theme || "dark";
      const html = generateDashboard(meta, theme);
      const { slug } = createSnapshot(meta.title, html);
      const url = `${BASE_URL}/s/${slug}`;

      await ctx.telegram.editMessageText(
        chatId,
        status.message_id,
        undefined,
        `✅ Dashboard ready!\n\n` +
          `📊 ${meta.title}\n` +
          `${meta.summary}\n\n` +
          `🔗 ${url}`,
      );

      // Screenshot
      try {
        const screenshotMsg = await ctx.reply("📸 Taking screenshot...");
        const jpg = await screenshotDashboard(html);
        await ctx.telegram.deleteMessage(chatId, screenshotMsg.message_id).catch(() => {});
        await ctx.replyWithPhoto(
          { source: jpg, filename: "dashboard.jpg" },
          { caption: `📊 ${meta.title}\n🔗 ${url}` },
        );
      } catch (screenshotErr: any) {
        console.error("Screenshot failed:", screenshotErr);
      }

      // End of session — offer to start new
      await ctx.reply(
        "─────────────────────\n✨ Done! Send another file or tap below:",
        Markup.inlineKeyboard([
          [Markup.button.callback("📊 New dashboard", "new_dashboard")],
        ]),
      );
    } catch (err: any) {
      console.error("Error in analysis:", err);
      await ctx.telegram.editMessageText(
        chatId,
        status.message_id,
        undefined,
        `❌ Error: ${err.message || "Something went wrong"}`,
      );
      await ctx.reply(
        "Something went wrong. Try again:",
        Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Start over", "new_dashboard")],
        ]),
      );
    } finally {
      resetState(userId);
    }
  }

  return { bot, webhookPath, setupWebhook };
}
