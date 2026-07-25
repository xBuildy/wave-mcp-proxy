/**
 * Wave OS MCP Proxy v3 — Pure MCP Forwarder
 *
 * Single responsibility: Forward Cursor's JSON-RPC MCP calls to the cloud mcpRouter.
 * The portal UI lives in the VS Code sidebar extension (wave-os-portal).
 *
 * Usage in .cursor/mcp.json:
 * {
 *   "mcpServers": {
 *     "wave-os": {
 *       "command": "node",
 *       "args": ["C:\\Users\\Eddie\\wave-mcp-proxy\\proxy-v3.js"],
 *       "env": {
 *         "MCP_BACKEND_URL": "https://oswave.io/functions/mcpRouter"
 *       }
 *     }
 *   }
 * }
 *
 * Built by xBuildy for the Base44 Dev Build-Off Competition
 * July 2026
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── Config ──
const MCP_BACKEND_URL = process.env.MCP_BACKEND_URL || "https://oswave.io/functions/mcpRouter";
const AUTH_TOKEN = process.env.WAVE_AUTH_TOKEN || "";

console.error("[Wave MCP Proxy v3] Starting...");
console.error("[Wave MCP Proxy v3] Backend: " + MCP_BACKEND_URL);

// ── Forward JSON-RPC to cloud mcpRouter ──
async function forwardToRouter(payload) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "wave-mcp-proxy/3.0.0",
  };
  if (AUTH_TOKEN) {
    headers["Authorization"] = "Bearer " + AUTH_TOKEN;
  }

  const resp = await fetch(MCP_BACKEND_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error("mcpRouter HTTP " + resp.status + ": " + text.slice(0, 200));
  }

  return resp.json();
}

// ── MCP Server (stdio transport for Cursor) ──
const server = new Server(
  { name: "wave-os-mcp", version: "3.0.0" },
  { capabilities: { tools: {} } }
);

// List tools — fetch from cloud router
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const result = await forwardToRouter({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    return result.result || { tools: [] };
  } catch (err) {
    console.error("[Wave MCP Proxy v3] ListTools error: " + err.message);
    return { tools: [] };
  }
});

// Call tool — forward to cloud router
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await forwardToRouter({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: request.params,
    });
    return result.result || { content: [{ type: "text", text: "No response from router" }] };
  } catch (err) {
    console.error("[Wave MCP Proxy v3] CallTool error: " + err.message);
    return {
      content: [{ type: "text", text: "Error: " + err.message }],
      isError: true,
    };
  }
});

// ── Start ──
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[Wave MCP Proxy v3] Connected to Cursor via stdio");
