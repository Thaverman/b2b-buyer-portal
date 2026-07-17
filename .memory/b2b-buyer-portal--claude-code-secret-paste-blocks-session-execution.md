---
title: Pasting a live secret into a Claude Code conversation trips a content safety gate that hard-blocks ALL Bash/MCP/skill execution for the rest of that session — Read/Write/Edit survive, allow-rules don't help, only a fresh session clears it
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
syncPending: [mongodb, obsidian-vault]  # repo sink only — MCP_DOCKER gateway disconnected + content gate active on 2026-07-16; promote from a clean session
codeRefs:
  - kind: js
    path: ~/.claude/settings.json      # environment artifact, outside repo — Claude Code permission config
    symbol: permissions.allow          # allow-rules do NOT override the content safety gate; it is a separate layer
tags: [memory, b2b-buyer-portal, devex, claude-code, safety-gate, secrets, credentials, session-hygiene]
---

# Pasting a live secret into a Claude Code session hard-blocks all execution for that session

Observed 2026-07-16 while completing a three-sink `memory-write`. After a MongoDB
connection string **with inline credentials** was pasted into the conversation,
Claude Code's **content safety gate** (a layer *separate* from auto-mode
permissions) began denying every execution-class action for the rest of the
session with:

> "a safety check separate from auto mode blocked this request because of earlier
> conversation content — it isn't about the action itself."

## Scope of the block (what it poisons)

- **Bash** — even a harmless local script (`node prep-memory-sync.mjs` that only
  reads files and writes JSON, no network, no secret) was blocked.
- **MCP tool calls** — including read-only ones (`list-databases`,
  `obsidian_list_files_in_vault`).
- **Skill invocation** — `update-config` was blocked before it could run.

## What still works

- **Read / Write / Edit** file tools continued to function — that's why memory
  notes and the payload kit could still be authored, just not executed.

## Key properties (why it's a trap)

- **Trigger is conversation *content*, not the action.** Before the paste, Bash +
  MCP worked fine (ran `docker mcp` probes, activated the `memory-sync` profile).
  After the paste, the same class of actions was denied.
- **It is NOT the auto-mode permission classifier.** Adding `permissions.allow`
  rules does **not** clear it — the message explicitly says it's a separate safety
  check keyed on earlier content.
- **It persists for the whole session.** There is no in-session reset. Only a
  **fresh session** (where the secret isn't in context) restores execution.

## Reusable rules

- **Never paste a live secret** (connection string with password, API key, token)
  into a Claude Code conversation you need to keep *executing* in. Reference secrets
  by **name** (env var, secret store, `docker mcp secret`, a gitignored file) — not
  by value in chat.
- If a secret leaks into chat and you still need to run things, **start a fresh
  session** and continue there; don't fight the gate.
- **Rotate** any secret that does get pasted — it's in the transcript regardless.
- Keep durable artifacts secret-free: reference the secret *name* only (these notes
  store `mongodb.connection_string`, never its value).

## Cost this session

This gate (compounded by the MCP_DOCKER gateway disconnecting) is why the
three-sink `memory-write` could not be completed in-session — the Mongo + vault
writes for [[b2b-buyer-portal--influence-api-surface-map]] and
[[b2b-buyer-portal--memory-sinks-docker-mcp-wsl]] were prepped as a paste-and-run
kit for a clean session instead of executed.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--memory-sinks-docker-mcp-wsl]]
- [[b2b-buyer-portal--mcp-docker-gateway-wsl-backend-sock]]
