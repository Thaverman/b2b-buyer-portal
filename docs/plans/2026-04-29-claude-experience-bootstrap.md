# Claude Experience Bootstrap — Setup Plan for `b2b-buyer-portal`

**Date:** 2026-04-29
**Status:** Approved (executing)

## Detected project type

- **Primary language:** TypeScript
- **Project shape:** `monorepo` (Turborepo) — but degenerate: single workspace (`apps/storefront`) shaped as a `frontend-spa`
- **Frameworks:** React 18, Vite 7, Redux Toolkit (legacy, migrating away), TanStack Query, MUI 5, Emotion, GraphQL + graphql-codegen, react-router 6 (HashRouter), react-intl, react-hook-form, Vitest, MSW, Testing Library, Faker
- **Build tool:** yarn 1.22.22 + Turbo 2
- **Test tool:** Vitest + jsdom + MSW + vitest-when
- **Has Docker:** false
- **Has monorepo workspace:** true (`apps/*`)
- **Active directories (last 30 days):** `apps/storefront/src/{pages,shared,utils,components,hooks}` — pages dominates with ~50% of recent file changes
- **Existing AI setup files:** `AGENTS.md` (authoritative, hand-maintained), `CLAUDE.md` (delta-only summary), `CONTRIBUTING.md`, `commit-validation.json`

## Confirmed agent roster

| Agent | Archetype | Owns | Read-only on |
|---|---|---|---|
| `storefront-pages` | frontend | `apps/storefront/src/pages/` | `shared/`, `components/`, `hooks/`, `store/`, `tests/` |
| `storefront-shared` | frontend | `apps/storefront/src/{shared,components,hooks,utils,store,types,lib}/`, `apps/storefront/src/{App.tsx,main.ts,headless.ts,react-setup.tsx,theme.tsx,lang.tsx,load-functions.ts}` | `pages/`, `tests/`, root configs |
| `graphql-codegen` | backend (narrow) | `apps/storefront/src/types/gql/`, `apps/storefront/codegen.ts`, `apps/storefront/graphql.config.ts`, `gql\`...\`` templates inside `src/shared/service/**` | everything else |
| `storefront-tests` | test | `apps/storefront/tests/`, all `**/*.test.{ts,tsx}`, all `**/*.test.mobile.tsx`, `apps/storefront/__mocks__/`, `apps/storefront/vitest.*` | `src/**` (read-only — request changes via send_message) |
| `reviewer` | reviewer | nothing (read-only) | everything |
| `infra` | infra | `.circleci/`, `config/`, `deployment/`, `turbo.json`, root `package.json`, `apps/storefront/{vite.config.ts,tsconfig.json,knip.jsonc,.dependency-cruiser.cjs,package.json}`, `.github/`, `commit-validation.json` | application code |
| `docs` | docs | `docs/`, `rfc/`, `README.md` (read-mostly) | `AGENTS.md`, `CONTRIBUTING.md`, `CLAUDE.md` are read-only — propose changes via send_message |

## Wiki integration

- **Enabled:** false (no external vault configured)

## Squad-coordinator

- **URL:** `http://localhost:8070/` (already configured in `.mcp.json`)
- **Project name to register:** `b2b-buyer-portal`

## Existing-file policy

| File | Existing? | Policy |
|---|---|---|
| `CLAUDE.md` | yes (hand-maintained, 7KB) | Append a `<!-- claude-experience-bootstrap:start --> ... :end -->` block at the bottom. Do NOT touch existing content. |
| `AGENTS.md` | yes (authoritative, 31KB) | Read-only. Never modified by any agent without explicit user approval. |
| `.mcp.json` | yes (squad-coordinator only) | Leave as-is. |
| `.claude/agents/` | no | Create. |
| `.claude/agent-memory/` | no | Create. |
| `.claude/settings.json` | no | Create with empty allow list. |
| `docs/plans/` | no | Create. |

## Files to be created or modified

**Created:**
- `docs/plans/2026-04-29-claude-experience-bootstrap.md` (this plan)
- `.claude/settings.json`
- `.claude/agents/storefront-pages.md`
- `.claude/agents/storefront-shared.md`
- `.claude/agents/graphql-codegen.md`
- `.claude/agents/storefront-tests.md`
- `.claude/agents/reviewer.md`
- `.claude/agents/infra.md`
- `.claude/agents/docs.md`
- `.claude/agent-memory/storefront-pages/MEMORY.md`
- `.claude/agent-memory/storefront-shared/MEMORY.md`
- `.claude/agent-memory/graphql-codegen/MEMORY.md`
- `.claude/agent-memory/storefront-tests/MEMORY.md`
- `.claude/agent-memory/reviewer/MEMORY.md`
- `.claude/agent-memory/infra/MEMORY.md`
- `.claude/agent-memory/docs/MEMORY.md`

**Appended-to:**
- `CLAUDE.md` (block fenced by `claude-experience-bootstrap:start/end` markers — additions only, no rewrites)

## Build/test commands (run from `apps/storefront/`)

- Type-check: `yarn tsc --noEmit`
- Lint (3 linters, all must pass): `yarn lint`
- Test: `yarn test path/to/file.test.tsx` (single file) or `yarn test` (watch)
- Build: `yarn build` (runs `tsc --noEmit` then `vite build`)
- GraphQL regen: `yarn generate` (or `yarn generate:local`)
