import type { Request, Response } from "express";
import { buildAnalysisPrompt, type ParsedFile } from "./file-parser.js";
import { analyzeData } from "./analyzer.js";
import { generateDashboard } from "./html-generator.js";
import { createSnapshot } from "./snapshots.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";

const SERVER_INFO = {
  name: "dashboard-bot",
  version: "1.0.0",
};

const CAPABILITIES = {
  tools: {},
};

const TOOLS = [
  {
    name: "analyze_data",
    description:
      "Analyze data and generate an interactive dashboard. Paste CSV, JSON, TSV, or any tabular data — " +
      "the tool will parse it, run AI analysis, and return a link to a beautiful visualization dashboard.",
    inputSchema: {
      type: "object" as const,
      properties: {
        data: {
          type: "string",
          description: "The raw data to analyze (CSV, JSON, TSV, tab-separated, key-value pairs, logs, etc.)",
        },
        focus: {
          type: "string",
          description: "Optional: what to focus the analysis on (e.g. 'revenue trends', 'top performers')",
        },
      },
      required: ["data"],
    },
  },
];

export function handleMcpPost(req: Request, res: Response): void {
  const { method, id, params } = req.body || {};

  if (method === "initialize") {
    res.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: SERVER_INFO,
        capabilities: CAPABILITIES,
      },
    });
    return;
  }

  if (method === "tools/list") {
    res.json({
      jsonrpc: "2.0",
      id,
      result: { tools: TOOLS },
    });
    return;
  }

  if (method === "tools/call") {
    handleToolCall(id, params, res);
    return;
  }

  // Default: return empty result for any other method
  res.json({
    jsonrpc: "2.0",
    id,
    result: {},
  });
}

async function handleToolCall(id: unknown, params: any, res: Response) {
  const toolName = params?.name;
  const args = params?.arguments || {};

  if (toolName !== "analyze_data") {
    res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Unknown tool: ${toolName}` },
    });
    return;
  }

  const { data, focus } = args;
  if (!data || typeof data !== "string") {
    res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "Missing required parameter: data" },
    });
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

    res.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: `Dashboard ready!\n\n**${meta.title}**\n${meta.summary}\n\nView: ${url}`,
          },
        ],
      },
    });
  } catch (err: any) {
    res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: err.message || "Analysis failed" },
    });
  }
}

export function handleMcpSse(_req: Request, res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send initial endpoint event (MCP SSE transport spec)
  res.write(`event: endpoint\ndata: /mcp\n\n`);

  // Keep connection alive with periodic pings
  const interval = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 30_000);

  _req.on("close", () => {
    clearInterval(interval);
  });
}
