---
title: memory-write MongoDB + Obsidian sinks in WSL are reachable via the MCP_DOCKER 'memory-sync' profile — not local mongosh/vault; gateway injects the secrets, remaining gate is Claude Code's permission policy
type: concept
created: 2026-07-16
updated: 2026-07-16
lastVerified: 2026-07-16
repo: b2b-buyer-portal
storeHash: both
website: both
area: DevEx
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
syncPending: [mongodb, obsidian-vault]  # this note itself: repo sink written; promote to Mongo/vault once the tool permissions below are granted
codeRefs:
  - kind: js
    path: ~/.claude.json                # environment artifact, outside repo — project-scoped MCP config
    symbol: mcpServers.MCP_DOCKER       # the gateway that serves the memory-sync profile
  - kind: js
    path: ~/.docker/mcp/profiles        # docker mcp profile store (outside repo); profile id 'memory_sync' / name 'memory-sync'
    symbol: profile.memory-sync         # servers: mongodb (image), obsidian (image)
tags: [memory, b2b-buyer-portal, devex, mcp, docker, wsl2, mongodb, obsidian, memory-write]
---

# memory-write MongoDB + Obsidian sinks are reachable in WSL via the MCP_DOCKER 'memory-sync' profile

The `memory-write` skill's two non-repo sinks (**MongoDB** `memory.entries` and the
**Obsidian vault** `Platform/Memory/`) are **not** served by local binaries in this
WSL2 environment — there is no Linux-side `mongosh` and no vault folder under
`$HOME` (Obsidian lives on the Windows side). Concluding "sinks unreachable" from
the absence of local tools is **wrong**. They are served through the **MCP_DOCKER
gateway** as a saved profile named **`memory-sync`** that already has both servers
registered and their secrets stored.

## The working path (verified 2026-07-16)

1. **Gateway must be connected first.** See the sibling gotcha
   [[b2b-buyer-portal--mcp-docker-gateway-wsl-backend-sock]] — symlink
   `~/.docker/desktop/backend.sock` → the `/mnt/wsl/.../backend.sock` share, or
   `MCP_DOCKER` never connects.
2. **Activate the profile.** `mcp-activate-profile` with profile id **`memory_sync`**
   (CLI: `docker mcp profile server ls` shows `memory_sync | image | mongodb` and
   `… | obsidian`). Activation **succeeded** and loaded the full tool surface:
   - MongoDB: `list-databases`, `list-collections`, `find`, `count`, `aggregate`,
     `insert-many`, `update-many`, `collection-schema`, `export`, … → lets you
     write `memory.entries`.
   - Obsidian: `obsidian_list_files_in_vault`, `obsidian_get_file_contents`,
     `obsidian_patch_content`, `obsidian_append_content`, `obsidian_simple_search`,
     … → lets you write `Platform/Memory/<repo>--<slug>.md` and append `wiki/log.md`.
3. **Secrets are already stored in the profile** (`mongodb.connection_string`,
   `obsidian.api_key`) and the gateway injects them at server startup. You do **not**
   need to set secrets per session, and you do **not** need local `mongosh` or a
   vault filesystem path.

## Catalog facts (`docker mcp` / `mcp-find`)

- Server **`mongodb`** — "connect to MongoDB databases and Atlas Clusters",
  `required_secrets: [mongodb.connection_string]`, `long_lived: false`.
- Server **`obsidian`** — talks to the vault via the **Obsidian Local REST API**
  community plugin, `required_secrets: [obsidian.api_key]`, `long_lived: false`.
  (The plugin must be running in the desktop Obsidian app.)

## Gotchas that look like blockers but aren't

- **`docker mcp server ls` is obsolete** → use `docker mcp profile server ls`.
- **`docker mcp secret ls/set` fails in WSL** dialing
  `~/.cache/docker-secrets-engine/engine.sock` (`no such file`). Docker Desktop
  exposes it at `/mnt/wsl/docker-desktop/shared-sockets/host-services/secrets-engine.sock`.
  Symlinking it (same pattern as backend.sock) advances the error to
  **`permission denied`** — that socket is `root:root 0660` (unlike the
  world-writable `backend.sock`), so the CLI secret path needs elevation.
  **You usually don't need it:** the `memory-sync` profile already holds the
  secrets and the gateway injects them, so activating the profile is enough to
  *use* the sinks. Only touch the secret CLI when rotating/creating a secret.
- **The real remaining gate is Claude Code's permission policy, not Docker.** In
  auto mode the classifier **denies** the `mcp__MCP_DOCKER__*` MongoDB/Obsidian
  tool calls (and `sudo` / `docker mcp secret` Bash). The tools *load* on profile
  activation but each call is blocked until allow-rules exist. To run an
  unattended three-sink `memory-write`, add permissions for the specific tools
  used, e.g. `mcp__MCP_DOCKER__find`, `mcp__MCP_DOCKER__insert-many`,
  `mcp__MCP_DOCKER__update-many`, `mcp__MCP_DOCKER__obsidian_get_file_contents`,
  `mcp__MCP_DOCKER__obsidian_patch_content`, `mcp__MCP_DOCKER__obsidian_append_content`.

## Net

Three-sink `memory-write` from WSL is fully doable: (a) gateway socket fix in
place, (b) `memory_sync` profile activated, (c) permission rules allow the mongo +
obsidian tools. No local `mongosh` and no vault filesystem path required. Until
(c) is granted, notes land in the repo `.memory/` sink only and carry
`syncPending: [mongodb, obsidian-vault]` (e.g.
[[b2b-buyer-portal--influence-api-surface-map]]).

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--mcp-docker-gateway-wsl-backend-sock]]
- [[b2b-buyer-portal--influence-api-surface-map]]
- [[b2b-buyer-portal--claude-code-secret-paste-blocks-session-execution]]
