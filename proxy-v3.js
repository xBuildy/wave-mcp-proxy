/**
 * Wave OS MCP Proxy v3 — Companion MCP Forwarder
 *
 * Designed to run alongside Base44's official MCP (https://app.base44.com/mcp).
 *
 * Base44 MCP handles: app creation, app editing, schema listing, entity queries.
 * Wave OS MCP handles: entity CRUD, function deployment, Theta GPU compute.
 *
 * Together in .cursor/mcp.json:
 * {
 *   "mcpServers": {
 *     "base44": { "type": "http", "url": "https://app.base44.com/mcp" },
 *     "wave-os": {
 *       "command": "node",
 *       "args": ["./proxy-v3.js"],
 *       "env": { "MCP_BACKEND_URL": "https://oswave.io/functions/mcpRouter" }
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

const MCP_BACKEND_URL = process.env.MCP_BACKEND_URL || "https://oswave.io/functions/mcpRouter";
const AUTH_TOKEN = process.env.WAVE_AUTH_TOKEN || "";

console.error("[Wave MCP v3] Companion mode — pair with base44 MCP");
console.error("[Wave MCP v3] Backend: " + MCP_BACKEND_URL);

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

const server = new Server(
  { name: "wave-os-mcp", version: "3.0.0" },
  { capabilities: { tools: {} } }
);

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
    console.error("[Wave MCP v3] ListTools error: " + err.message);
    return { tools: [] };
  }
});

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
    console.error("[Wave MCP v3] CallTool error: " + err.message);
    return {
      content: [{ type: "text", text: "Error: " + err.message }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[Wave MCP v3] Connected to Cursor via stdio");
