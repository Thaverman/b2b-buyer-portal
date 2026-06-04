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
