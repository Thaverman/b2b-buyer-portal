# Claude Experience Bootstrap Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `claude-experience-bootstrap` Superpowers-style skill at `~/.claude/skills/claude-experience-bootstrap/` that scans any codebase, detects its stack, proposes a role-based agent roster, and generates CLAUDE.md + `.claude/agents/` + `.mcp.json` + agent-memory scaffolding — wiring Superpowers plan docs and claude-squad shared memory together.

**Architecture:** User-scoped Superpowers-style skill. Three layers:
1. **`SKILL.md`** — orchestration logic Claude follows when the skill is invoked. 5-phase flow (Discover → Brainstorm → Plan → Execute → Verify).
2. **`templates/`** — markdown/json files with `{{PLACEHOLDER}}` markers. No template engine — Claude performs substitution at runtime by reading the template, replacing placeholders from detection output, and writing the result.
3. **`references/`** — static knowledge: detection signal matrix, roster presets, wiki matching rules. Referenced from SKILL.md during orchestration.

**Tech Stack:** Markdown (skill files, templates), YAML frontmatter (skill + agent files), JSON (`.mcp.json`, `.claude/settings.json`), Mustache-style `{{PLACEHOLDER}}` markers (no runtime — LLM substitution).

**Spec:** `docs/superpowers/specs/2026-04-22-claude-experience-bootstrap-skill-design.md` (commit `b479de2`).

**IMPORTANT — where files land:** Tasks in this plan write to `~/.claude/skills/claude-experience-bootstrap/` (user home), NOT into this repo. Git commits in this plan's tasks happen in whatever git repo covers the user's `~/.claude/` directory (typically a dotfiles repo). If `~/.claude/` is not a git repo, skip the `git commit` step and tell the user to commit through their normal mechanism.

---

## File Structure

Twenty files total, grouped by purpose:

### Orchestration (1 file)
- `~/.claude/skills/claude-experience-bootstrap/SKILL.md` — 5-phase flow, frontmatter trigger, decision points, hooks into references and templates. ~300-500 lines.

### Reference docs (3 files)
Static knowledge that SKILL.md consults during orchestration.
- `references/project-type-detection.md` — Signal matrix, stack profile shape, detection-confidence rules.
- `references/roster-presets.md` — Preset rosters per detected stack + archetype compose rules.
- `references/wiki-integration.md` — Wiki scanning procedure, keyword-matching rules per detected stack, portability (env var) handling.

### Output templates (5 files)
Placeholder markup for the six generated artifact types in the target repo.
- `templates/CLAUDE.md.tmpl` — Master CLAUDE.md with 8 major sections.
- `templates/mcp.json.tmpl` — `.mcp.json` with squad-coordinator (always) + seq (conditional).
- `templates/settings.json.tmpl` — `.claude/settings.json` near-empty scaffold.
- `templates/agent-memory-index.tmpl` — Per-agent `MEMORY.md` header.
- `templates/plan-doc.tmpl` — `docs/superpowers/specs/YYYY-MM-DD-claude-setup.md` audit-trail plan.

### Agent templates (11 files)
One per archetype. `_base-agent.md.tmpl` is a fragment composed into every concrete archetype template.
- `templates/agents/_base-agent.md.tmpl` — Shared fragments: frontmatter skeleton, Squad Coordination section, Shared Memory section, Wiki References section.
- `templates/agents/reviewer.md.tmpl`, `test.md.tmpl` — Universal archetypes (always present).
- `templates/agents/backend.md.tmpl`, `frontend.md.tmpl`, `infra.md.tmpl` — Main role archetypes.
- `templates/agents/package.md.tmpl` — Parameterized per-package owner for monorepos.
- `templates/agents/docs.md.tmpl`, `data.md.tmpl` — Domain-specific archetypes.
- `templates/agents/security.md.tmpl`, `design-system.md.tmpl` — Opt-in archetypes.

### Placeholder conventions

All templates use the same convention. Placeholders are `{{UPPER_SNAKE_CASE}}`. Conditional sections use `{{#CONDITION}}...{{/CONDITION}}` blocks — SKILL.md explicitly instructs Claude: "If `CONDITION` is false, delete everything between `{{#CONDITION}}` and `{{/CONDITION}}` including the markers." List sections use `{{#LIST_NAME}}...{{/LIST_NAME}}` with `{{item}}` inside.

Canonical placeholder names (defined once here, used across all template tasks):

| Placeholder | Value source |
|---|---|
| `{{PROJECT_NAME}}` | Derived from git remote URL (last path segment) or `basename $(pwd)` |
| `{{PROJECT_DESCRIPTION}}` | One-line summary from detection |
| `{{BUILD_COMMANDS}}` | From detection: `yarn build` / `dotnet build` / `pytest` / etc. |
| `{{TEST_COMMANDS}}` | From detection |
| `{{ARCHITECTURE_OVERVIEW}}` | 2-4 paragraph overview Claude writes from detection |
| `{{AGENT_ROSTER_TABLE}}` | Markdown table of roster + owned paths |
| `{{STACK_PROFILE}}` | JSON-ish summary of detection output |
| `{{SQUAD_COORDINATOR_URL}}` | `$CLAUDE_SQUAD_COORDINATOR_URL` or `http://localhost:8070/` |
| `{{WIKI_ROOT}}` | `$CLAUDE_WIKI_ROOT` or `C:\Users\thaverman\Documents\Obsidian\Programing\wiki\` |
| `{{WIKI_ENABLED}}` | Bool; gates the External Knowledge Base section |
| `{{WIKI_LINKS_CLAUDE}}` | Deduplicated, grouped wikilinks for CLAUDE.md |
| `{{AGENT_NAME}}`, `{{AGENT_DESCRIPTION}}`, `{{AGENT_TOOLS}}`, `{{AGENT_MODEL}}`, `{{AGENT_PERMISSION_MODE}}` | Per-agent frontmatter |
| `{{OWNED_PATHS}}` | Paths the agent owns (bulleted list) |
| `{{FORBIDDEN_PATHS}}` | Paths the agent must NOT touch (bulleted list) |
| `{{ARCHITECTURE_RULES}}` | Agent-specific numbered rules from detection |
| `{{KEY_PATTERNS}}` | Agent-specific bullet list of patterns in the codebase |
| `{{WIKI_LINKS_AGENT}}` | 5-10 wikilinks scoped to this agent's concerns |
| `{{BUILD_COMMANDS_AGENT}}` | "When you finish" verification commands for this agent |
| `{{SEQ_DETECTED}}` | Bool; gates the seq MCP entry |

SKILL.md Phase 4 (Execute) spells out the substitution procedure using this exact table.

---

## Task 1: Scaffold the skill directory and SKILL.md frontmatter

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/` (directory)
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/` (directory)
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/` (directory)
- Create: `~/.claude/skills/claude-experience-bootstrap/references/` (directory)
- Create: `~/.claude/skills/claude-experience-bootstrap/SKILL.md` (frontmatter + stub body)

- [ ] **Step 1: Create directory tree**

Run:
```bash
mkdir -p ~/.claude/skills/claude-experience-bootstrap/templates/agents
mkdir -p ~/.claude/skills/claude-experience-bootstrap/references
```

- [ ] **Step 2: Write SKILL.md frontmatter + stub**

Write `~/.claude/skills/claude-experience-bootstrap/SKILL.md`:

````markdown
---
name: claude-experience-bootstrap
description: Use when setting up Claude Code in a new codebase — scans the repo, detects project type, proposes a role-based agent roster, and generates CLAUDE.md, .claude/agents/, .mcp.json, and agent-memory scaffolding. Wires Superpowers plan docs and claude-squad shared memory together. Triggered by phrases like "set up claude here", "bootstrap claude", "initialize claude experience", or when invoked in a repo with no existing CLAUDE.md.
---

# Claude Experience Bootstrap

Bootstrap a Claude Code experience in the current repository. The skill detects the project's stack, proposes a role-based agent roster, writes a plan for approval, then generates CLAUDE.md, role-based subagents, MCP wiring, and per-agent memory scaffolding. Superpowers plan docs and claude-squad shared memory are wired together so future sessions carry context forward.

## Announce at start

Say to the user: "I'm using the claude-experience-bootstrap skill to set up Claude Code here. Starting discovery."

## Execution flow (5 phases)

See sections below:
- **Phase 1 — Discover** (silent discovery, reference `references/project-type-detection.md`)
- **Phase 2 — Brainstorm** (3-4 questions, one per turn)
- **Phase 3 — Plan** (write and auto-commit the setup plan)
- **Phase 4 — Execute** (render templates)
- **Phase 5 — Verify and register** (build check + squad-coordinator registration)

(Phases to be filled in by subsequent tasks.)
````

- [ ] **Step 3: Verify the directory tree and stub file exist**

Run:
```bash
ls -la ~/.claude/skills/claude-experience-bootstrap/
ls -la ~/.claude/skills/claude-experience-bootstrap/templates/
ls -la ~/.claude/skills/claude-experience-bootstrap/templates/agents/
ls -la ~/.claude/skills/claude-experience-bootstrap/references/
cat ~/.claude/skills/claude-experience-bootstrap/SKILL.md | head -5
```

Expected: directories exist; SKILL.md starts with `---\nname: claude-experience-bootstrap`.

- [ ] **Step 4: Commit (if `~/.claude/` is a git repo)**

```bash
cd ~/.claude && git status -s skills/claude-experience-bootstrap/ && \
  git add skills/claude-experience-bootstrap/ && \
  git commit -m "feat(skill): scaffold claude-experience-bootstrap"
```

If `~/.claude/` is not a git repo, skip and tell the user.

---

## Task 2: Write `references/project-type-detection.md`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/references/project-type-detection.md`

- [ ] **Step 1: Write the reference doc**

Content (full file):

````markdown
# Project-type detection

Emit a **stack profile** from the repo's top-level manifest files, directory structure, and recent git log. This profile drives roster proposal, build commands, wiki matching, and conditional MCP entries.

## Stack profile shape

```typescript
{
  primary_language: string,            // "C#", "TypeScript", "Python", "Rust", "Go", "unknown"
  project_shape: "microservices" | "monorepo" | "single-service" | "library" | "frontend-spa" | "infra" | "unclear",
  frameworks: string[],                // e.g. ["ASP.NET Core", "EF Core"] or ["React", "Vite"]
  build_tool: string,                  // e.g. "dotnet", "yarn + turbo", "pnpm", "cargo"
  test_tool: string,                   // e.g. "xunit", "vitest", "pytest"
  has_docker: boolean,
  has_monorepo_workspace: boolean,
  active_dirs: string[],               // top dirs with commits in last 30 days
  existing_ai_setup: string[]          // which of CLAUDE.md, AGENTS.md, .cursorrules, etc. exist
}
```

## Detection procedure

1. Read the root directory listing.
2. Read any of: `*.sln`, `package.json`, `pyproject.toml`, `setup.py`, `requirements.txt`, `Cargo.toml`, `go.mod`, `go.work`, `turbo.json`, `nx.json`, `pnpm-workspace.yaml`, `compose.yaml`, `Dockerfile`.
3. Read the first 200 lines of the root `README.md` for declared purpose.
4. Run `git log --since="30 days ago" --name-only --pretty=format:` and count top-level directory hits → `active_dirs`.
5. Check for existing AI setup files: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`.

## Signal matrix (ordered; first match wins unless polyglot detected)

| Signal | Implies `project_shape` | Notes |
|---|---|---|
| `*.sln` + ≥2 `*.csproj` + `compose.yaml` | `microservices` | .NET; build: `dotnet build <sln>` |
| `*.sln` + 1 `*.csproj` | `single-service` or `library` (per csproj OutputType) | .NET |
| `turbo.json` \| `nx.json` \| `pnpm-workspace.yaml` \| `package.json:workspaces` | `monorepo` | JS/TS; build: resolve from turbo/nx config |
| `package.json` w/ `"react"` \| `"vue"` \| `"svelte"` \| `"vite"` in deps | `frontend-spa` | JS/TS; build: `yarn build` or `npm run build` |
| `package.json` w/ `"express"` \| `"fastify"` \| `"nestjs"` \| `"hono"` in deps | `single-service` | JS/TS backend |
| `pyproject.toml` (`[tool.poetry]` or `[project]` in pyproject) | `single-service` \| `library` | Sub-detect FastAPI/Django from dependencies |
| `Cargo.toml` with `[workspace]` | `monorepo` | Rust; build: `cargo build --workspace` |
| `Cargo.toml` single crate | `single-service` \| `library` | `[[bin]]` vs `[lib]` |
| `go.mod` + `go.work` | `monorepo` | Go multi-module |
| `go.mod` only | `single-service` \| `library` | |
| Primarily `Dockerfile`/`compose.yaml`, no app-level manifest | `infra` | Infra repo — roster: `infra`, `test`, `reviewer` |
| Multiple strong signals above | `unclear` (polyglot) | Report all; ask user |

## Confidence rules

- **High confidence:** single strong signal + manifest validates (`*.sln` parses, `package.json` has expected shape).
- **Medium confidence:** strong signal but ambiguous sub-type (e.g., `package.json` but neither frontend nor backend deps dominate).
- **Low confidence:** no strong signal, or ≥3 signals that imply different shapes.

On medium confidence, ask the user to confirm. On low confidence, show all findings and ask.

## Framework sub-detection

After `project_shape` is set, infer frameworks from dependency manifests:
- `.NET`: check `.csproj` PackageReferences for `Microsoft.AspNetCore.*`, `Microsoft.EntityFrameworkCore`, `Serilog`, `MongoDB.Driver`, `OpenTelemetry.*`, `Polly`, `Quartz`.
- `JS/TS`: check `package.json` dependencies + devDependencies for `react`, `vue`, `svelte`, `vite`, `next`, `astro`, `express`, `fastify`, `nestjs`, `hono`, `graphql`, `@bigcommerce/*`, `vitest`, `jest`, `playwright`.
- `Python`: check for `fastapi`, `django`, `flask`, `pydantic`, `sqlalchemy`, `alembic`, `pandas`, `numpy`, `torch`, `tensorflow`.
- `Rust`: check `Cargo.toml` dependencies for `tokio`, `actix-web`, `axum`, `rocket`, `serde`.
- `Go`: check `go.mod` for `gin-gonic`, `echo`, `fiber`, `gorm`.

Store the detected frameworks in `stack_profile.frameworks`. These drive wiki matching (see `wiki-integration.md`) and agent architecture rules.

## Active-dirs computation

```bash
git log --since="30 days ago" --name-only --pretty=format: | \
  awk -F/ '{print $1}' | sort | uniq -c | sort -rn | head -10
```

Top directories by commit count over the last 30 days are the "hot" areas. These inform roster proposal — e.g., if `apps/storefront` has 80% of recent commits, propose a dedicated `storefront` agent.

## What drives roster

`project_shape` + `frameworks` + `active_dirs` + `existing_ai_setup` → roster proposal (see `roster-presets.md`).
````

- [ ] **Step 2: Verify the file was written correctly**

Run:
```bash
wc -l ~/.claude/skills/claude-experience-bootstrap/references/project-type-detection.md
head -20 ~/.claude/skills/claude-experience-bootstrap/references/project-type-detection.md
```

Expected: ~100+ lines; head shows "# Project-type detection".

- [ ] **Step 3: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/references/project-type-detection.md && \
  git commit -m "feat(skill): add project-type detection reference"
```

---

## Task 3: Write `references/roster-presets.md`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/references/roster-presets.md`

- [ ] **Step 1: Write the reference doc**

Content (full file):

````markdown
# Roster presets and archetype composition

Rosters are composed from archetypes (`templates/agents/*.md.tmpl`). Each archetype maps to one template file. A roster is a list of archetype invocations, each with a name and substituted values.

## Archetype catalog

| Archetype | Template | Purpose | When proposed |
|---|---|---|---|
| `backend` | `backend.md.tmpl` | API, services, business logic | `single-service` (backend deps) or per-service in `microservices` |
| `frontend` | `frontend.md.tmpl` | UI, components, routing | `frontend-spa` or per-app in a JS/TS `monorepo` |
| `infra` | `infra.md.tmpl` | Docker, CI, build tooling, observability | Always, except pure library repos |
| `test` | `test.md.tmpl` | All test code | Always |
| `reviewer` | `reviewer.md.tmpl` | Read-only quality gate | Always |
| `package-owner` | `package.md.tmpl` | Specific package/app in a monorepo | Per package in `monorepo` shape |
| `docs` | `docs.md.tmpl` | `/docs`, `/rfc`, README files | When `docs/` or `rfc/` exist as substantial dirs |
| `data` | `data.md.tmpl` | Migrations, schema, ML pipelines | When Alembic / EF Migrations / data/ML dirs detected |
| `security` | `security.md.tmpl` | Auth, secrets, security-sensitive paths | Opt-in: only if auth modules detected or user requests |
| `design-system` | `design-system.md.tmpl` | Shared UI kit, theming, component library | Opt-in: only if `packages/ui` / `design-system` dir detected or user requests |

## Preset compositions per detected shape

| Shape + signals | Proposed roster |
|---|---|
| `.NET microservices` (from `*.sln` + multiple `*.csproj`) | One `backend` per service project (named after the service), `infra`, `test`, `reviewer` |
| `.NET single-service` | `backend`, `infra`, `test`, `reviewer` |
| `JS/TS monorepo` | One `package-owner` per app/package in `apps/*` or `packages/*`, `infra`, `docs` (if `/docs` or `/rfc` present), `test`, `reviewer` |
| `JS/TS frontend-spa` | `frontend`, `infra`, `test`, `reviewer` |
| `JS/TS single-service` (backend) | `backend`, `infra`, `test`, `reviewer` |
| `Python single-service` (FastAPI/Django) | `backend`, `infra`, `test`, `reviewer`; add `data` if `alembic/` or `migrations/` dir exists |
| `Python library` | `backend` (renamed `library` if user prefers), `test`, `reviewer` |
| `Rust/Go workspace` (`monorepo` shape) | One `package-owner` per workspace member, `infra`, `test`, `reviewer` |
| `Infra-first` | `infra`, `test`, `reviewer` |
| `Unclear / polyglot` | Ask user to pick; fall back to generic `implementation`, `infra`, `test`, `reviewer` |

## Cap warning

No hard cap. If proposed roster exceeds **8 agents**, warn the user: "This roster has N agents. Team coordination gets harder beyond ~8 — consider grouping related services under one agent, or accept the size if each truly needs isolation." Do not block.

## Roster adjustment prompts

During Phase 2, the skill shows the proposed roster and asks:

> "Does this roster work, or should I adjust? You can say: swap X for Y, drop X, merge X and Y, rename X to Y, add [archetype], or 'looks good'."

Parse the user's reply and produce a **final roster** before proceeding.

## `security` and `design-system` auto-detection

Only propose `security` if any of: `**/auth/**`, `**/security/**`, `**/identity/**`, or dependencies like `passport`, `jsonwebtoken`, `bcrypt`, `IdentityServer*`, `authlib`, `pyjwt` are present.

Only propose `design-system` if any of: `packages/ui`, `packages/design-system`, `apps/ui`, or `storybook` / `@storybook/*` / `bit-*` dependencies are present.

Otherwise do not include them in the preset. The user can still add them explicitly.

## File-ownership derivation

For each archetype in the final roster, derive owned paths from the repo structure and `active_dirs`. Examples:

- `backend` for service `ProductServices` → owns `ProductServices/`.
- `package-owner` named `storefront` in a Turborepo → owns `apps/storefront/`.
- `infra` → owns `compose.yaml`, `Dockerfile*`, `turbo.json`, `.github/workflows/`, deployment scripts (`Publish*.ps1`, etc.).
- `test` → owns all `*Tests/`, `__tests__/`, `*.test.ts`, `tests/` directories (language-appropriate).
- `docs` → owns `docs/`, `rfc/`, and root-level `README.md` / `AGENTS.md` / `CONTRIBUTING.md` **for reading only**; never modifies existing docs unless asked.

Forbidden-paths derivation: for each agent, everything NOT in its owned paths, grouped by the most relevant sibling agents.
````

- [ ] **Step 2: Verify the file was written correctly**

Run:
```bash
wc -l ~/.claude/skills/claude-experience-bootstrap/references/roster-presets.md
grep -c "^##" ~/.claude/skills/claude-experience-bootstrap/references/roster-presets.md
```

Expected: ~100+ lines; grep count shows 6+ `##` headers.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/references/roster-presets.md && \
  git commit -m "feat(skill): add roster presets reference"
```

---

## Task 4: Write `references/wiki-integration.md`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/references/wiki-integration.md`

- [ ] **Step 1: Write the reference doc**

Content (full file):

````markdown
# Wiki integration

The skill optionally integrates with an Obsidian vault of reference notes. When present, it scans the vault index, matches entries to the detected stack, and inserts curated wikilinks into the generated CLAUDE.md and agent files.

## Wiki path resolution (portability)

Resolve `{{WIKI_ROOT}}` in this order:
1. **Environment variable** — `CLAUDE_WIKI_ROOT`. Accept Windows (`%CLAUDE_WIKI_ROOT%`) and POSIX (`$CLAUDE_WIKI_ROOT`) forms.
2. **Literal fallback** — `C:\Users\thaverman\Documents\Obsidian\Programing\wiki\` (the author's default; works on their primary machine).
3. **Not found** — During Phase 2, ask the user: "Wiki not found at default paths. Skip wiki integration, or provide a path?"

Store the result as `{{WIKI_ROOT}}`. If skipped, set `{{WIKI_ENABLED}}` to false; the CLAUDE.md and agent-file "External Knowledge Base" / "Wiki References" sections are omitted.

## Index parsing

Read `{{WIKI_ROOT}}/index.md`. Parse three sections:
- `## Sources` — each line is `- [[entry-name]] — description (YYYY-MM-DD)`.
- `## Entities` — each line is `- [[entry-name]] — description (N sources)`.
- `## Concepts` — each line is `- [[entry-name]] — description`.

Extract into an in-memory list:
```typescript
{ name: string, description: string, section: "sources" | "entities" | "concepts" }[]
```

## Matching rules (keyword-based, no LLM call)

For each detected framework or stack signal, match entries by name prefix. Order rules top-to-bottom; the first matching rule collects entries for that category. An entry can appear in multiple categories — dedupe before writing.

| Detected signal | Matching prefixes |
|---|---|
| BigCommerce (dependency `@bigcommerce/*`, or `.cs` code references `BigCommerce`) | `bigcommerce-` |
| BigCommerce Stencil theme (file patterns `stencil-cli`, `.html` with Handlebars) | `bigcommerce-stencil-`, `bigcommerce-handlebars-` |
| GraphQL (schema file, `graphql-tools`, `@apollo/*`, StrawberryShake) | `bigcommerce-graphql-storefront-*` if BC+GraphQL both present |
| OrderGroove (any reference to `ordergroove`, `recharge`) | `ordergroove-` |
| SearchSpring (any reference to `searchspring`) | `searchspring-` |
| LiveChat (`livechat` widget) | `livechat-` |
| Serilog (dep `Serilog.*`) | `serilog-`, `datalust-superpower` |
| Seq (ref `seq`, `GetSeqApiKey`, OpenTelemetry export to Seq) | `seq-` |
| schema.org JSON-LD (pages with `application/ld+json`, `SEO`-related code) | `schemaorg-` |
| SSW-specific (repo name or README mentions "SSW", "StoreSupply", "LoveGroomers") | `ssw-*`, `love-groomers-*`, `groomer-essentials-*`, `store-supply-warehouse` (from Entities) |

## Per-agent scoping

For each agent in the final roster, collect a 5-10 link subset most relevant to that agent's ownership. Examples:

| Agent | Scope |
|---|---|
| `frontend` (BC Stencil theme) | `bigcommerce-stencil-*`, `bigcommerce-handlebars-*`, `livechat-widget-js-api`, `schemaorg-product-type`, `ssw-gtm-ga4-implementation-guide` |
| `backend` (BigCommerce REST integration) | `bigcommerce-about-apis`, `bigcommerce-authentication`, `bigcommerce-rest-catalog-products`, `bigcommerce-rest-product-variants`, `bigcommerce-rest-product-metafields` |
| `backend` (Serilog + Seq observability) | `serilog-configuration-basics`, `serilog-writing-log-events`, `seq-search-and-analyze`, `seq-query-syntax`, `seq-tracing` |
| `backend` (OrderGroove subscriptions) | `ordergroove-api-overview`, `ordergroove-data-model`, `ordergroove-subscriptions-api`, `ordergroove-webhooks-reference`, `ordergroove-rest-api-webhook-order-events` |
| `package-owner` (graphql-schema in monorepo) | `bigcommerce-graphql-storefront-explorer`, `bigcommerce-graphql-storefront-auth` |
| `infra` | Observability-related: `seq-overview`, `seq-getting-traces`, `serilog-provided-sinks` |
| `reviewer` | Architectural references: `bigcommerce-about-apis`, `schemaorg-style-guide` |
| `test` | Usually no wiki links (no strong match). If empty, omit the Wiki References section. |

Rank candidates by: (1) name prefix match strength, (2) presence in the agent's active files (search the agent's owned paths for matching keywords), (3) alphabetical. Take top 5-10. If fewer than 2 candidates, omit the Wiki References section for that agent.

## What goes into CLAUDE.md

The "External Knowledge Base" section in CLAUDE.md lists **all** matched entries, grouped by platform (e.g., "BigCommerce APIs", "OrderGroove", "schema.org"). Each group shows ~5-10 most relevant entries with a truncation note if more exist.

Example rendered output for a BC B2B portal:

```markdown
## External Knowledge Base

Reference vault: `$CLAUDE_WIKI_ROOT` (default: `C:\Users\thaverman\Documents\Obsidian\Programing\wiki\`)
Index: `<WIKI_ROOT>/index.md`

Consult before implementing features involving these platforms. Entries use Obsidian wikilink format `[[entry-name]]` — resolve by reading `<WIKI_ROOT>/sources/<entry-name>.md` (or `concepts/`, `entities/`).

Relevant for this project:
- **BigCommerce** — [[bigcommerce-about-apis]], [[bigcommerce-authentication]], [[bigcommerce-rest-catalog-products]], [[bigcommerce-graphql-storefront-explorer]], [[bigcommerce-graphql-storefront-auth]] (and 10 more — see index)
- **OrderGroove** — [[ordergroove-api-overview]], [[ordergroove-data-model]], [[ordergroove-subscriptions-api]]
- **schema.org** — [[schemaorg-product-type]], [[schemaorg-aggregate-rating]], [[schemaorg-offer]]
- **SearchSpring** — [[searchspring-general-info]], [[searchspring-personalization]], [[searchspring-campaigns]]
```

## Agent-file wiki section template

```markdown
## Wiki References

When working on features touching these topics, consult the reference vault:

- [[entry-1]] — short description
- [[entry-2]] — short description
...
```

If no matches for an agent, omit the section entirely.
````

- [ ] **Step 2: Verify the file was written correctly**

Run:
```bash
wc -l ~/.claude/skills/claude-experience-bootstrap/references/wiki-integration.md
grep -c "^##" ~/.claude/skills/claude-experience-bootstrap/references/wiki-integration.md
```

Expected: ~120+ lines; 7+ `##` headers.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/references/wiki-integration.md && \
  git commit -m "feat(skill): add wiki integration reference"
```

---

## Task 5: Write `templates/CLAUDE.md.tmpl`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/CLAUDE.md.tmpl`

- [ ] **Step 1: Write the template**

Content (full file) — all `{{PLACEHOLDER}}` markers are substituted at runtime; `{{#FLAG}}...{{/FLAG}}` blocks are deleted entirely when the flag is false; `{{#LIST}}...{{/LIST}}` blocks are repeated for each list item with `{{item}}` inside.

````markdown
<!-- claude-experience-bootstrap:start -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

{{BUILD_COMMANDS}}

## Architecture Overview

{{ARCHITECTURE_OVERVIEW}}

## Agent Roster and File Ownership

{{AGENT_ROSTER_TABLE}}

## Shared Memory

This project's Claude experience uses three coordinated memory stores:

| Store | Location | Durability | Best for |
|---|---|---|---|
| Plans / specs | `docs/superpowers/specs/`, `docs/plans/` | Durable (git) | Task-scoped context |
| Cross-session decisions | squad-coordinator via `log_decision` | Live (server-local) | Queryable decisions across agents and sessions |
| Per-agent learnings | `.claude/agent-memory/<agent>/MEMORY.md` + entries | Durable (git) | Long-lived self-knowledge per role |

**The repo is the durable source of truth. The squad-coordinator is the live-coordination layer.** If the coordinator is unreachable, sessions proceed with degraded functionality (read-only on cross-session state); nothing needs re-syncing when it returns — repo files are authoritative.

### Where to put new memory

- **Task-specific context** → plan doc in `docs/superpowers/specs/`
- **Decision other agents must know** → `log_decision`
- **Pattern/gotcha for next time in this role** → agent MEMORY.md entry (index + separate entry file; see existing agent-memory/)
- When in doubt: plan > decision > memory (prefer the most durable).

### Cross-linking rules

- Plan docs include a `## Decisions logged` section listing `log_decision` IDs produced during authoring.
- `log_decision(category: "plan")` rationale always contains the full plan-file path.
- Agent MEMORY.md entries that reference a specific plan link to it by path.

One `search_decisions` call finds both decisions and (via rationale paths) the plans that produced them.

{{#WIKI_ENABLED}}
## External Knowledge Base

Reference vault: `{{WIKI_ROOT}}`
Index: `{{WIKI_ROOT}}/index.md`

Consult before implementing features involving the platforms below. Entries use Obsidian wikilink format `[[entry-name]]` — resolve by reading `{{WIKI_ROOT}}/sources/<entry-name>.md` (or `concepts/`, `entities/`).

Relevant for this project:
{{WIKI_LINKS_CLAUDE}}
{{/WIKI_ENABLED}}

## Agent Team Coordination (claude-squad)

This project uses claude-squad for multi-agent coordination. Each session runs as an independent Claude Code process in its own git worktree. Sessions are started with `claude --agent <role>` and coordinate via the squad-coordinator MCP server.

### MCP Server Connection

The squad-coordinator MCP server runs at `{{SQUAD_COORDINATOR_URL}}` using the **http** transport (streamable-http). It is configured in `.mcp.json` at the repo root — Claude Code auto-discovers it on startup.

**Project identifier:** All tool calls that accept a `project` parameter MUST use `"{{PROJECT_NAME}}"` as the project name. This scopes agents, messages, and decisions to this codebase.

### Squad Coordination Protocol

**On startup:**
1. Determine your agent name from your git branch: `git branch --show-current`.
2. Call `register_agent` with `project: "{{PROJECT_NAME}}"`, your name, branch, and task description.
3. Call `get_team_status` with `project: "{{PROJECT_NAME}}"` to see what other agents are working on.
4. Call `get_messages` to check for messages from other agents.
5. Call `get_decisions` with `project: "{{PROJECT_NAME}}"` and `since=(24 hours ago)` to catch up on recent team decisions.
6. Read your `.claude/agent-memory/<your-agent>/MEMORY.md` for long-lived learnings.

**While working:**
- Call `log_decision` (with `project: "{{PROJECT_NAME}}"`) when you choose a library, pattern, API shape, naming convention, or make any architectural choice.
- Call `send_message` (with `project: "{{PROJECT_NAME}}"`) when your work affects another agent.
- Periodically call `get_messages` to check for incoming messages.
- If blocked, call `send_message` and `update_status` with status `"blocked"`.

**Before finishing:**
1. Log any final decisions via `log_decision`.
2. Call `update_status` with status `"done"` and a summary.
3. Send a broadcast message summarizing what you accomplished.
4. If you produced a reusable pattern or hit a gotcha, add an entry to your agent's MEMORY.md (see existing `.claude/agent-memory/<agent>/` for the index + entry-file pattern).

## Plan Documentation

When a session produces a plan and it is approved, save the plan as a markdown file in `docs/plans/` (for lightweight plans) or `docs/superpowers/specs/` (for full brainstormed specs). Use the naming format `YYYY-MM-DD-short-description.md`. Log the plan via `log_decision` for cross-session visibility.

Include:
- The plan title and date
- Which agents are involved and their assigned tasks
- The interface contracts agreed upon
- Any architecture decisions made and their rationale
- Mermaid diagrams where they clarify the design

## Diagrams

Use Mermaid.js for all diagrams. Prefer: sequence diagrams for API flows, flowcharts for decision logic, ER diagrams for data relationships, C4/architecture diagrams for system overviews.

<!-- claude-experience-bootstrap:end -->
````

- [ ] **Step 2: Verify placeholders and conditional blocks**

Run:
```bash
grep -o '{{[^}]*}}' ~/.claude/skills/claude-experience-bootstrap/templates/CLAUDE.md.tmpl | sort -u
```

Expected output (exact set):
```
{{#WIKI_ENABLED}}
{{/WIKI_ENABLED}}
{{AGENT_ROSTER_TABLE}}
{{ARCHITECTURE_OVERVIEW}}
{{BUILD_COMMANDS}}
{{PROJECT_NAME}}
{{SQUAD_COORDINATOR_URL}}
{{WIKI_LINKS_CLAUDE}}
{{WIKI_ROOT}}
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/templates/CLAUDE.md.tmpl && \
  git commit -m "feat(skill): add CLAUDE.md template"
```

---

## Task 6: Write `templates/mcp.json.tmpl` and `templates/settings.json.tmpl`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/mcp.json.tmpl`
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/settings.json.tmpl`

- [ ] **Step 1: Write `mcp.json.tmpl`**

Content (full file):

````json
{
  "mcpServers": {
    "squad-coordinator": {
      "type": "http",
      "url": "{{SQUAD_COORDINATOR_URL}}"
    }{{#SEQ_DETECTED}},
    "seq": {
      "command": "npx",
      "args": ["-y", "mcp-seq"],
      "env": {
        "SEQ_BASE_URL": "{{SEQ_BASE_URL}}",
        "SEQ_API_KEY": "{{SEQ_API_KEY}}"
      }
    }{{/SEQ_DETECTED}}
  }
}
````

Note the trailing comma is INSIDE the conditional block — when `SEQ_DETECTED` is false, the comma is removed with the block, leaving valid JSON with only `squad-coordinator`.

- [ ] **Step 2: Write `settings.json.tmpl`**

Content (full file):

````json
{
  "permissions": {
    "allow": []
  }
}
````

Intentionally minimal. The generated CLAUDE.md tells the user to run `fewer-permission-prompts` periodically to build the allow list from real use.

- [ ] **Step 3: Verify both files are valid JSON after mental substitution**

Run:
```bash
# With SEQ detected (comma present):
sed 's|{{SQUAD_COORDINATOR_URL}}|http://localhost:8070/|; s|{{#SEQ_DETECTED}}||; s|{{/SEQ_DETECTED}}||; s|{{SEQ_BASE_URL}}|http://localhost:5341|; s|{{SEQ_API_KEY}}|test|' \
  ~/.claude/skills/claude-experience-bootstrap/templates/mcp.json.tmpl | python -m json.tool

# Without SEQ (block removed):
python -c 'import re, json; s=open("$HOME/.claude/skills/claude-experience-bootstrap/templates/mcp.json.tmpl").read(); s=re.sub(r"\{\{#SEQ_DETECTED\}\}.*?\{\{/SEQ_DETECTED\}\}", "", s, flags=re.DOTALL); s=s.replace("{{SQUAD_COORDINATOR_URL}}", "http://localhost:8070/"); print(json.dumps(json.loads(s), indent=2))'

python -m json.tool < ~/.claude/skills/claude-experience-bootstrap/templates/settings.json.tmpl
```

Expected: all three produce valid JSON with no parse errors.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/templates/mcp.json.tmpl \
  skills/claude-experience-bootstrap/templates/settings.json.tmpl && \
  git commit -m "feat(skill): add mcp.json and settings.json templates"
```

---

## Task 7: Write `templates/agent-memory-index.tmpl` and `templates/plan-doc.tmpl`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agent-memory-index.tmpl`
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/plan-doc.tmpl`

- [ ] **Step 1: Write `agent-memory-index.tmpl`**

Content (full file):

````markdown
# {{AGENT_NAME_TITLE}} Memory

Cross-session learnings for the `{{AGENT_NAME}}` role. Add entries as you discover patterns, gotchas, or workflows worth preserving.

## Entries
*None yet.*
````

`{{AGENT_NAME_TITLE}}` is the title-cased version of `{{AGENT_NAME}}` (e.g., `products` → `Products`).

- [ ] **Step 2: Write `plan-doc.tmpl`**

Content (full file):

````markdown
# Claude Experience Bootstrap — Setup Plan for `{{PROJECT_NAME}}`

**Date:** {{TODAY_DATE}}
**Status:** Awaiting user approval (reply `proceed` to execute)

## Detected project type

- **Primary language:** {{PRIMARY_LANGUAGE}}
- **Project shape:** {{PROJECT_SHAPE}}
- **Frameworks:** {{FRAMEWORKS_LIST}}
- **Build tool:** {{BUILD_TOOL}}
- **Test tool:** {{TEST_TOOL}}
- **Has Docker:** {{HAS_DOCKER}}
- **Has monorepo workspace:** {{HAS_MONOREPO_WORKSPACE}}
- **Active directories (last 30 days):** {{ACTIVE_DIRS}}
- **Existing AI setup files:** {{EXISTING_AI_SETUP}}

## Confirmed agent roster

{{ROSTER_TABLE}}

## Wiki integration

- **Enabled:** {{WIKI_ENABLED}}
- **Path:** `{{WIKI_ROOT}}`
- **Resolution:** {{WIKI_RESOLUTION_METHOD}}  <!-- env var / literal / user-provided / skipped -->
- **Entries relevant to this project:** {{WIKI_MATCH_COUNT}}

## Squad-coordinator

- **URL:** `{{SQUAD_COORDINATOR_URL}}`
- **Reachable:** {{SQUAD_REACHABLE}}
- **Project name to register:** `{{PROJECT_NAME}}`

## Existing-file policy

{{FILE_POLICY_TABLE}}

## Files to be created or modified

{{FILE_LIST}}

## Build/test commands

{{BUILD_COMMANDS}}

---

*Reply `proceed` to execute Phase 4.*

<!-- Phase 5 appends the Execution log below -->
````

- [ ] **Step 3: Verify placeholders**

Run:
```bash
grep -o '{{[^}]*}}' ~/.claude/skills/claude-experience-bootstrap/templates/plan-doc.tmpl | sort -u
grep -o '{{[^}]*}}' ~/.claude/skills/claude-experience-bootstrap/templates/agent-memory-index.tmpl | sort -u
```

Expected: plan-doc placeholders include PROJECT_NAME, TODAY_DATE, PRIMARY_LANGUAGE, PROJECT_SHAPE, FRAMEWORKS_LIST, BUILD_TOOL, TEST_TOOL, HAS_DOCKER, HAS_MONOREPO_WORKSPACE, ACTIVE_DIRS, EXISTING_AI_SETUP, ROSTER_TABLE, WIKI_ENABLED, WIKI_ROOT, WIKI_RESOLUTION_METHOD, WIKI_MATCH_COUNT, SQUAD_COORDINATOR_URL, SQUAD_REACHABLE, FILE_POLICY_TABLE, FILE_LIST, BUILD_COMMANDS. agent-memory placeholders: AGENT_NAME, AGENT_NAME_TITLE.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/templates/agent-memory-index.tmpl \
  skills/claude-experience-bootstrap/templates/plan-doc.tmpl && \
  git commit -m "feat(skill): add agent-memory and plan-doc templates"
```

---

## Task 8: Write `templates/agents/_base-agent.md.tmpl`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/_base-agent.md.tmpl`

**Purpose:** This is NOT a standalone template — it's a fragment file that the concrete archetype templates (`backend.md.tmpl`, etc.) `{{>include}}` at fixed anchor points. It holds the three sections every agent gets verbatim: frontmatter skeleton, Squad Coordination, Shared Memory, Wiki References.

SKILL.md Phase 4 procedure for inclusion: "When rendering an agent template, find each `{{>BASE_SECTION:<name>}}` marker and replace it with the content of the `<name>` section from `_base-agent.md.tmpl`, then substitute placeholders in the result."

- [ ] **Step 1: Write the fragment file**

Content (full file):

````markdown
# Fragments for concrete agent templates

Each section below is a named fragment. Concrete agent templates include a fragment by writing `{{>BASE_SECTION:<name>}}` (e.g., `{{>BASE_SECTION:frontmatter}}`). SKILL.md Phase 4 resolves these before substituting `{{PLACEHOLDERS}}`.

## section:frontmatter

```yaml
---
name: {{AGENT_NAME}}
description: "{{AGENT_DESCRIPTION}}"
tools: {{AGENT_TOOLS}}
model: {{AGENT_MODEL}}
{{#AGENT_HAS_PERMISSION_MODE}}permissionMode: {{AGENT_PERMISSION_MODE}}
{{/AGENT_HAS_PERMISSION_MODE}}memory: project
---
```

## section:squad-coordination

```markdown
## Squad Coordination

When running in a claude-squad session:
1. **On startup:** `register_agent` with `project: "{{PROJECT_NAME}}"`, your name, branch, and task description. Then `get_team_status` + `get_messages` + `get_decisions(since=24h)`.
2. **While working:** `send_message` to share API contracts, completion status, or blockers with other agents. `log_decision` for architectural choices that affect other agents.
3. **If blocked:** `send_message` to the relevant agent and `update_status` with status `"blocked"`.
4. **When done:** `update_status` with status `"done"` and summary of what was completed. Broadcast `send_message` summarizing the work.
```

## section:shared-memory

```markdown
## Shared Memory

**On session start:**
1. Read `.claude/agent-memory/{{AGENT_NAME}}/MEMORY.md` for long-lived learnings specific to this role.
2. Check `docs/superpowers/specs/` for any in-progress spec relevant to your task.
3. Call `get_decisions(since=24h)` via squad-coordinator for recent cross-session decisions.

**While working:**
- Task-specific context → write to a plan doc in `docs/superpowers/specs/`.
- Decision other agents must know → `log_decision` (will become searchable project-wide).
- Pattern/gotcha you'll want next time in this role → add to this agent's MEMORY.md.
- When in doubt: plan > decision > memory (prefer the most durable).

**Before finishing:**
If you hit a reusable gotcha or pattern:
1. Write the entry as a separate file under `.claude/agent-memory/{{AGENT_NAME}}/` with a descriptive name (e.g., `feedback_<topic>.md`).
2. Add a single bullet line to the `MEMORY.md` index pointing at the new file.
3. Commit both.
```

## section:wiki-references

```markdown
{{#WIKI_ENABLED_FOR_AGENT}}
## Wiki References

When working on features touching these topics, consult the reference vault (`{{WIKI_ROOT}}`):

{{WIKI_LINKS_AGENT}}
{{/WIKI_ENABLED_FOR_AGENT}}
```

## section:when-you-finish

```markdown
## When you finish

- Run `{{BUILD_COMMANDS_AGENT}}` to verify compilation.
- Report what files you changed and their paths.
- If you made an architectural choice (library picked, API shape set, naming convention): `log_decision` before ending the session.
```
````

- [ ] **Step 2: Verify all five sections are present**

Run:
```bash
grep -E "^## section:" ~/.claude/skills/claude-experience-bootstrap/templates/agents/_base-agent.md.tmpl
```

Expected:
```
## section:frontmatter
## section:squad-coordination
## section:shared-memory
## section:wiki-references
## section:when-you-finish
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/templates/agents/_base-agent.md.tmpl && \
  git commit -m "feat(skill): add base agent fragments"
```

---

## Task 9: Write universal archetypes — `reviewer.md.tmpl` and `test.md.tmpl`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/reviewer.md.tmpl`
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/test.md.tmpl`

Both are universal archetypes (always in the roster). They use the base fragments but add archetype-specific Architecture Rules and Review/Test Process sections.

- [ ] **Step 1: Write `reviewer.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the code reviewer for {{PROJECT_NAME}}. You perform read-only reviews of all code changes to catch bugs, security issues, and architecture violations. You do NOT modify code — you report findings for other agents to fix.

## Architecture rules to enforce

{{ARCHITECTURE_RULES}}

## Security checklist

{{SECURITY_CHECKLIST}}

## Review process

1. **Identify changed files:** Run `git diff --name-only` against the base branch to see all modifications.
2. **Read each changed file completely:** Understand the full context, not just the diff hunks.
3. **Check architecture compliance:** Verify each change against the rules above.
4. **Run security checklist:** Check every item for all modified files.
5. **Check consistency:** Verify naming, patterns, and code style match existing conventions in the same project.
6. **Check configuration consistency:** If configuration changed, verify all environment variants are consistent.
7. **Check module boundaries:** Verify new code is in the correct module/directory per the ownership table.
8. **Verify build:** Run `{{BUILD_COMMANDS_AGENT}}` on affected projects to confirm compilation.
9. **Report findings:** List issues by severity with file paths and line numbers.

## Review output format

```
## Review Results

### Critical (must fix before merge)
- `path/file.ext:42` — Description of issue and why it's critical

### Warnings (should fix)
- `path/file.ext:18` — Description of concern and recommended fix

### Suggestions (nice to have)
- `path/file.ext:100` — Description of improvement opportunity

### Approved files
- `path/file.ext` — No issues found
```

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 2: Write `test.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the test engineer for {{PROJECT_NAME}}. You own all test projects and are responsible for writing integration tests, unit tests, and verifying behavior.

## Your file ownership

{{OWNED_PATHS}}

Do NOT modify source code in any implementation project. If you need source changes for testability (e.g., visibility modifiers, missing interfaces), send a message to the appropriate agent.

## Architecture rules you must follow

{{ARCHITECTURE_RULES}}

## Test infrastructure

{{TEST_INFRASTRUCTURE}}

## What to test (priority order)

1. **API endpoint integration tests** — request/response for critical endpoints using the project's standard test harness.
2. **Business-logic unit tests** — pure functions and service methods with mocked dependencies.
3. **Validation rule tests** — validators produce correct error messages for invalid input.
4. **External-API client tests** — verify serialization, pagination, error responses against mocked transports.
5. **Event/webhook processing tests** — signature validation, event parsing, retry behavior.

## Test conventions

{{TEST_CONVENTIONS}}

{{>BASE_SECTION:when-you-finish}}

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 3: Verify both files reference the base-section fragments and use consistent placeholders**

Run:
```bash
grep -c "{{>BASE_SECTION:" ~/.claude/skills/claude-experience-bootstrap/templates/agents/reviewer.md.tmpl
grep -c "{{>BASE_SECTION:" ~/.claude/skills/claude-experience-bootstrap/templates/agents/test.md.tmpl
```

Expected: reviewer = 4 (frontmatter, wiki-references, shared-memory, squad-coordination); test = 5 (adds when-you-finish).

- [ ] **Step 4: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/templates/agents/reviewer.md.tmpl \
  skills/claude-experience-bootstrap/templates/agents/test.md.tmpl && \
  git commit -m "feat(skill): add reviewer and test agent templates"
```

---

## Task 10: Write main role archetypes — `backend.md.tmpl` and `frontend.md.tmpl`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/backend.md.tmpl`
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/frontend.md.tmpl`

- [ ] **Step 1: Write `backend.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the backend developer for {{PROJECT_NAME}}. You own {{AGENT_SCOPE_DESCRIPTION}} — API endpoints, business logic, data access, and external integrations.

## Your file ownership

{{OWNED_PATHS}}

Do NOT modify files in {{FORBIDDEN_PATHS}}.

## Architecture rules you must follow

{{ARCHITECTURE_RULES}}

## Key patterns in the codebase

{{KEY_PATTERNS}}

{{>BASE_SECTION:when-you-finish}}

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 2: Write `frontend.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the frontend developer for {{PROJECT_NAME}}. You own {{AGENT_SCOPE_DESCRIPTION}} — UI components, routing, state management, styling, and client-side data fetching.

## Your file ownership

{{OWNED_PATHS}}

Do NOT modify files in {{FORBIDDEN_PATHS}}.

## Architecture rules you must follow

{{ARCHITECTURE_RULES}}

## Key patterns in the codebase

{{KEY_PATTERNS}}

## UI verification

- Before reporting the task complete, start the dev server and exercise the feature in a browser. Test the golden path and edge cases. Monitor for regressions in other features.
- Type checking and test suites verify code correctness, not feature correctness — if you can't test the UI, say so explicitly rather than claiming success.

{{>BASE_SECTION:when-you-finish}}

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 3: Verify and commit**

Run:
```bash
ls -la ~/.claude/skills/claude-experience-bootstrap/templates/agents/{backend,frontend}.md.tmpl
```

Expected: both files exist, non-empty.

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/templates/agents/backend.md.tmpl \
  skills/claude-experience-bootstrap/templates/agents/frontend.md.tmpl && \
  git commit -m "feat(skill): add backend and frontend agent templates"
```

---

## Task 11: Write `infra.md.tmpl` and `package.md.tmpl`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/infra.md.tmpl`
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/package.md.tmpl`

- [ ] **Step 1: Write `infra.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the infrastructure engineer for {{PROJECT_NAME}}. You own Docker, CI/CD pipelines, build tooling, deployment scripts, and observability configuration (logging, tracing, metrics).

## Your file ownership

{{OWNED_PATHS}}

Do NOT modify business logic, controllers, services, repositories, or domain models in any application project.

## Architecture rules you must follow

{{ARCHITECTURE_RULES}}

## Key patterns in the codebase

{{KEY_PATTERNS}}

{{>BASE_SECTION:when-you-finish}}

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 2: Write `package.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the owner of the `{{PACKAGE_NAME}}` package/app in the {{PROJECT_NAME}} monorepo. You are responsible for its source code, internal dependencies, package-level configuration, and its public contract with other packages.

## Your file ownership

{{OWNED_PATHS}}

Do NOT modify files in other packages without first sending a message to the owning agent (see the roster table in CLAUDE.md).

## Package contract

- **Depends on:** {{PACKAGE_DEPENDENCIES}}
- **Depended on by:** {{PACKAGE_DEPENDENTS}}
- **Public entry points:** {{PACKAGE_EXPORTS}}

Changes to public entry points require:
1. A `log_decision` with category `api` describing the change.
2. A broadcast `send_message` to all dependent-package agents.
3. Updates to any cross-package tests in the test project.

## Architecture rules you must follow

{{ARCHITECTURE_RULES}}

## Key patterns in this package

{{KEY_PATTERNS}}

{{>BASE_SECTION:when-you-finish}}

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 3: Verify and commit**

```bash
grep -c "{{>BASE_SECTION:" ~/.claude/skills/claude-experience-bootstrap/templates/agents/{infra,package}.md.tmpl
```

Expected: 5 for each file.

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/templates/agents/infra.md.tmpl \
  skills/claude-experience-bootstrap/templates/agents/package.md.tmpl && \
  git commit -m "feat(skill): add infra and package-owner agent templates"
```

---

## Task 12: Write `docs.md.tmpl` and `data.md.tmpl`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/docs.md.tmpl`
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/data.md.tmpl`

- [ ] **Step 1: Write `docs.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the documentation owner for {{PROJECT_NAME}}. You maintain `/docs`, `/rfc` (if present), and contribute to the top-level README/AGENTS/CONTRIBUTING files. You do not own source code — your job is to keep documentation accurate as the code evolves.

## Your file ownership

{{OWNED_PATHS}}

**Read-only:** `README.md`, `AGENTS.md`, `CONTRIBUTING.md` at the repo root. You may propose changes to these via `send_message` to the appropriate implementation agent, but do not edit them directly without approval.

## Architecture rules you must follow

1. **Mermaid.js for diagrams** — sequence, flowchart, ER, C4 in fenced `\`\`\`mermaid` blocks.
2. **YYYY-MM-DD dates** — always absolute, never relative ("last week", "recently").
3. **Link to plans, not summaries** — when a feature has a plan doc in `docs/superpowers/specs/` or `docs/plans/`, link to it rather than re-describing.
4. **One concept per file** — if a doc grows beyond ~800 lines, split it.
5. **Preserve RFCs** — `/rfc` entries are historical. Do not edit accepted RFCs; supersede with new ones.

## Key patterns

{{KEY_PATTERNS}}

{{>BASE_SECTION:when-you-finish}}

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 2: Write `data.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the data engineer for {{PROJECT_NAME}}. You own schema migrations, database models, ETL pipelines, and any ML/analytics data flows.

## Your file ownership

{{OWNED_PATHS}}

Do NOT modify application-level business logic. If a migration requires code changes in a consumer agent's code, send a message first.

## Architecture rules you must follow

1. **Migrations are append-only** — never rewrite a committed migration. Add a new migration to correct a prior one.
2. **Backward-compatible schema changes** — prefer adding nullable columns + backfills + follow-up migration to enforce NOT NULL.
3. **Test the migration path** — a migration must be runnable on a production-shaped database without locking critical tables. Document any long-running migration steps in the plan doc before merging.
4. **Seed data is separate from migrations** — seeds live in their own directory.
5. **ORM models match migrations** — if the ORM and migrations diverge, the migration wins; update the model to match.

## Key patterns

{{KEY_PATTERNS}}

{{>BASE_SECTION:when-you-finish}}

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 3: Verify and commit**

```bash
grep -c "{{>BASE_SECTION:" ~/.claude/skills/claude-experience-bootstrap/templates/agents/{docs,data}.md.tmpl
```

Expected: 5 for each.

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/templates/agents/docs.md.tmpl \
  skills/claude-experience-bootstrap/templates/agents/data.md.tmpl && \
  git commit -m "feat(skill): add docs and data agent templates"
```

---

## Task 13: Write opt-in archetypes — `security.md.tmpl` and `design-system.md.tmpl`

**Files:**
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/security.md.tmpl`
- Create: `~/.claude/skills/claude-experience-bootstrap/templates/agents/design-system.md.tmpl`

- [ ] **Step 1: Write `security.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the security engineer for {{PROJECT_NAME}}. You own authentication, authorization, secrets management, and security-sensitive code paths. You also serve as a consultant to other agents when they touch security-adjacent code.

## Your file ownership

{{OWNED_PATHS}}

You have read access to all code but write access only to security-sensitive paths. Security review of other agents' changes is performed by the `reviewer` agent — you are consulted for complex issues.

## Architecture rules you must follow

1. **No hardcoded secrets** — credentials, API keys, tokens, and signing keys must come from configuration/environment/secret stores, never source.
2. **Defense in depth** — assume any layer can fail; validate at each boundary.
3. **Fail closed** — on error, deny access rather than grant.
4. **Signed inputs** — webhook endpoints, SSO redirects, and similar must validate signatures before processing payloads.
5. **No sensitive data in logs** — PII, full tokens, passwords, full card numbers are logged as redacted or not at all.
6. **CSP and CORS restrictive by default** — broaden only with justification in `log_decision`.
7. **Parameterized queries only** — no string interpolation into SQL or NoSQL query strings.

## Key patterns

{{KEY_PATTERNS}}

## Security review checklist

- [ ] No hardcoded credentials, API keys, access tokens
- [ ] Webhook endpoints validate signature before processing payloads
- [ ] Input validation on all public endpoints
- [ ] No SQL/NoSQL injection vectors
- [ ] No sensitive data logged
- [ ] CORS configuration restrictive
- [ ] No debug endpoints exposed in production configs
- [ ] Encryption uses approved algorithms
- [ ] Secrets not in committed `*.Development.*` or `.env*` files

{{>BASE_SECTION:when-you-finish}}

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 2: Write `design-system.md.tmpl`**

Content (full file):

````markdown
{{>BASE_SECTION:frontmatter}}

You are the design system owner for {{PROJECT_NAME}}. You own the shared UI kit, theming tokens, base components, and component-library documentation.

## Your file ownership

{{OWNED_PATHS}}

Changes here propagate to every consumer app. Backward compatibility is required — breaking changes require:
1. A `log_decision` with category `api` describing the breakage and migration path.
2. A broadcast `send_message` to all consumer agents.
3. A migration plan doc if the change is non-trivial.

## Architecture rules you must follow

1. **Tokens are the source of truth** — colors, spacing, typography come from the design token file; components use tokens, not hardcoded values.
2. **Components are composable** — prefer small components that compose over large components with many props.
3. **No business logic in the design system** — components are presentational; data-fetching, routing, and domain logic live in consumer apps.
4. **Accessibility by default** — WCAG AA minimum; all interactive components have focus states, keyboard navigation, ARIA labels where appropriate.
5. **Visual regression tests required** — new or changed components need snapshots.
6. **Storybook stories for every component** — at minimum a default story; ideally covering main variants.

## Key patterns

{{KEY_PATTERNS}}

{{>BASE_SECTION:when-you-finish}}

{{>BASE_SECTION:wiki-references}}

{{>BASE_SECTION:shared-memory}}

{{>BASE_SECTION:squad-coordination}}
````

- [ ] **Step 3: Verify and commit**

```bash
grep -c "{{>BASE_SECTION:" ~/.claude/skills/claude-experience-bootstrap/templates/agents/{security,design-system}.md.tmpl
ls ~/.claude/skills/claude-experience-bootstrap/templates/agents/ | wc -l
```

Expected: 5 base-section refs each; directory count = 11 (10 archetypes + `_base-agent.md.tmpl`).

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/templates/agents/security.md.tmpl \
  skills/claude-experience-bootstrap/templates/agents/design-system.md.tmpl && \
  git commit -m "feat(skill): add security and design-system agent templates"
```

---

## Task 14: Write SKILL.md Phase 1 (Discover) and Phase 2 (Brainstorm)

**Files:**
- Modify: `~/.claude/skills/claude-experience-bootstrap/SKILL.md` (replace Phase 1 and Phase 2 stubs)

- [ ] **Step 1: Replace the Phase 1 and Phase 2 stubs in SKILL.md**

Append (after the "Phase 5" stub reference, or replace the entire stub section) the following content:

````markdown
## Phase 1 — Discover

Silent phase. No user interaction. Do ALL of the following in parallel where possible:

1. **Read the repo root.** List top-level files and directories. Note which of these exist: `package.json`, `*.sln`, `pyproject.toml`, `setup.py`, `requirements.txt`, `Cargo.toml`, `go.mod`, `go.work`, `turbo.json`, `nx.json`, `pnpm-workspace.yaml`, `compose.yaml`, `Dockerfile`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`.

2. **Parse manifest files.** For each manifest present, read it and extract: build tool, test tool, dependencies, workspace config. Consult `references/project-type-detection.md` — apply the signal matrix to compute `primary_language` and `project_shape`. Apply confidence rules.

3. **Infer frameworks.** Using the framework sub-detection in `references/project-type-detection.md`, list detected frameworks in `stack_profile.frameworks`.

4. **Run the active-dirs query:**
   ```bash
   git log --since="30 days ago" --name-only --pretty=format: 2>/dev/null | \
     awk -F/ 'NF>0 {print $1}' | sort | uniq -c | sort -rn | head -10
   ```
   Capture the top-10 into `stack_profile.active_dirs`. If the repo has no git history, skip this silently.

5. **Check squad-coordinator reachability.** Attempt an HTTP GET against `{{SQUAD_COORDINATOR_URL}}` (default `http://localhost:8070/`, or `$CLAUDE_SQUAD_COORDINATOR_URL` if set). 2-second timeout. Record `stack_profile.squad_reachable` as bool.

6. **Resolve wiki root.** In order:
   - If `$CLAUDE_WIKI_ROOT` (or `%CLAUDE_WIKI_ROOT%`) is set and the path exists, use it.
   - Else try the literal fallback `C:\Users\thaverman\Documents\Obsidian\Programing\wiki\`.
   - Else mark `wiki_found = false` (ask user in Phase 2).

7. **Scan wiki index if available.** Read `{{WIKI_ROOT}}/index.md`. Parse `## Sources`, `## Entities`, `## Concepts` per the procedure in `references/wiki-integration.md`. Apply the matching rules to the detected frameworks/stack and compute per-agent wikilink sets. Keep in memory; used in Phase 3 and Phase 4.

8. **Detect seq + serilog.** Check dependency manifests and `appsettings*.json` for `Serilog` / `seq` / OTLP-to-Seq configuration. Set `stack_profile.seq_detected = true` if any match.

9. **Detect security/design-system signals.** Per `references/roster-presets.md` § "security and design-system auto-detection": scan for auth modules and UI-kit packages. Set flags `propose_security` and `propose_design_system`.

10. **Check for prior bootstrap.** If any of these exist:
    - `docs/superpowers/specs/*claude-setup.md`
    - `.claude/agents/*.md` with `name: claude-experience-bootstrap-*` or matching our archetype template signatures
    Then set `prior_bootstrap = true` and read the prior plan doc to pre-populate Phase 2 answers.

At the end of Phase 1, summarize the detection result for yourself (internal — do not print yet). Proceed to Phase 2.

## Phase 2 — Brainstorm (3-4 questions max)

**If `prior_bootstrap` is true**, skip to the re-run flow described in the "Edge cases" section at the end of this file.

Otherwise, ask the user **one question per turn**:

### Question 1 — Confirm the detected project type

Print a compact summary of detection:
```
Detected project type: {{primary_language}} {{project_shape}}
Build tool: {{build_tool}}
Test tool: {{test_tool}}
Frameworks: {{frameworks_list}}
Active directories (last 30 days): {{active_dirs}}
Existing AI setup: {{existing_ai_setup}}
Squad-coordinator reachable: {{squad_reachable}}
Wiki found: {{wiki_found}} {{#wiki_found}}({{wiki_root}}){{/wiki_found}}

Is this right, or should I adjust anything?
```

Wait for user response. Apply any corrections to the stack profile.

### Question 2 — Confirm the proposed roster

Compose the roster from `references/roster-presets.md` using the confirmed stack profile. Add `security` or `design-system` only if their auto-detection flags fired in Phase 1.

Print:
```
Proposed roster ({{N}} agents):
{{for each agent: show name, archetype, owned paths preview}}

Does this roster work, or should I adjust? You can say: swap X for Y, drop X, merge X and Y, rename X to Y, add [archetype], or 'looks good'.
```

If roster size > 8, add a warning line before the "Does this roster work" prompt: "⚠ {{N}} agents is a lot. Coordination gets harder beyond ~8. Want to group any of these, or proceed as-is?"

Parse the user's edits into a final roster. Re-ask only if the reply is ambiguous; otherwise proceed.

### Question 3 — Confirm wiki integration (skip if wiki found via env var)

If `wiki_found = true` via the literal fallback path (not env var), ask:
```
Wiki detected at `{{wiki_root}}`. This path is machine-specific. Want me to use the `CLAUDE_WIKI_ROOT` environment variable instead for portability? (Recommended.)
```
If yes, set the template's `{{WIKI_ROOT}}` placeholder to `$CLAUDE_WIKI_ROOT` (or `%CLAUDE_WIKI_ROOT%` on Windows shells) with the literal path noted as the fallback in the generated CLAUDE.md.

If `wiki_found = false`, ask:
```
No wiki found at env var or default path. Options:
  (a) skip wiki integration (no wiki section in CLAUDE.md)
  (b) provide a different path
  (c) I'll set CLAUDE_WIKI_ROOT before running again (cancel for now)
```

### Question 4 — Existing-file policy (only if conflicts exist)

If any of these exist in the target repo:
- Existing `CLAUDE.md`
- Existing `.mcp.json`
- Existing `.claude/agents/<name>.md` matching any proposed roster member
- Existing `.claude/settings.json`

Show a conflict table and confirm merge/replace/skip per file. Apply `references/roster-presets.md` defaults unless the user overrides.

```
Existing files detected:
  CLAUDE.md           → default: merge (wrap generated content in HTML-comment markers)
  .mcp.json           → default: merge (add squad-coordinator entry; keep existing entries)
  .claude/agents/foo.md → default: SKIP (never overwrite agent files)

Accept defaults or override? (e.g., "replace CLAUDE.md", "overwrite foo.md")
```

If no conflicts, skip this question silently.

After all questions answered, proceed to Phase 3.
````

- [ ] **Step 2: Verify the Phase 1 and Phase 2 sections are present**

Run:
```bash
grep -E "^## Phase [12] —" ~/.claude/skills/claude-experience-bootstrap/SKILL.md
wc -l ~/.claude/skills/claude-experience-bootstrap/SKILL.md
```

Expected: two matches (`Phase 1 — Discover`, `Phase 2 — Brainstorm`); file length > 100 lines.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/SKILL.md && \
  git commit -m "feat(skill): add Phase 1 Discover and Phase 2 Brainstorm to SKILL.md"
```

---

## Task 15: Write SKILL.md Phase 3 (Plan)

**Files:**
- Modify: `~/.claude/skills/claude-experience-bootstrap/SKILL.md` (append Phase 3 section)

- [ ] **Step 1: Append Phase 3 section**

Append to SKILL.md:

````markdown
## Phase 3 — Plan

Write the setup plan doc to `docs/superpowers/specs/{{TODAY_DATE}}-claude-setup.md` in the target repo. Use `templates/plan-doc.tmpl` — substitute placeholders from the Phase 2 results.

Procedure:

1. Compute `{{TODAY_DATE}}` as current date in `YYYY-MM-DD` format.
2. Ensure `docs/superpowers/specs/` exists in the target repo; create if missing (`mkdir -p`).
3. If a file `docs/superpowers/specs/{{TODAY_DATE}}-claude-setup.md` already exists (re-run on same day), append a counter: `{{TODAY_DATE}}-claude-setup-2.md`, `-3.md`, etc.
4. Read `templates/plan-doc.tmpl`, substitute all placeholders, write the result.
5. Substitution values:
   - `{{PROJECT_NAME}}` — from Phase 2.
   - `{{TODAY_DATE}}` — computed above.
   - `{{PRIMARY_LANGUAGE}}`, `{{PROJECT_SHAPE}}`, `{{FRAMEWORKS_LIST}}`, `{{BUILD_TOOL}}`, `{{TEST_TOOL}}`, `{{HAS_DOCKER}}`, `{{HAS_MONOREPO_WORKSPACE}}`, `{{ACTIVE_DIRS}}`, `{{EXISTING_AI_SETUP}}` — from stack profile.
   - `{{ROSTER_TABLE}}` — Markdown table: `| Agent | Archetype | Owned paths | Tools/model |`.
   - `{{WIKI_ENABLED}}`, `{{WIKI_ROOT}}`, `{{WIKI_RESOLUTION_METHOD}}`, `{{WIKI_MATCH_COUNT}}` — from Phase 1 & 2.
   - `{{SQUAD_COORDINATOR_URL}}`, `{{SQUAD_REACHABLE}}` — from Phase 1.
   - `{{FILE_POLICY_TABLE}}` — Markdown table showing every file that will be created/modified/merged/skipped with the decided policy.
   - `{{FILE_LIST}}` — bulleted list of every file path that Phase 4 will write, with an annotation `(new)`, `(merge)`, or `(skip)`.
   - `{{BUILD_COMMANDS}}` — detected build commands.

6. **Auto-commit the plan doc** in the target repo:
   ```bash
   cd <target-repo>
   git add docs/superpowers/specs/{{TODAY_DATE}}-claude-setup.md
   git commit -m "docs(superpowers): claude-experience-bootstrap setup plan"
   ```
   If the target repo is not a git repo, skip the commit step and tell the user.

7. Print to the user:
   ```
   Setup plan written to docs/superpowers/specs/{{filename}}.md and committed.

   Review it, then reply `proceed` to execute Phase 4 (render all templates and write files).
   Reply anything else to cancel.
   ```

8. **STOP and wait for user reply.** Do not proceed without an explicit `proceed`. If the user asks for changes, update the plan doc (amend the commit if still on the same SHA, else add a new commit) and re-ask.
````

- [ ] **Step 2: Verify**

Run:
```bash
grep -E "^## Phase [123] —" ~/.claude/skills/claude-experience-bootstrap/SKILL.md
```

Expected: three matches.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/SKILL.md && \
  git commit -m "feat(skill): add Phase 3 Plan to SKILL.md"
```

---

## Task 16: Write SKILL.md Phase 4 (Execute) and Phase 5 (Verify & Register)

**Files:**
- Modify: `~/.claude/skills/claude-experience-bootstrap/SKILL.md` (append Phase 4 + Phase 5)

- [ ] **Step 1: Append Phase 4 and Phase 5 sections**

Append to SKILL.md:

````markdown
## Phase 4 — Execute

Render all templates and write the resulting files in the target repo. Do NOT commit these files — the user reviews the diff and commits.

### Substitution procedure (applies to all template files)

1. Read the template file.
2. Resolve `{{>BASE_SECTION:<name>}}` fragment includes: read `templates/agents/_base-agent.md.tmpl`, find the matching `## section:<name>` header, extract the fenced content under it (remove the enclosing fence markers), and splice it in.
3. Resolve conditional blocks: for each `{{#FLAG}}...{{/FLAG}}` block, if `FLAG` is false or empty, delete everything between the markers (including the markers); if true, keep the content and delete the markers.
4. Resolve list blocks: for each `{{#LIST}}...{{/LIST}}` block, repeat the content for each item in `LIST`, replacing `{{item}}` (and any nested item field placeholders) per iteration.
5. Substitute scalar placeholders: replace each `{{PLACEHOLDER}}` with its computed value. Placeholders with no value are an error — halt and report to user.

### File generation order

Write files in this order (earlier files may inform later ones):

1. **`.claude/settings.json`** — Only if missing. From `templates/settings.json.tmpl`.
2. **`.mcp.json`** — Merge if exists, create if missing. From `templates/mcp.json.tmpl`. Merge rules: load existing JSON, add the `squad-coordinator` entry (and `seq` if detected) to `mcpServers`. Never remove existing entries.
3. **`.claude/agent-memory/<agent>/MEMORY.md`** — One per agent in the final roster. Only if missing. From `templates/agent-memory-index.tmpl`.
4. **`.claude/agents/<agent>.md`** — One per agent in the final roster. **Skip if exists** (never overwrite). From `templates/agents/<archetype>.md.tmpl` — use the archetype matching the agent's role.
5. **`CLAUDE.md`** — Merge if exists (per marker rules below); create if missing. From `templates/CLAUDE.md.tmpl`.

### CLAUDE.md merge rules

- If CLAUDE.md does not exist: write the rendered template directly.
- If CLAUDE.md exists and contains `<!-- claude-experience-bootstrap:start -->` ... `<!-- claude-experience-bootstrap:end -->` markers: replace only the content BETWEEN (and including) the markers with the newly rendered template content (which itself starts/ends with the same markers).
- If CLAUDE.md exists but has no markers: append the rendered template (with markers) at the END of the file, separated by a blank line. Do not touch existing content.

### After all files are written

Print to the user:
```
Phase 4 complete. Files written:
  (new)   CLAUDE.md
  (new)   .mcp.json
  (skip)  .claude/agents/existing-agent.md  — already exists, skipped
  (new)   .claude/agents/storefront.md
  (new)   .claude/agent-memory/storefront/MEMORY.md
  ...

Review the diff with `git status` and `git diff`. Commit when you're satisfied.
```

Do NOT auto-commit. The user explicitly approved the plan, but each generated artifact deserves a review gate.

## Phase 5 — Verify and register

### Verify

Run the detected build command to confirm the new files haven't broken anything:

```bash
cd <target-repo>
{{BUILD_COMMANDS}}
```

Report the result to the user:
- On success: "Build passed. Setup is ready to commit."
- On failure: "Build failed after setup. Review the output and fix before committing." (Include the tail of the build output.)

If no build command is detected (e.g., pure docs repo), skip this step and say so.

### Register with squad-coordinator (if reachable)

If `stack_profile.squad_reachable` is true:

1. Call `register_project`:
   ```
   register_project(
     name: "{{PROJECT_NAME}}",
     description: "{{PROJECT_DESCRIPTION}}",
     repo_path: "<absolute-path-to-target-repo>",
     tags: [{{FRAMEWORKS_LIST}}, {{PRIMARY_LANGUAGE}}]
   )
   ```

2. If the response is "already exists": ask the user whether to use the existing registration or pick a new name. Default: use existing.

3. Call `log_decision`:
   ```
   log_decision(
     project: "{{PROJECT_NAME}}",
     category: "plan",
     summary: "Claude Experience Bootstrap — setup complete",
     rationale: "See docs/superpowers/specs/{{TODAY_DATE}}-claude-setup.md",
     tags: ["bootstrap", "claude-setup"],
     agent: "claude-experience-bootstrap"
   )
   ```

If `squad_reachable` is false, skip both calls and tell the user: "squad-coordinator unreachable — skipped project registration. Run this again once it's up, or the first agent session will register on its own."

### Append execution log to the plan doc

Open `docs/superpowers/specs/{{plan-filename}}.md` and append:

```markdown

## Execution log

**Date:** {{EXECUTION_DATE}}

Files written:
- `(new/merge/skip)` `path/to/file` — brief note

Build verification: {{BUILD_RESULT}}
squad-coordinator registration: {{REGISTRATION_RESULT}}
```

Do NOT auto-commit this update. Tell the user: "Execution log appended to the plan doc. Review and commit with your other changes when ready."

### Final message

```
Claude Experience Bootstrap complete. Review `git status`, commit the generated files, and start using the new agents via `claude --agent <role>`.

Next steps you might want to run:
  - fewer-permission-prompts  — builds up .claude/settings.json allow list from real use
  - Start your first squad session to exercise the setup end-to-end
```
````

- [ ] **Step 2: Verify all five phases are present**

Run:
```bash
grep -E "^## Phase [1-5] —" ~/.claude/skills/claude-experience-bootstrap/SKILL.md
```

Expected: five matches.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/SKILL.md && \
  git commit -m "feat(skill): add Phase 4 Execute and Phase 5 Verify to SKILL.md"
```

---

## Task 17: Write SKILL.md edge-cases section

**Files:**
- Modify: `~/.claude/skills/claude-experience-bootstrap/SKILL.md` (append Edge Cases section)

- [ ] **Step 1: Append edge cases section**

Append to SKILL.md:

````markdown
## Edge cases

### Re-running on an already-bootstrapped repo

Detected in Phase 1 (`prior_bootstrap = true`). Phase 2 branches: skip the normal questions and ask a single meta-question:

```
A prior Claude experience bootstrap was detected:
  Plan doc: docs/superpowers/specs/<filename>.md (dated YYYY-MM-DD)
  Existing agents: <list>

Options:
  (a) refresh  — regenerate CLAUDE.md from current detection; skip files that exist
  (b) extend   — add new roster members to the existing setup (detect what's new; leave existing alone)
  (c) cancel   — don't touch anything

Which?
```

- **refresh:** Phase 3 writes a new plan doc; Phase 4 regenerates CLAUDE.md (preserving user sections via markers); all other existing files are skipped.
- **extend:** Phase 2 proposes a delta roster (only new archetypes). Phase 3 writes a delta plan. Phase 4 creates only the new files.
- **cancel:** exit without writing anything.

### Detection failure / polyglot

On low-confidence detection:
1. Phase 1 produces a report of all signals found.
2. Phase 2 Question 1 shows: "Couldn't confidently determine project shape. Signals: {{list}}. Which of these is primary? {{options}}. Or say 'none' for a generic roster."
3. If "none": fall back to `implementation`, `infra`, `test`, `reviewer`.

### Squad-coordinator unreachable

If `squad_reachable = false`:
- Phase 5 skips `register_project` and `log_decision`. Tells the user: "squad-coordinator unreachable; skipped project registration."
- Generated agent files still include the Squad Coordination section — they tell agents to check reachability on startup and proceed with degraded functionality if unreachable (per the CLAUDE.md Shared Memory section).

### Target repo is not a git repo

- Phase 3 skips `git commit` of the plan doc and tells the user to commit manually through their normal mechanism.
- Phase 4 still writes files normally.
- Phase 5 still registers with squad-coordinator using `repo_path` = absolute directory path.

### `~/.claude/` is not a git repo

- Skill-file commits during development of the skill (these are plan tasks) should be skipped with a note; the user is responsible for committing their dotfiles through their own mechanism.

### Target repo has read-only files

- Phase 4 detects write failures and reports them to the user. Other files continue to be written. The plan doc's execution log records the failures.

### Project name collision with existing squad-coordinator project

Handled in Phase 5 (see above): ask the user; default to using the existing registration.
````

- [ ] **Step 2: Verify**

Run:
```bash
grep -E "^## (Phase [1-5] —|Edge cases|Execution flow|Announce at start)" ~/.claude/skills/claude-experience-bootstrap/SKILL.md
wc -l ~/.claude/skills/claude-experience-bootstrap/SKILL.md
```

Expected: seven matches (Announce, Execution flow, 5 phases, Edge cases); file length > 400 lines.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude && git add skills/claude-experience-bootstrap/SKILL.md && \
  git commit -m "feat(skill): add edge-cases section to SKILL.md"
```

---

## Task 18: Dry-run verification against `Ssw.MicroServices`

**Purpose:** Run the skill mentally against the current `Ssw.MicroServices` repo and compare the predicted output to the actual existing CLAUDE.md / agents / .mcp.json. This is a manual comparison — no automated assertion framework. The goal is to catch gaps where the skill would regress the current setup.

**Files:** None created or modified; this is a verification pass only.

- [ ] **Step 1: Walk through Phase 1 against `Ssw.MicroServices`**

Open the skill files and mentally apply Phase 1 to `d:\reposVS2022\Ssw.MicroServices`:

Record the expected stack profile:
```
primary_language: C#
project_shape: microservices
frameworks: [ASP.NET Core, EF Core, MongoDB.Driver, Polly, Serilog, OpenTelemetry, Quartz, FluentValidation]
build_tool: dotnet
test_tool: xunit
has_docker: true
has_monorepo_workspace: false
active_dirs: [Ssw.MicroServices.ProductServices, Ssw.MicroServices.OrderServices, ...]
existing_ai_setup: [CLAUDE.md]
seq_detected: true
squad_reachable: true (assumed; verify with curl)
```

- [ ] **Step 2: Walk through Phase 2 roster proposal**

Apply `references/roster-presets.md` `.NET microservices` preset to the above profile. Expected proposed roster:

- `products` (backend, owns ProductServices/)
- `orders` (backend, owns OrderServices/)
- `services` (backend, owns CustomerServices/, ShippingServices/, GeoServices/, CommunicationServices/, MonitoringServices/, MoniteringServices/, AnalyticsServices/, Foundation/)
- `infra` (owns Gateway/, compose.yaml, Publish*.ps1, Dockerfiles, OTel files)
- `test` (owns ProductServicesTests/)
- `reviewer`

Compare against `.claude/agents/` listing in the current repo: `products.md`, `orders.md`, `services.md`, `infra.md`, `test.md`, `reviewer.md`.

**Expected:** exact match on names. If the skill would propose different names (e.g., grouping services differently), document the discrepancy.

- [ ] **Step 3: Compare the generated CLAUDE.md structure**

Mentally render `templates/CLAUDE.md.tmpl` with the Phase 1+2 data. Compare section-by-section against `d:\reposVS2022\Ssw.MicroServices\CLAUDE.md`:

Checklist:
- [ ] Build and Test Commands section present; commands match
- [ ] Architecture Overview section present
- [ ] Agent Roster and File Ownership table present; columns match
- [ ] Shared Memory section present (this is NEW — won't match existing CLAUDE.md, expected)
- [ ] External Knowledge Base section present (NEW, expected)
- [ ] Agent Team Coordination matches existing (verbatim with project name substituted)
- [ ] Plan Documentation section present; paths match

Gaps acceptable for the NEW sections. Gaps in existing sections = regressions; fix before Task 19.

- [ ] **Step 4: Verify wiki matching**

Given detected frameworks `Serilog`, `OpenTelemetry`, and SSW-specific code, apply `references/wiki-integration.md` matching rules. Expected CLAUDE.md wiki section to include groups for:

- Serilog / Seq (from Serilog + OTel detection)
- SSW-specific (from repo name and README)
- BigCommerce (from ProductServices code references)
- OrderGroove (from OrderServices code references)

Confirm the matched entries are plausible (5-10 per group).

- [ ] **Step 5: Record findings**

Write findings as a markdown note in the skill's working area (not committed to the skill itself):

```bash
cat > /tmp/dry-run-ssw-microservices.md <<EOF
# Dry-run verification — Ssw.MicroServices

Date: $(date +%Y-%m-%d)

## Stack profile match
- [x/failed] primary_language
- ...

## Roster match
- [x/failed] agent names
- ...

## CLAUDE.md structure match
- ...

## Wiki matching
- ...

## Gaps to fix
- ...
EOF
```

If any failures, iterate on the relevant template/reference file and re-run this task.

- [ ] **Step 6: Commit the verification note (optional — in this repo, not the skill)**

If you want an audit trail in this repo:
```bash
cd d:/reposVS2022/Ssw.MicroServices
mkdir -p docs/superpowers/verification
cp /tmp/dry-run-ssw-microservices.md docs/superpowers/verification/
git add docs/superpowers/verification/dry-run-ssw-microservices.md
git commit -m "docs(superpowers): add dry-run verification for Ssw.MicroServices"
```

---

## Task 19: Dry-run verification against `b2b-buyer-portal`

**Purpose:** Same as Task 18 but for a completely different stack (JS/TS Turborepo monorepo). Proves the skill generalizes.

**Files:** None created or modified.

- [ ] **Step 1: Walk through Phase 1 against `D:\vsCodeRepo\b2b-buyer-portal-branch\b2b-buyer-portal`**

Expected stack profile:
```
primary_language: TypeScript
project_shape: monorepo
frameworks: [React (inferred from apps/storefront deps), Vite, GraphQL]
build_tool: yarn + turbo
test_tool: vitest (verify from devDependencies)
has_docker: check (look for Dockerfile)
has_monorepo_workspace: true
active_dirs: [apps, rfc, docs, config, deployment, ...]
existing_ai_setup: [AGENTS.md]
seq_detected: false
```

Read the target repo to confirm.

- [ ] **Step 2: Walk through Phase 2 roster proposal**

Apply the JS/TS monorepo preset. Expected:
- `storefront` (package-owner, owns apps/storefront/)
- `graphql-schema` (package-owner, owns rfc/graphql-schema/)
- `infra` (owns turbo.json, deployment/, config/, .github/)
- `docs` (owns docs/, rfc/ non-code)
- `test` (owns tests across packages)
- `reviewer`

6 agents. Confirm this is what the preset would produce.

- [ ] **Step 3: Compare the generated CLAUDE.md**

Apply the template render. Since the repo has no CLAUDE.md, the full generated file is new. Spot-check:

- [ ] Build commands reference `yarn` and `turbo run build`
- [ ] Agent roster table lists all 6 agents with `apps/storefront/` etc. in owned paths
- [ ] Existing `AGENTS.md` is noted but not modified (per edge-case policy)
- [ ] External Knowledge Base wiki section includes BigCommerce + GraphQL + schema.org entries (since this is a BC B2B portal)
- [ ] `.mcp.json` will NOT include seq (not detected)
- [ ] Squad-coordinator project name will be `b2b-buyer-portal`

- [ ] **Step 4: Verify wiki matching for JS/TS + BigCommerce**

Expected matches:
- BigCommerce REST (`bigcommerce-rest-*`)
- BigCommerce GraphQL Storefront (`bigcommerce-graphql-storefront-*`)
- BigCommerce auth (`bigcommerce-authentication`, `bigcommerce-api-accounts-*`, `bigcommerce-customer-login-api`)
- schema.org (`schemaorg-product-*`)

Not expected (no evidence in the target):
- Serilog / Seq
- SSW-specific (unless repo mentions SSW)

- [ ] **Step 5: Record findings and iterate if needed**

```bash
cat > /tmp/dry-run-b2b-buyer-portal.md <<EOF
# Dry-run verification — b2b-buyer-portal
...
EOF
```

Same format as Task 18.

- [ ] **Step 6: Optional — run the skill for real against a throwaway copy**

If you want to exercise the whole flow end-to-end:

```bash
# 1. Copy the b2b-buyer-portal to a scratch directory
cp -r D:/vsCodeRepo/b2b-buyer-portal-branch/b2b-buyer-portal /tmp/bootstrap-scratch/
cd /tmp/bootstrap-scratch
git init  # if not a repo

# 2. Start Claude Code in this directory, invoke the skill
#    claude  (then say "bootstrap claude here" or "use claude-experience-bootstrap")

# 3. Walk through the 5 phases
# 4. Inspect the generated files
# 5. Discard the scratch directory after review
```

This is optional but high-value — it's the real integration test.

---

## Self-review

### 1. Spec coverage

Walk each section of the spec and point to the task that implements it:

- **Goal** — Task 1-17 build the skill; Tasks 18-19 verify.
- **Non-goals** — Not touched by any task (correct; they're constraints, not features).
- **Architecture → Skill layout** — Task 1 creates dirs; Tasks 2-13 create files per the layout table.
- **Architecture → Skill frontmatter** — Task 1 Step 2 writes exact frontmatter.
- **Architecture → Execution flow (5 phases)** — Task 14 (P1+P2), Task 15 (P3), Task 16 (P4+P5).
- **Architecture → Commit behavior** — Captured in Task 15 Step 1 (auto-commit plan), Task 16 Step 1 (no auto-commit in P4/P5).
- **Detection → Stack profile shape + signal matrix + confidence + frameworks + active-dirs** — Task 2 writes `references/project-type-detection.md`; Task 14 Phase 1 procedure invokes it.
- **Roster archetypes and presets** — Task 3 writes `references/roster-presets.md`; Tasks 8-13 create the 11 archetype templates.
- **Generated artifacts → CLAUDE.md** — Task 5.
- **Generated artifacts → Agent files** — Task 8 (base fragments) + Tasks 9-13 (archetype templates).
- **Generated artifacts → .mcp.json** — Task 6.
- **Generated artifacts → .claude/settings.json** — Task 6.
- **Generated artifacts → MEMORY.md** — Task 7.
- **Generated artifacts → plan doc** — Task 7.
- **Shared memory wiring** — Embedded in CLAUDE.md template (Task 5) and `_base-agent.md.tmpl` (Task 8); orchestration described in SKILL.md phases (Tasks 14-16).
- **Wiki integration → scan, matching, CLAUDE.md, agent file, portability** — Task 4 (reference) + Task 14 Phase 1 step 7 (scan) + Task 5 (CLAUDE.md section) + Task 8 (agent section) + Task 14 Phase 2 Q3 (portability).
- **Edge cases → existing-file policy** — Task 14 Phase 2 Q4 + Task 16 Phase 4 merge rules.
- **Edge cases → re-running** — Task 17.
- **Edge cases → portability beyond wiki** — Task 14 Phase 1 step 5 (squad URL env var).
- **Edge cases → detection failure** — Task 17.
- **Edge cases → register_project collision** — Task 16 Phase 5 step 2 + Task 17.

No gaps identified.

### 2. Placeholder scan

Scanned for: TBD, TODO, FIXME, "implement later", "add appropriate X", "similar to Task N", "fill in details".

None found in task bodies. The `{{PLACEHOLDER}}` markers in template content are intentional and not plan placeholders.

### 3. Type / name consistency

Canonical placeholder names are defined once in the File Structure section. All task bodies use names from that table. Spot-check:

- `{{PROJECT_NAME}}` — used in Task 5 (CLAUDE.md), Task 7 (plan doc), Task 9-13 (agent templates). Consistent.
- `{{SQUAD_COORDINATOR_URL}}` — Task 5, Task 6, Task 7, Task 14. Consistent.
- `{{WIKI_ROOT}}` — Task 5, Task 7, Task 8, Task 14. Consistent.
- `{{AGENT_NAME}}` vs `{{AGENT_NAME_TITLE}}` — Task 7 defines both. Task 7 is the only consumer. Consistent.
- `{{SEQ_DETECTED}}` — Task 6 uses it; Task 14 Phase 1 step 8 sets it. Consistent.

No mismatches found.

### 4. Scope check

Plan produces a working skill on its own. Tasks 18-19 verify against two real fixtures. Single implementation effort; does not need decomposition.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-22-claude-experience-bootstrap-skill.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
