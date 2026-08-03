# Storefront-Shared Memory

Cross-session learnings for the `storefront-shared` role. Add entries as you discover patterns, gotchas, or workflows worth preserving.

## Entries

### `.claude/agent-memory/` in the main checkout is NOT the same file as the worktree's copy

Git worktrees do not share `.claude/` — it's a separate, untracked directory per checkout/worktree,
not a symlink. If you're working in a worktree (e.g. `.claude/worktrees/<name>/`), always use the
absolute path *inside that worktree* for `.claude/agent-memory/...` and `docs/plans/...`. Reading
or writing the main checkout's copy by using a path without the `.claude/worktrees/<name>/` prefix
is a real write to a directory you were told never to touch (it may hold a parallel agent's WIP).
Double-check the full absolute path before the first read/write of a session, not just after
being told the worktree path once at the top of the task.

### Full-suite `yarn test --run` (no path) is flaky under load — don't trust it for verification

Running the entire suite unfiltered produced ~110+ failures scattered across many unrelated pages
(CompanyOrderList, MyOrders, Invoice, QuickOrder, QuoteDraft, QuotesList, Registered,
ShoppingListDetails, UserManagement, etc.) even on a clean, unmodified tree (`git stash` + rerun).
The *specific* failing subtests differed between two consecutive runs of the identical code —
the signature of resource/timing contention under full parallel load, not a deterministic
regression. Isolated/scoped runs (`yarn test --run src/pages/X`) are reliable; the unfiltered
full run is not, on this machine at least. To verify a cross-cutting change didn't regress
something: run the specific affected suites, and if you must sanity-check the full suite, diff
failure lists against a `git stash`'d same-conditions baseline rather than expecting green or
trusting a single count.

### `yarn lint:knip` requires a cross-file reference, not just intra-file usage

A newly-exported interface/type used only as a parameter/return type within its own defining
file is still flagged as an "unused export" by knip — it wants at least one import from another
file. If a task brief says to export a type "because file X passes one in" but X only consumes
it implicitly (e.g., through an untyped `any` GraphQL response), that's not enough for knip.
Fix: give it a real consumer — e.g., annotate the untyped value at its call-site boundary with
`as TheType | undefined` where it crosses into the typed function. This satisfies knip without
inventing speculative usage elsewhere, and documents the intended shape at the untyped/typed
boundary (a pattern already used in `loginInfo.ts` for other fields, e.g.
`data.authorization.result.token as string`).

### `simple-import-sort` sorts `@/pages/Loyalty/api` before `@/pages/Loyalty/loyaltyLanding`

Plain alphabetical within the same import group — `api` < `loyaltyLanding`. When a brief's
example code shows imports in a different order than alphabetical, follow ESLint's sort, not
the brief's literal line order; the content is what's load-bearing.

### `Customer` type changes cascade beyond the "grep for the type name" set

Adding a required field to `types/company.ts` `Customer` surfaced two `tsc` errors not in
`grep -rln ": Customer"` results: page-local inline `builder<Customer>(...)` factories defined
directly inside `*.test.tsx` files (`AccountSetting/index.test.tsx`, `ShoppingLists/index.test.tsx`),
separate from the shared `tests/storeStateBuilders/companyStateBuilder.ts`. `tsc --noEmit` after
the type change is the reliable way to find every construction site; don't rely on grep alone.

### Two unrelated `GlobalState` types share a name — `tests/storeStateBuilders`'s builder is the wrong one for `routeList.ts`

`@/store/slices/global`'s `GlobalState` (the Redux slice, built by `buildGlobalStateWith` in
`tests/storeStateBuilders`) and `@/shared/global/context/config`'s `GlobalState` (the legacy
Context state, still the parameter type of `getAllowedRoutesWithoutComponent` and
`getAllowedRoutes`) are two structurally disjoint interfaces that happen to share a name. Passing
`buildGlobalStateWith({})` (the slice builder) where the context-config `GlobalState` is expected
fails `tsc` — it's missing ~20 required properties (`quoteConfig`, `isAgenting`, `storefrontConfig`
callers actually read, etc.), it is not just a "types are close enough" warning. For tests of code
that reads the context-config `GlobalState` (routeList.ts, routes/index.tsx, HeadlessController),
build off the real `initState` export from `@/shared/global/context/config` instead — it's already
fully and correctly typed, so `builder<GlobalState>(() => initState)` gives a genuine, cast-free
builder. See `B3Nav.test.tsx`'s locally-scoped `buildGlobalContextWith` for the established
in-file-builder precedent for this same type (used there as `Partial<GlobalState>` for
`renderWithProviders`'s `initialGlobalContext`, which is a different, weaker need than a
direct function call requiring the full type).

### `vi.mock('@/store')` (global, in `tests/setup-test-environment.ts`) resets the singleton store before every test

`src/store/__mocks__/index.ts` calls `setupStore()` fresh in a `beforeEach` and points the mocked
`store` getter at it, so any test that calls `store.dispatch(...)` directly against the `@/store`
singleton (imported via `import { store } from '@/store'`) — without going through
`renderWithProviders` at all — is safe from cross-test leakage; each test starts from a clean
default store already. This makes "prime the singleton store by dispatching, then call a function
that reads `store.getState()` internally" (e.g. `getAllowedRoutesWithoutComponent`) a legitimate,
already-isolated unit-test pattern, not something that needs `renderWithProviders`/rendering a
component to be safe.
