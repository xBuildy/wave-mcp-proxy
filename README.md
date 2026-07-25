# Wave OS MCP — Companion to Base44 MCP

> The only MCP that gives Cursor developers **Base44 backend management** + **decentralized GPU compute**.

## What This Is

Wave OS MCP is a **companion** to Base44's official MCP (`https://app.base44.com/mcp`). They work side-by-side in Cursor:

| | Base44 MCP | Wave OS MCP |
|---|---|---|
| Create/edit apps | ✅ | — |
| List entity schemas | ✅ | — |
| Query entity records | ✅ (read-only) | ✅ (full CRUD) |
| Deploy backend functions | — | ✅ |
| Get function logs | — | ✅ |
| Theta GPU compute | — | ✅ |
| AI image generation | — | ✅ |
| Video generation | — | ✅ |
| Requires OAuth | Yes (Builder plan+) | No |
| Auth model | Base44 OAuth | Zero-secrets proxy |

## Quick Start

### 1. Add both MCPs to Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "base44": {
      "type": "http",
      "url": "https://app.base44.com/mcp"
    },
    "wave-os": {
      "command": "node",
      "args": ["/path/to/proxy-v3.js"],
      "env": {
        "MCP_BACKEND_URL": "https://oswave.io/functions/mcpRouter"
      }
    }
  }
}
```

### 2. Install dependencies

```bash
npm install
```

### 3. Restart Cursor

Both MCPs show green. Base44 builds your app. Wave OS gives it compute.

## How It Works

```
Cursor AI
  ├── base44 MCP (HTTP) ──► app.base44.com/mcp ──► Base44 Builder
  └── wave-os MCP (stdio) ──► proxy-v3.js ──► oswave.io/functions/mcpRouter
                                                        ├── b44_* tools → Base44 backend (entity CRUD, functions)
                                                        └── theta_* tools → Theta EdgeCloud (GPU, AI, video)
```

The proxy is intentionally stupid: zero secrets, zero logic, zero port binding. It forwards JSON-RPC from Cursor's stdio to the cloud mcpRouter. That's it.

## Tools (16 total)

### Tier 1 — Base44 Backend (no Wave OS account needed)
- `b44_entity_list` — List records from any entity
- `b44_entity_create` — Create records
- `b44_entity_update` — Update records by query
- `b44_entity_delete` — Delete records by query
- `b44_deploy_function` — Deploy a backend function
- `b44_get_function_logs` — Fetch function runtime logs

### Tier 2 — Theta Compute (requires Wave OS account)
- `theta_generate_image` — AI image generation via Theta EdgeCloud
- `theta_generate_video` — Video generation via Theta EdgeCloud
- `theta_list_sessions` — List compute sessions
- `theta_get_session` — Get session details
- `theta_start_session` — Start a GPU compute session
- `theta_stop_session` — Stop a compute session
- `theta_get_credits` — Check Wave OS compute credit balance
- `theta_buy_credits` — Purchase compute credits
- `theta_list_models` — List available AI models
- `theta_run_inference` — Run AI model inference

## Architecture

- **proxy-v3.js** — 100-line stdio forwarder. No HTTP server, no WebSocket, no ports. Can't crash.
- **mcpRouter** — Cloud function on oswave.io. Handles auth, routing, credit deduction.
- **Zero secrets in local config** — Just a URL. Auth handled server-side.

## Built For

Base44 Dev Build-Off Competition — July 2026
