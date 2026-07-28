---
title: "squad-coordinator `log_decision` rejects category 'plan' although CLAUDE.md prescribes exactly that call — valid categories are architecture|naming|dependency|pattern|api|other; use architecture and tag it 'plan'"
type: concept
created: 2026-07-28
updated: 2026-07-28
lastVerified: 2026-07-28
repo: b2b-buyer-portal
storeHash: both
website: both
area: DevEx
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a688facce65fba63730de89
codeRefs:
  - kind: js
    path: CLAUDE.md
    symbol: Plan Documentation        # the section prescribing log_decision(category: "plan")
  - kind: js
    path: .mcp.json
    symbol: mcpServers.squad-coordinator   # http://localhost:8070/ — server enforcing the category enum
tags: [memory, b2b-buyer-portal, devex, squad-coordinator, mcp, claude-code, memory-protocol, plans]
---

# `log_decision(category: "plan")` is documented but always fails

[CLAUDE.md](../CLAUDE.md)'s **Plan Documentation** section instructs: after saving
a plan, call `log_decision(category: "plan")` with the full path in `rationale`.

The squad-coordinator MCP server rejects it:

```json
{"error":"Invalid category 'plan'. Valid: architecture, naming, dependency, pattern, api, other"}
```

Every session that follows the documented protocol burns a failed round-trip
before discovering this. The enum is enforced **server-side**, so no client-side
phrasing avoids it.

## Workaround

Call `log_decision` with `category: "architecture"`, put the spec/plan path in
`rationale`, and add `plan` to the comma-separated `tags` so
`search_decisions(tag: "plan")` still surfaces it. Used 2026-07-27/28 for the My
rewards spec and plan decisions (`6a680f242556312d38c951dd`,
`6a6811f92556312d38c951de`).

## Where the real fix belongs

Either amend CLAUDE.md's Plan Documentation section to prescribe the
architecture+tag form, or add `plan` to the server's category enum. **CLAUDE.md is
hand-maintained and agents are read-only on it** — propose the change via
`send_message`, don't edit it.

## Adjacent field constraints

- `update_status` accepts free text, but the meaningful statuses are
  `working | blocked | idle | done`.
- All `project` parameters in this repo must be `"b2b-buyer-portal"` (CLAUDE.md).

This gotcha is about the **tooling contract**, not the codebase; it bites here
because this is where the instruction lives.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--memory-sinks-docker-mcp-wsl]]
