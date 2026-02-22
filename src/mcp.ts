import type { Request, Response } from "express";

// DASHBOARD_API_URL points to the Railway-hosted server that stores dashboards
// When running on Alpic (MCP-only), this proxies dashboard creation to Railway
// When running on Railway itself, it calls localhost
const DASHBOARD_API_URL = process.env.DASHBOARD_API_URL || process.env.BASE_URL || "http://localhost:3001";

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
    // Call the Railway-hosted API to create the dashboard
    const apiRes = await fetch(`${DASHBOARD_API_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, focus }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({ error: "API request failed" }));
      throw new Error((err as any).error || `API returned ${apiRes.status}`);
    }

    const result = (await apiRes.json()) as { url: string; title: string; summary: string };

    res.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: `Dashboard ready!\n\n**${result.title}**\n${result.summary}\n\nView: ${result.url}`,
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

  res.write(`event: endpoint\ndata: /mcp\n\n`);

  const interval = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 30_000);

  _req.on("close", () => {
    clearInterval(interval);
  });
}
