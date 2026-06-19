# Reviewer Memory

Cross-session learnings for the `reviewer` role. Add entries as you discover patterns, gotchas, or workflows worth preserving.

## Entries

### Local environment baseline noise (separate from real defects)
When reviewing in the local Windows env, three classes of noise are PRE-EXISTING / environmental and must NOT be reported as defects of the code under review:
- **`yarn tsc --noEmit` flood of `TS2554: Expected 0 arguments, but got 2` and `vi implicitly any` (TS7005) in `.test.tsx`/`tests/`/`__mocks__`.** The Vitest/test global typings don't resolve, so `it()/describe()/renderWithProviders()` look 0-arg. Affects EVERY test file. Verify production `src/` (non-test) has 0 tsc errors instead.
- **ESLint `prettier/prettier — Delete ␍` warnings.** From `core.autocrlf=true` (working tree CRLF) while files are committed as LF (`git ls-files --eol` → `i/lf`). Filter these out; check for any non-`Delete ␍` warning/error.
- **`yarn test` fails to even collect: `ERR_REQUIRE_ESM` in `html-encoding-sniffer`/`@exodus/bytes`.** Caused by running Node 20 locally when repo requires Node >=22.16 (`.nvmrc`). Blocks ALL suites equally; not a feature defect. Review test design by inspection instead.
- **`lint:dependencies` + `lint:knip` both flag `src/utils/analytics.ts` (orphan).** Pre-existing from the Manage Subscriptions commit; unrelated to most feature branches.

To isolate real issues: run `eslint <files>` and grep-out `Delete \``; run `tsc` and grep-out test files + `vi`/TS2554; confirm the feature's own util isn't in the knip/depcruise orphan list (proves its exports are consumed).

### Commit-subject gate
`commit-validation.json` here only lists `scopes`; the enforced SUBJECT format lives in CONTRIBUTING.md + the bigcommerce/validate-commits tool: `type: TICKET-### Short description` (JIRA ticket, or GitHub issue # for community). Commits with NO ticket token (e.g. `feat: add order-id obfuscation util`) are non-compliant — flag them. They are usually fixable by squash+reword before merge, so Important rather than Critical when the code itself is sound.

### B3Dialog confirm-dialog review checklist
`src/components/B3Dialog.tsx`: `loading` disables ONLY the right/confirm button (line ~177). The left/cancel button is never disabled, and Escape funnels through `handleCloseClick` -> `handleLeftClick` (backdrop clicks are swallowed). So in destructive-confirm usages, "cancel during pending" closes the dialog while the mutation keeps running — flag if the caller's `handleLeftClick` lacks an `isPending` guard. Double-fire of confirm is NOT possible (React 18 flushes the pending re-render between discrete clicks; MUI disabled = pointer-events none). DOM order for tests: the Dialog portals into B3Dialog's own in-tree container Box, so dialog buttons always come AFTER page content in document order; `getAllByRole(...)[length-1]` is deterministic, but `within(getByRole('dialog'))` is the clearer selector.

### Verify the diff base is the merge-base before reviewing "changed files"
A two-dot range like `git diff <base>..<tip>` silently includes REVERSED changes from any commits on the base side that aren't ancestors of the tip (e.g. a phantom `.gitignore` deletion when the branch forked one commit before `<base>`). Always run `git merge-base <base> <tip>` first, or use three-dot `<base>...<tip>`; review only the three-dot file set. Also: this machine's full vitest run is flaky under parallel load (tests near the 5s local timeout, esp. QuoteDraft/Invoice/ShoppingLists*) — arbitrate new-vs-baseline failures by isolated re-runs (`yarn vitest run <file>` or `-t "<name>"`), and note `yarn lint` short-circuits after depcruise, so run `lint:eslint`/`lint:knip` individually when depcruise has the known analytics.ts orphan.
