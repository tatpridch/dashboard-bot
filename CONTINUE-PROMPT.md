# Dashboard Bot — Telegram bot for data analysis and dashboard generation

## What it does

A fully working Telegram bot that:
1. Accepts files (CSV, XLSX, JSON, HTML, TSV, etc.) or pasted text data
2. Parses them server-side (Node.js)
3. Sends to Claude Sonnet 4.5 for analysis with a data analyst system prompt
4. Receives structured JSON (AnalysisMeta) with metrics, datasets, chart configs
5. Generates a standalone HTML dashboard with D3.js v7 (CDN) and inline scripts
6. Saves as a snapshot with 7-day TTL
7. Returns a link + screenshot to the user

## Architecture

```
User → Telegram Bot (Telegraf) → Parse file → Claude API
                                                   ↓
                                       AnalysisMeta JSON
                                                   ↓
                                 HTML Generator (D3 inline scripts)
                                                   ↓
                           Snapshot storage → Express /s/:slug
                                                   ↓
                              Bot sends link + JPG screenshot
```

## Stack
- **Runtime**: Node.js + TypeScript
- **Bot**: Telegraf (webhook mode in production, polling for local dev)
- **AI**: @anthropic-ai/sdk, model: claude-sonnet-4-5-20250929
- **Server**: Express
- **Parser**: xlsx for spreadsheets, regex for HTML tables
- **Visualization**: D3.js v7 CDN, inline scripts in HTML
- **Screenshots**: Puppeteer (headless Chrome)
- **Hosting**: Railway (bot + dashboards), Alpic (MCP endpoint)

## File structure

```
src/
├── index.ts          — Express server + bot startup (webhook/polling)
├── bot.ts            — Telegram handlers: /start, /help, documents, text, inline keyboards
├── analyzer.ts       — Claude API with data analyst system prompt
├── file-parser.ts    — File parser (CSV, XLSX, JSON, HTML, text)
├── html-generator.ts — Standalone HTML generation with D3 charts (dark/light theme)
├── screenshot.ts     — Puppeteer-based dashboard screenshot (JPG)
├── mcp.ts            — Minimal MCP endpoint for Alpic integration
├── snapshots.ts      — File-based snapshot storage (7-day TTL)
└── types.ts          — AnalysisMeta, Dataset, Metric
```

## Supported chart types
- bar / bar_horizontal — animated column charts
- timeline — line chart with area fill and animated line draw
- donut — pie chart with arc-tween animation
- treemap — proportional area map
- table — HTML table with sticky header

## Bot conversation flow

```
File/text → Size check (>10MB rejected) → Empty check → Theme (dark/light) → Focus (optional) → AI analysis → Link + Screenshot
```

Each step has Cancel button. "New dashboard" button after completion with visual separator.

## How to run

```bash
cd /path/to/dashboard-bot
npm install
# Fill .env (TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, BASE_URL)
npm run dev     # local with polling
npm run build   # compile TypeScript
npm start       # production
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| TELEGRAM_BOT_TOKEN | Yes | Telegram bot token from @BotFather |
| ANTHROPIC_API_KEY | Yes | Anthropic API key for Claude |
| BASE_URL | Yes | Public URL for dashboard links |
| WEBHOOK_MODE | No | Set to "true" for webhook mode (production) |
| SNAPSHOTS_DIR | No | Override snapshot storage path (default: ./snapshots or /tmp/snapshots) |
| DASHBOARD_API_URL | No | URL for MCP tool to proxy dashboard creation |

## Related project
Parser, types, and snapshot code adapted from `autodashboard-skybridge` — a Skybridge MCP app with D3 dashboards.
