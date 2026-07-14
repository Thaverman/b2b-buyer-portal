---
title: MCP_DOCKER (docker mcp gateway) fails in WSL2 — plugin dials ~/.docker/desktop/backend.sock; symlink it to the /mnt/wsl Desktop shared socket
type: concept
created: 2026-07-13
updated: 2026-07-13
lastVerified: 2026-07-13
repo: b2b-buyer-portal
storeHash: both
website: both
area: DevEx
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a552eaa997fc6336a44ba89
codeRefs:
  - kind: js
    path: ~/.claude.json          # environment artifact, outside repo — project-scoped Claude Code MCP config
    symbol: mcpServers.MCP_DOCKER
tags: [memory, b2b-buyer-portal, devex, mcp, docker, wsl2]
---

# MCP_DOCKER (docker mcp gateway) fails in WSL2 — plugin dials ~/.docker/desktop/backend.sock; symlink it to the /mnt/wsl Desktop shared socket

Every Claude Code session in this project failed to connect the `MCP_DOCKER`
server (`docker mcp gateway run`, configured project-scoped in `~/.claude.json`)
with `Server stderr: Docker Desktop is not running` →
`MCP error -32000: Connection closed` — while Docker Desktop and its WSL2 engine
were demonstrably up (containers running; `curl --unix-socket .../backend.sock
http://localhost/ping` → 200).

**Root cause:** the `docker-mcp` CLI plugin (v0.43.1) resolves the Docker
Desktop backend socket only at `~/.docker/desktop/backend.sock` (or
`/run/host-services/backend.sock` inside the Desktop VM). `strings` on the
binary shows **zero** `/mnt/wsl` references. In an integrated WSL2 distro,
Docker Desktop exposes that socket only at
`/mnt/wsl/docker-desktop/shared-sockets/host-services/backend.sock` and never
creates the per-user path — so the plugin concludes Desktop is down.
`docker desktop status` fails the same way.

**Fix** (lives in `$HOME`, survives reboots; dangles harmlessly when Desktop is
actually off, which then makes the error message truthful):

```bash
ln -sf /mnt/wsl/docker-desktop/shared-sockets/host-services/backend.sock \
       ~/.docker/desktop/backend.sock
```

Verified: `docker mcp gateway run` then initializes in ~180 ms and serves stdio.

## Key Points
- "Docker Desktop is not running" from `docker mcp` ≠ Desktop actually down —
  check whether the engine answers first (`docker info`).
- The WSL-side gateway keeps its **own** profile/catalog; Windows-side MCP
  Toolkit config does not carry over. Until
  `docker mcp catalog pull mcp/docker-mcp-catalog:latest` runs in WSL (or
  servers are enabled there), MCP_DOCKER exposes only the dynamic tools
  (`mcp-find`, `mcp-add`, `code-mode`, …).
- Claude Code's per-server MCP connection logs:
  `~/.cache/claude-cli-nodejs/<project-slug>/mcp-logs-MCP-DOCKER/` (note the
  dashes — `MCP_DOCKER` becomes `MCP-DOCKER`).

## Code references
- `~/.claude.json` (`mcpServers.MCP_DOCKER`) — environment note: the config
  lives outside the repo; there is deliberately no in-repo code anchor.

## Related
- [[board-b2b-buyer-portal]]
