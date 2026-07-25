/**
 * Wave OS MCP Proxy v3 — Thin Local Forwarder + Portal Server
 * 
 * Two responsibilities:
 * 1. MCP Transport (stdio): Forwards Cursor's JSON-RPC calls to the cloud mcpRouter
 * 2. Portal Server (HTTP): Serves wave-portal.html + activity feed via WebSocket
 * 
 * Zero secrets. Zero logic. Just forwarding + UI.
 * 
 * Usage in .cursor/mcp.json:
 * {
 *   "mcpServers": {
 *     "wave-os": {
 *       "command": "node",
 *       "args": ["~/.wave-mcp/proxy.js"],
 *       "env": {
 *         "MCP_BACKEND_URL": "https://oswave.io/functions/mcpRouter"
 *       }
 *     }
 *   }
 * }
 * 
 * Portal: open http://localhost:4400 in browser
 * 
 * Built by xBuildy for the Base44 Dev Build-Off Competition
 * July 2026
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { WebSocketServer } from "ws";

// ── Config ──
const MCP_BACKEND_URL = process.env.MCP_BACKEND_URL || "https://oswave.io/functions/mcpRouter";
const PORTAL_PORT = parseInt(process.env.WAVE_PORTAL_PORT || "4400");
const AUTH_TOKEN = process.env.WAVE_AUTH_TOKEN || "";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORTAL_HTML_PATH = join(__dirname, "portal.html");

// ── Activity Feed (in-memory, max 50) ──
const activities = [];
const MAX_ACTIVITIES = 50;

const TOOL_META = {
  "b44_list_apps": { icon: "📋", label: "Listed Base44 apps", creditType: "base44", cost: 0 },
  "b44_get_schema": { icon: "📐", label: "Fetched entity schema", creditType: "base44", cost: 0 },
  "b44_entity_list": { icon: "📊", label: "Listed records", creditType: "base44", cost: 0 },
  "b44_entity_create": { icon: "📊", label: "Created record", creditType: "base44", cost: 0 },
  "b44_entity_update": { icon: "📊", label: "Updated records", creditType: "base44", cost: 0 },
  "b44_entity_delete": { icon: "🗑️", label: "Deleted records", creditType: "base44", cost: 0 },
  "b44_deploy_function": { icon: "🚀", label: "Deployed function", creditType: "base44", cost: 0 },
  "b44_get_function_logs": { icon: "📜", label: "Fetched function logs", creditType: "base44", cost: 0 },
  "theta_compute_start": { icon: "⚡", label: "Started GPU instance", creditType: "compute", cost: 1 },
  "theta_compute_stop": { icon: "⏹️", label: "Stopped GPU instance", creditType: "compute", cost: 0 },
  "theta_compute_status": { icon: "🖥️", label: "Checked compute status", creditType: "compute", cost: 0 },
  "theta_ai_chat": { icon: "💬", label: "AI chat", creditType: "compute", cost: 1 },
  "theta_generate_image": { icon: "🎨", label: "Generated image", creditType: "compute", cost: 4 },
  "theta_generate_video": { icon: "🎬", label: "Generated video", creditType: "compute", cost: 20 },
  "theta_list_models": { icon: "🔍", label: "Listed AI models", creditType: "compute", cost: 0 },
  "theta_get_credits": { icon: "💳", label: "Checked credit balance", creditType: "compute", cost: 0 },
  "wave": { icon: "💬", label: "Wave OS chat", creditType: "compute", cost: 1 },
  "wave_check_messages": { icon: "📬", label: "Checked messages", creditType: "compute", cost: 0 },
  "wave_send_message": { icon: "📤", label: "Sent message", creditType: "compute", cost: 0 },
  "wave_save_memory": { icon: "🧠", label: "Saved memory", creditType: "compute", cost: 0 },
  "wave_recall_memory": { icon: "🧠", label: "Recalled memory", creditType: "compute", cost: 0 },
  "wave_morning_briefing": { icon: "☀️", label: "Morning briefing", creditType: "compute", cost: 0 },
  "wave_triage": { icon: "🔄", label: "Triage scan", creditType: "compute", cost: 0 },
  "wave_meeting_prep": { icon: "📅", label: "Meeting prep", creditType: "compute", cost: 0 },
  "wave_follow_up_scan": { icon: "📋", label: "Follow-up scan", creditType: "compute", cost: 0 },
  "wave_delegate_subagent": { icon: "🤖", label: "Delegated sub-agent", creditType: "compute", cost: 0 },
  "wave_entity_list": { icon: "📊", label: "Listed Wave OS records", creditType: "compute", cost: 0 },
  "wave_entity_create": { icon: "📊", label: "Created Wave OS record", creditType: "compute", cost: 0 },
  "wave_entity_update": { icon: "📊", label: "Updated Wave OS records", creditType: "compute", cost: 0 },
  "wave_entity_delete": { icon: "🗑️", label: "Deleted Wave OS records", creditType: "compute", cost: 0 },
};

function logActivity(toolName, args, success) {
  const meta = TOOL_META[toolName] || { icon: "⚡", label: toolName, creditType: "base44", cost: 0 };
  
  // Build description from tool + args
  let description = meta.label;
  if (args?.entity_name) description += ": " + args.entity_name;
  else if (args?.function_name) description += ": " + args.function_name;
  else if (args?.prompt) description += ": \"" + String(args.prompt).slice(0, 40) + "\"";
  else if (args?.message) description += ": \"" + String(args.message).slice(0, 40) + "\"";

  const activity = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    tool: toolName,
    icon: success ? meta.icon : "❌",
    description: success ? description : "Failed: " + description,
    creditType: meta.creditType,
    creditCost: meta.cost,
    timestamp: new Date().toISOString(),
    success,
  };

  activities.unshift(activity);
  if (activities.length > MAX_ACTIVITIES) activities.pop();

  // Broadcast to all connected portal clients
  broadcastToPortals(activity);
}

// ── Portal HTTP Server ──
const portalClients = new Set();

const httpServer = createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve portal HTML
  if (req.url === "/" || req.url === "/portal" || req.url === "/index.html") {
    if (existsSync(PORTAL_HTML_PATH)) {
      let html = readFileSync(PORTAL_HTML_PATH, "utf-8");
      // Inject backend URL and auth token
      html = html.replace("{{MCP_BACKEND_URL}}", MCP_BACKEND_URL);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Portal HTML not found at " + PORTAL_HTML_PATH);
    }
    return;
  }

  // Get activities as JSON
  if (req.url === "/api/activities") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ activities }));
    return;
  }

  // Get credits (proxy to mcpRouter)
  if (req.url === "/api/credits") {
    forwardToRouter({
      jsonrpc: "2.0",
      id: "portal-credits",
      method: "tools/call",
      params: { name: "theta_get_credits", arguments: {} },
    }).then(result => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    }).catch(err => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found. Open http://localhost:" + PORTAL_PORT + " for the Wave OS Portal.");
});

// ── WebSocket for real-time activity feed ──
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws) => {
  portalClients.add(ws);
  
  // Send current activities on connect
  ws.send(JSON.stringify({ type: "activities", activities }));
  
  ws.on("close", () => {
    portalClients.delete(ws);
  });
});

function broadcastToPortals(activity) {
  const msg = JSON.stringify({ type: "activity", activity });
  for (const client of portalClients) {
    if (client.readyState === 1) { // OPEN
      client.send(msg);
    }
  }
}

// Start portal server — gracefully skip if port is already in use
httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("[Wave Portal] Port " + PORTAL_PORT + " already in use — portal disabled, MCP still active");
  } else {
    console.error("[Wave Portal] Server error:", err.message);
  }
});
httpServer.listen(PORTAL_PORT, "127.0.0.1", () => {
  console.error("[Wave Portal] Serving at http://localhost:" + PORTAL_PORT);
  console.error("[Wave Portal] WebSocket at ws://localhost:" + PORTAL_PORT + "/ws");
});

// ── MCP Server (stdio transport for Cursor) ──
const server = new Server(
  { name: "wave-os-mcp", version: "3.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

// Forward JSON-RPC to cloud mcpRouter
async function forwardToRouter(payload) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (AUTH_TOKEN) {
      headers["Authorization"] = "Bearer " + AUTH_TOKEN;
    }

    const resp = await fetch(MCP_BACKEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      throw new Error("mcpRouter returned " + resp.status);
    }

    return await resp.json();
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id: payload.id,
      result: {
        content: [{ type: "text", text: "Error forwarding to mcpRouter: " + err.message }],
        isError: true,
      },
    };
  }
}

// ── Initialize handler ──
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  const result = await forwardToRouter({
    jsonrpc: "2.0",
    id: request.id,
    method: "initialize",
    params: request.params,
  });
  return result.result || result;
});

// ── Tools list handler — forward to mcpRouter ──
server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  const result = await forwardToRouter({
    jsonrpc: "2.0",
    id: request.id,
    method: "tools/list",
    params: {},
  });
  
  if (result?.result?.tools) {
    return { tools: result.result.tools };
  }
  return { tools: [] };
});

// ── Tools call handler — forward + log activity ──
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  // Forward to mcpRouter
  const result = await forwardToRouter({
    jsonrpc: "2.0",
    id: request.id,
    method: "tools/call",
    params: { name, arguments: args },
  });

  // Determine success/error
  const isError = result?.result?.isError || false;
  logActivity(name, args, !isError);

  // Return to Cursor
  if (result?.result?.content) {
    return { content: result.result.content, isError: isError || undefined };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
});

// ── Start MCP server on stdio ──
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("[Wave MCP Proxy v3] Connected to Cursor via stdio");
console.error("[Wave MCP Proxy v3] Backend: " + MCP_BACKEND_URL);
console.error("[Wave MCP Proxy v3] Portal: http://localhost:" + PORTAL_PORT);
