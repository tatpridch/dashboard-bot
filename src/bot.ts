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
  statusMessageId?: number;
}

const sessions = new Map<number, UserState>();

function getState(userId: number): UserState {
  if (!sessions.has(userId)) sessions.set(userId, { step: "idle" });
  return sessions.get(userId)!;
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

  bot.start((ctx) => {
    const state = getState(ctx.from.id);
    state.step = "idle";
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
        "2. Choose light or dark theme\n" +
        "3. Optionally add focus instructions\n" +
        "4. Get a link + screenshot of your dashboard!",
    );
  });

  // Callback query handler for inline keyboard buttons
  bot.on("callback_query", async (ctx) => {
    const data = (ctx.callbackQuery as any).data as string;
    if (!data) return;
    await ctx.answerCbQuery();

    const state = getState(ctx.from.id);

    // Confirmation for empty/small files
    if (data === "confirm_yes" && state.step === "awaiting_confirm") {
      state.step = "awaiting_theme";
      await ctx.editMessageText(
        "Got it! Choose a theme for your dashboard:",
        Markup.inlineKeyboard([
          Markup.button.callback("🌙 Dark", "theme_dark"),
          Markup.button.callback("☀️ Light", "theme_light"),
        ]),
      );
      return;
    }

    if (data === "confirm_no" && state.step === "awaiting_confirm") {
      state.step = "idle";
      state.parsed = undefined;
      await ctx.editMessageText("OK, send me a different file or paste data.");
      return;
    }

    // Theme selection
    if (data.startsWith("theme_") && state.step === "awaiting_theme") {
      state.theme = data === "theme_light" ? "light" : "dark";
      state.step = "awaiting_focus";
      await ctx.editMessageText(
        `Theme: ${state.theme === "dark" ? "🌙 Dark" : "☀️ Light"}\n\n` +
          "Want to add specific focus for the analysis?\n" +
          "Send a message (e.g. \"focus on revenue trends\") or press Skip.",
        Markup.inlineKeyboard([Markup.button.callback("⏭ Skip — analyze as-is", "focus_skip")]),
      );
      return;
    }

    // Skip focus
    if (data === "focus_skip" && state.step === "awaiting_focus") {
      await ctx.editMessageText(`Theme: ${state.theme === "dark" ? "🌙 Dark" : "☀️ Light"} | Focus: none`);
      await runAnalysis(ctx, state);
      return;
    }
  });

  // Document handler
  bot.on(message("document"), async (ctx) => {
    const state = getState(ctx.from.id);
    const doc = ctx.message.document;
    const caption = ctx.message.caption || undefined;

    const status = await ctx.reply("⏳ Parsing file...");
    state.statusMessageId = status.message_id;

    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const parsed = await parseFile({ name: doc.file_name || "file", buffer });
      state.parsed = parsed;

      // Check if data is too small
      if (parsed.rowCount <= 1 || parsed.preview.trim().length < 10) {
        state.step = "awaiting_confirm";
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          status.message_id,
          undefined,
          `⚠️ This file seems very small (${parsed.rowCount} row(s), ${parsed.preview.trim().length} chars).\n\nAre you sure you want to proceed?`,
          { reply_markup: Markup.inlineKeyboard([
            Markup.button.callback("✅ Yes, analyze it", "confirm_yes"),
            Markup.button.callback("❌ No, I'll resend", "confirm_no"),
          ]).reply_markup },
        );
        return;
      }

      // If caption provided, use it as focus and skip the question
      if (caption) {
        state.step = "awaiting_theme";
        state.parsed = { ...parsed, preview: parsed.preview }; // keep parsed
        // Store focus in state temporarily
        (state as any).focus = caption;
      }

      state.step = "awaiting_theme";
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        `✅ Parsed: ${parsed.name} (${parsed.type}, ~${parsed.rowCount} rows)\n\nChoose a theme for your dashboard:`,
        { reply_markup: Markup.inlineKeyboard([
          Markup.button.callback("🌙 Dark", "theme_dark"),
          Markup.button.callback("☀️ Light", "theme_light"),
        ]).reply_markup },
      );
    } catch (err: any) {
      console.error("Error parsing document:", err);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        `❌ Error parsing file: ${err.message || "Something went wrong"}`,
      );
      state.step = "idle";
    }
  });

  // Text handler
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    const state = getState(ctx.from.id);

    // If awaiting focus, treat this text as focus instruction
    if (state.step === "awaiting_focus") {
      (state as any).focus = text;
      await ctx.reply(`Focus: "${text}"`);
      await runAnalysis(ctx, state);
      return;
    }

    // Otherwise treat as raw data paste
    if (text.length < 10) {
      await ctx.reply("Send me a data file or paste some data (at least a few rows of CSV, JSON, etc.).");
      return;
    }

    const parsed: ParsedFile = {
      name: "pasted_data.txt",
      type: "text",
      preview: text.slice(0, 4000),
      rowCount: text.trim().split("\n").length,
    };

    state.parsed = parsed;

    if (parsed.rowCount <= 1) {
      state.step = "awaiting_confirm";
      await ctx.reply(
        `⚠️ Very little data (${parsed.rowCount} row(s)). Proceed anyway?`,
        Markup.inlineKeyboard([
          Markup.button.callback("✅ Yes", "confirm_yes"),
          Markup.button.callback("❌ No", "confirm_no"),
        ]),
      );
      return;
    }

    state.step = "awaiting_theme";
    await ctx.reply(
      `✅ Got ${parsed.rowCount} rows of data.\n\nChoose a theme:`,
      Markup.inlineKeyboard([
        Markup.button.callback("🌙 Dark", "theme_dark"),
        Markup.button.callback("☀️ Light", "theme_light"),
      ]),
    );
  });

  async function runAnalysis(ctx: any, state: UserState) {
    const chatId = ctx.chat!.id;
    const focus = (state as any).focus as string | undefined;

    const status = await ctx.reply("🔍 Analyzing with AI...");

    try {
      const prompt = buildAnalysisPrompt([state.parsed!], focus);
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
        `✅ Dashboard ready!\n\n📊 ${meta.title}\n${meta.summary}\n\n🔗 ${url}`,
      );

      // Screenshot and send as photo
      try {
        await ctx.reply("📸 Taking screenshot...");
        const jpg = await screenshotDashboard(html);
        await ctx.replyWithPhoto(
          { source: jpg, filename: "dashboard.jpg" },
          { caption: `${meta.title}\n${url}` },
        );
      } catch (screenshotErr: any) {
        console.error("Screenshot failed:", screenshotErr);
        // Non-critical — dashboard link already sent
      }
    } catch (err: any) {
      console.error("Error in analysis:", err);
      await ctx.telegram.editMessageText(
        chatId,
        status.message_id,
        undefined,
        `❌ Error: ${err.message || "Something went wrong"}`,
      );
    } finally {
      // Reset state
      state.step = "idle";
      state.parsed = undefined;
      state.theme = undefined;
      (state as any).focus = undefined;
    }
  }

  return { bot, webhookPath, setupWebhook };
}
