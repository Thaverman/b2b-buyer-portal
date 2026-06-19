# `.memory/` — repo-local durable notes

Durable findings produced by Claude Code agents while working in this repo. One
of three sinks (others: MongoDB, the Obsidian vault). The repo copy is a
**build-time snapshot** — not authoritative — that exists so notes travel with
the branch in git history and the cleanup agent can diff them against the code
in *this same checkout*.

## Placement

One `.memory/` folder at the **git repo root**. Note:

- **`carousel-flex`** is a single repo containing two modules (`widget-builder`,
  `dynamic-banner`). It gets **one** `.memory/` at the `carousel-flex` root; set
  the `module` frontmatter field to say which unit a note concerns.
- **`b2b-checkout`** (Nx, ~45 packages) and **`b2b-buyer-portal`** (Turborepo:
  `apps/storefront` + `packages/{ui,store,b3global}`) are internally monorepos but
  still **one git repo each** → one `.memory/` at the repo root. Use the `package`
  field inside `codeRefs` to point into the right package (e.g. `packages/core`,
  `apps/storefront`).

```
.memory/
  b2b-checkout--single-page-state-machine.md
  _index.md            # optional: list of notes in this repo
```

Filenames are disambiguated with a `<repo>--` (and where useful `<project>--`)
prefix so two branches can't clobber each other on promotion.

## File format

Identical frontmatter to the vault note, so promotion is a copy not a rewrite.
See `Note Settings/memory-note.md`. Minimum: `title`, `repo`, `storeHash`,
`area`, `memoryType`, `durable: true`, `project`, `status`, and at least one
symbol-anchored `codeRefs` entry.

## Commit convention

Commit `.memory/` changes in the **same PR** as the code they describe — that
lockstep is what lets the cleanup agent detect drift.

## Forked repos

`b2b-checkout` and `b2b-buyer-portal` are forks. Upstream has no `.memory/`, so
the folder never conflicts on an upstream merge; it will simply show in diffs
against upstream. If you prefer it not to, keep `.memory/` on your feature
branches only. Either way, do not gitignore it on the branch you want the
cleanup agent to read.

> Do not hand-delete notes here. Obsolete notes are flagged by the cleanup agent
> and resolved through the vault archive workflow.
