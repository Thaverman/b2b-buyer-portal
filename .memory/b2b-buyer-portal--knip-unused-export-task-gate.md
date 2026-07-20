---
title: "knip gate gap: an export consumed only within its own file passes eslint+tsc but fails yarn lint:knip (CI-blocking) — run lint:knip in every task's gate, not just eslint/tsc"
type: gotcha
created: 2026-07-20
updated: 2026-07-20
lastVerified: 2026-07-20
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: DevEx
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
syncPending: [mongodb, obsidian-vault]  # repo sink only — MCP_DOCKER gateway disconnected this session; promote per [[b2b-buyer-portal--memory-sinks-docker-mcp-wsl]]
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: LoyaltyMembershipSummary   # the incident: exported 283e8769, only ever consumed inside api.ts (as LoyaltyCustomer.currentMembership's type) — knip flagged it; un-exported in aa6d8300
tags: [memory, b2b-buyer-portal, devex, knip, lint, ci, testing-gates]
---

# knip gate gap: same-file-only exports pass eslint/tsc but fail CI lint

`yarn lint` (CI) runs three linters; `lint:knip` fails the build on **unused
exports**. A TypeScript `export` that is only ever consumed *within its own
file* (e.g. an exported interface used solely as a field type of another type
in the same module) sails through `tsc --noEmit` AND `eslint --max-warnings 0`
— the two gates most task checklists run — and then fails `yarn lint:knip`.

**Incident:** the membership-perks task (commit 283e8769, 2026-07-17) added
`export interface LoyaltyMembershipSummary` in `src/pages/Loyalty/api.ts`,
consumed only by `LoyaltyCustomer.currentMembership` in the same file. Its
gates were tests + tsc + scoped eslint — all green — so the CI-blocking knip
failure shipped silently and was only caught **two features later** by the SSW
tier-progress run's knip check. Fix was trivial (drop the `export` keyword,
commit aa6d8300), but the failure sat on the branch for three days.

**Rules of thumb:**
- Include `yarn lint:knip` in EVERY task's pre-commit gate, even when the task
  "only adds an export" — eslint/tsc cannot catch this class.
- Only export what another file actually imports (api.ts's own header comment
  says this; types used as same-file field shapes stay module-internal).
- Interim knip flags are legitimate ONLY when a same-plan follow-up task
  consumes the export (note it in the ledger and verify the flag clears when
  that task lands).
- Baseline knip/dep-cruiser failures (`src/utils/analytics.ts` orphan) are
  pre-existing — diff against baseline per [[b2b-buyer-portal--dev-red-baseline]],
  never patch them in a feature branch.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--dev-red-baseline]]
- [[b2b-buyer-portal--loyalty-memberships-tab-read-only]]
