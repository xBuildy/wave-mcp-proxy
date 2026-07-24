#!/usr/bin/env node
// Wave OS MCP Thin Proxy v2.0.0
// ZERO SECRETS. Just forwards JSON-RPC to the Base44 backend function.
// Install once, never update again. All logic + secrets stay server-side.
//
// .cursor/mcp.json:
// {
//   "mcpServers": {
//     "wave-os": {
//       "command": "node",
//       "args": ["C:/Users/Eddie/wave-mcp-proxy/dist/index.js"],
//       "env": {
//         "MCP_BACKEND_URL": "https://insta-fi-ai-1e5bea1c.base44.app/api/apps/6a5abc9bfa61c917463b71cd/functions/mcpRouter"
//       }
//     }
//   }
// }

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BACKEND_URL = process.env.MCP_BACKEND_URL || "https://insta-fi-ai-1e5bea1c.base44.app/api/apps/6a5abc9bfa61c917463b71cd/functions/mcpRouter";

// ── Forward any JSON-RPC request to the backend function ──
async function forward(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Backend returned ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "Backend error");
  return json.result;
}

// ── MCP Server ──
const server = new Server(
  { name: "wave-os-mcp-proxy", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(InitializeRequestSchema, async () => ({
  protocolVersion: "2024-11-05",
  capabilities: { tools: {} },
  serverInfo: { name: "wave-os-mcp", version: "2.0.0" },
}));

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const result = await forward("tools/list", {});
  return { tools: result.tools || [] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await forward("tools/call", { name, arguments: args });
  return result;
});

// ── Start ──
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Wave OS MCP Proxy v2.0.0 — connected to " + BACKEND_URL);
