import type { Request, Response } from "express";

// Minimal MCP protocol handler — just enough for Alpic to accept the deploy
const SERVER_INFO = {
  name: "dashboard-bot",
  version: "1.0.0",
};

const CAPABILITIES = {
  tools: {},
};

export function handleMcpPost(req: Request, res: Response): void {
  const { method, id } = req.body || {};

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
      result: { tools: [] },
    });
    return;
  }

  // Default: return empty result for any other method
  res.json({
    jsonrpc: "2.0",
    id,
    result: {},
  });
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
