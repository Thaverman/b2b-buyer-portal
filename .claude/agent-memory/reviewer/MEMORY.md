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

### Task-sliced plans: page-local modules with no consumer fail the lint gate
When a plan lands an API/util module (Task 1) before its consuming page (Task 2), BOTH `lint:knip` (`exports: "error"` — exports unused outside tests) and `lint:dependencies` (`no-orphans` — the rule's `from.pathNot` excludes test files, so a co-located `.test.ts` does NOT make a module non-orphan) fail. Flag as Critical-for-merge but note the remedy: merge with the consumer, defer the unused exports, or land both tasks in one PR. Seen on feature/payment-methods-page (`src/pages/PaymentMethods/api.ts`).

### knip vs depcruise treat test-only consumers differently
knip's vitest integration treats `*.test.ts(x)` as entry files, so exports consumed ONLY by tests (e.g. `setDefaultStoredInstrument`/`deleteStoredInstrument` in PaymentMethods api.ts) PASS `lint:knip`. dependency-cruiser's `no-orphans` excludes tests as dependents, so a module consumed only by tests/nothing still FAILS `lint:dependencies`. Consequence on task-sliced plans: the orphan error migrates up the chain — Task 1 flagged `api.ts`; Task 2 (page consumes api.ts but page not yet in routeList) flags `src/pages/PaymentMethods/index.tsx` instead. Resolves when the route wiring task lands. Baseline noise to keep filtering: `src/utils/analytics.ts` (knip unused file + depcruise orphan).

### Mutation tests: assert a POST-state that differs from the PRE-state
On feature/payment-methods-page (set-as-default, Task 3): the "re-renders from the refreshed list" test passed even if the `setQueryData` cache write was deleted — every post-click assertion (row text already on screen, `Default` chip count = 1, snackbar spy) was also true pre-mutation or only proved `onSuccess` ran. Checklist for any useMutation test: (1) first `waitFor` an observable that REQUIRES the mutation to settle (toast spy / moved element), never sync-assert request capture right after `user.click` (two MSW round-trips race userEvent's macrotask hops); (2) then assert UI that is ONLY true after the cache write (e.g. the action button moved to the other row, `within(row)` chip placement). Applies to the upcoming delete-mutation task on the same page.
