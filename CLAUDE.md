# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read AGENTS.md first

[AGENTS.md](AGENTS.md) is the authoritative, hand-maintained agent guide. Read it before anything beyond trivial edits. It covers architecture philosophy, file-structure rules, testing utilities, state-management decision tree, import/alias rules, anti-patterns, and PR expectations in detail. This file intentionally does **not** repeat that content — only summarizes the delta Claude needs to start working productively.

[CONTRIBUTING.md](CONTRIBUTING.md) has commit-message format, ESLint rule disables to avoid adding to, and folder-structure expectations.

## Working directory

**All commands run from [apps/storefront/](apps/storefront/), not the repo root.** The repo is a Turborepo monorepo but currently hosts a single package; running `yarn test` or `yarn dev` from root goes through `turbo` delegation, but for anything beyond that (single-file test, `tsc --noEmit`, `yarn generate`), `cd apps/storefront` first.

## Commands (run from `apps/storefront/`)

- `yarn dev` — Vite dev server on port **3001**. Access via the BigCommerce store URL (e.g. `https://my-store.mybigcommerce.com/`), **not** `http://localhost:3001` — the buyer portal is script-injected into the storefront page; see [docs/stencil.md](docs/stencil.md) / [docs/headless.md](docs/headless.md).
- `yarn build` — runs `tsc --noEmit` then `vite build` (prebuild hook enforces types).
- `yarn tsc --noEmit` — type-check only.
- `yarn lint` — runs three linters sequentially: `lint:dependencies` (dependency-cruiser), `lint:eslint` (with `--max-warnings 0`), `lint:knip` (unused code). All must pass; use `yarn format` to auto-fix what's fixable.
- `yarn test` — Vitest watch mode. Run a single file with `yarn test path/to/file.test.tsx`. `yarn coverage` for a report.
- `yarn generate` — regenerates GraphQL types in `src/types/gql/` from the production schema (scans `src/shared/service/**/*.ts` for `gql` tagged templates). Use `yarn generate:local` when pointing at a local B2B API at `localhost:9000`. Run after editing any GraphQL document.

Node `>=22.16.0` (see `.nvmrc`), Yarn `1.22.22` (pinned via `packageManager`).

## Architecture — big picture

### What this app is

A React 18 SPA that gets **injected** into a BigCommerce storefront (Stencil or Headless/Catalyst) as a script bundle. It is not a standalone site. Entry point is [apps/storefront/src/main.ts](apps/storefront/src/main.ts), which registers a `window.b2b` global and boots the React tree either immediately (if the URL hash starts with `#/`) or lazily (via `requestIdleCallback` + click-link bindings). Routing is **hash-based** (`HashRouter`), so all buyer-portal URLs look like `https://store.com/#/orders`.

There is also a separate headless entry ([src/headless.ts](apps/storefront/src/headless.ts)) built as a distinct Rollup input — it exposes an imperative API for headless integrations rather than auto-booting.

### Two backends, two tokens

The portal talks to two GraphQL APIs:
- **B2B API** (`api-b2b.bigcommerce.com`) — authorized with `B2BToken`. This is the primary backend for companies, quotes, shopping lists, invoices, etc.
- **BigCommerce Storefront GraphQL** — authorized with `bcGraphqlToken`. Used for login, currencies, and some cart actions.

Service code lives in [src/shared/service/b2b/](apps/storefront/src/shared/service/b2b/) and [src/shared/service/bc/](apps/storefront/src/shared/service/bc/). Tokens live in Redux under `company.tokens`.

### State management is in transition

The codebase is actively migrating **away** from Redux + React Context and toward local state + URL params + `useQuery`. This shapes almost every review comment. See [AGENTS.md § Architecture Philosophy](AGENTS.md#-architecture-philosophy--patterns) for the decision tree. The practical rule: **do not add new slices, new Context providers, or new `localStorage`/`sessionStorage` state**. Existing Redux slices (`company`, `b2bFeatures`, `global`, `storeInfo`, `lang`, `quoteInfo`) remain, but new features should read Redux only at the top of a page and pass props down.

`useQuery` (`@tanstack/react-query`) is the preferred pattern for data fetching over manual `useEffect` + `setState`.

### Page layout

Pages under [src/pages/](apps/storefront/src/pages/) follow a **matroska** structure — page-specific components, hooks, and tests live inside the page folder. Tests co-locate as `index.test.tsx` / `index.mobile.test.tsx`. `src/components/` and `src/hooks/` hold **domain-agnostic** shared code only; business logic stays with its page.

Route definitions and permission gating live in [src/shared/routes/](apps/storefront/src/shared/routes/) and [src/shared/routeList.ts](apps/storefront/src/shared/routeList.ts).

### Path aliases

Configured in both [tsconfig.json](apps/storefront/tsconfig.json) and [vite.config.ts](apps/storefront/vite.config.ts):
- `@/` → `src/`
- `tests/` → `tests/`

Use these instead of relative paths across directories. Dependency-cruiser (`yarn lint:dependencies`) enforces import patterns.

## Testing stack specifics

- **Vitest + jsdom**, Testing Library, MSW for HTTP/GraphQL mocking, `vitest-when` for argument-based mocks, `@faker-js/faker` via builders.
- All test utilities re-exported from [tests/test-utils.tsx](apps/storefront/tests/test-utils.tsx) — import from there, not directly from `@testing-library/*` or `msw`.
- **Always use builders** for test data (see `buildCompanyStateWith`, `buildInvoiceWith`-style factories). Hardcoded test data is a review blocker.
- `renderWithProviders` wires Redux + Router; pass `preloadedState` and `initialEntries` to set up context.
- Global test setup is in [tests/setup-test-environment.ts](apps/storefront/tests/setup-test-environment.ts) and [tests/global-setup.ts](apps/storefront/tests/global-setup.ts). Browser API mocks (`matchMedia`, `URL.createObjectURL`) live there.
- CI test timeout is 40s (5s locally); `CIRCLECI=true` triggers CI mode.

## ESLint rules currently disabled project-wide

Legacy code violates these; **do not add new violations** (reviewers will reject):
`react/jsx-props-no-spreading`, `@typescript-eslint/no-explicit-any`, `no-console`, `react/destructuring-assignment`, `@typescript-eslint/no-shadow`, `@typescript-eslint/ban-types`, `@typescript-eslint/no-namespace`, `@typescript-eslint/no-non-null-assertion`.

Import rules that **are** enforced (ESLint will fail the build):
- `lodash-es` only (never `lodash/xyz`).
- Named imports from `@mui/icons-material`, not deep paths.
- Use `@/` / `tests/` aliases, not long relative paths.

## Commit & PR format

Commit subject: `type: TICKET-### Short description` — e.g. `fix: B2B-1234 Fix product not loading in quote table`. See [commit-validation.json](commit-validation.json) for the enforced pattern. Community contributors may substitute a GitHub issue number for the JIRA ticket.

PRs merged to `main` auto-deploy via CircleCI (see [.circleci/](.circleci/)).

<!-- claude-experience-bootstrap:start -->

## Agent Roster and File Ownership

This project has 7 role-based subagents defined in `.claude/agents/`. Each owns a specific area of the codebase. Use the `Agent` tool with `subagent_type: <role>` to dispatch focused work.

| Agent | Owns | Use for |
|---|---|---|
| `storefront-pages` | `apps/storefront/src/pages/` | Page-level features (quotes, orders, register, login, user-management, invoice, shopping-list, dashboard). Where 80% of feature work lands. |
| `storefront-shared` | `src/shared/`, `src/components/`, `src/hooks/`, `src/utils/`, `src/store/`, app-level entry files | Cross-cutting changes: routing, GraphQL service layer, domain-agnostic components/hooks, Redux slices, theming, app boot. |
| `graphql-codegen` | `src/types/gql/`, `codegen.ts`, `gql\`...\`` templates | Adding/editing GraphQL operations and regenerating types. |
| `storefront-tests` | `tests/`, `**/*.test.tsx`, `__mocks__/` | Writing tests, debugging test failures. Read-only on `src/`. |
| `reviewer` | nothing (read-only) | Code review against AGENTS.md rules and the disabled-ESLint-rule list before merge. |
| `infra` | `.circleci/`, `vite.config.ts`, `tsconfig.json`, `turbo.json`, dependency-cruiser/knip configs, `.github/`, deploy scripts | Build, CI, lint configuration, deploy pipelines, dependency bumps. |
| `docs` | `docs/`, `rfc/` | Documentation and RFC maintenance. Read-only on `AGENTS.md`/`CONTRIBUTING.md`. |

[AGENTS.md](AGENTS.md) is the source of truth for architecture, file structure, and review rules — every agent above defers to it.

## Shared Memory

This project's Claude experience uses three coordinated memory stores:

| Store | Location | Durability | Best for |
|---|---|---|---|
| Plans / specs | `docs/plans/`, `docs/superpowers/specs/` | Durable (git) | Task-scoped context |
| Cross-session decisions | squad-coordinator via `log_decision` | Live (server-local) | Queryable decisions across agents/sessions |
| Per-agent learnings | `.claude/agent-memory/<agent>/MEMORY.md` + entries | Durable (git) | Long-lived self-knowledge per role |

**The repo is the durable source of truth. The squad-coordinator is the live-coordination layer.** If the coordinator is unreachable, sessions proceed with degraded functionality (read-only on cross-session state) — repo files remain authoritative.

### Where to put new memory

- **Task-specific context** → plan doc in `docs/plans/`
- **Decision other agents must know** → `log_decision` (project: `b2b-buyer-portal`)
- **Pattern/gotcha for next time in this role** → entry under `.claude/agent-memory/<agent>/`
- When in doubt: plan > decision > memory (prefer the most durable).

## Agent Team Coordination (claude-squad)

The squad-coordinator MCP server is configured at `http://localhost:8070/` in [.mcp.json](.mcp.json). All `project` parameters in tool calls MUST use `"b2b-buyer-portal"`.

**Session protocol:**
1. **On startup:** `register_agent` (project, name, branch, task) → `get_team_status` → `get_messages` → `get_decisions(since=24h)` → read your agent-memory MEMORY.md.
2. **While working:** `log_decision` for any architectural choice; `send_message` when your work affects another agent.
3. **Before finishing:** final `log_decision`s, `update_status: done` with summary, broadcast `send_message`. If you hit a reusable gotcha, add an agent-memory entry.

## Plan Documentation

Save approved plans as `docs/plans/YYYY-MM-DD-short-description.md` (lightweight) or `docs/superpowers/specs/...` (full brainstormed specs). After writing, `log_decision(category: "plan")` with the full path in rationale so other sessions can find it via `search_decisions`.

<!-- claude-experience-bootstrap:end -->

