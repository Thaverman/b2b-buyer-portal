# Pattern: dropping a "click into tab" step can unmask a real render race

When collapsing several tabs into one (e.g. Loyalty's `overview|earn|tiers|memberships` ->
`benefits`), the natural test-sweep move is: wherever a test only clicked a tab to *reach*
content that is now part of the default tab, drop the click and assert directly.

That's usually safe, but watch for content whose visibility itself depends on a **second**
piece of async data (e.g. an earn-rule gated by `customer.currentLoyaltyTierId`, where
`customer` loads via its own `useQuery`). Previously, the click into a lazily-mounted tab
gave the async chain (JWT -> digest -> customer) enough wall-clock time to settle *before*
the gated component's own query (`fetchEarnRules`) fired and filtered. Once the component
is mounted unconditionally from render #1, its query can resolve and filter using
`customer === undefined` (i.e. `null` tier) on the first pass, then re-filter once customer
data lands a tick later.

Symptom: `screen.getByText(...)` / `getAllByText(...)` (synchronous) finds 0 matches even
though `await screen.findByText(...)` on an *unrelated, always-visible* sibling had already
resolved — the two pieces of gated content settle on different renders, and the always-visible
text isn't a reliable "everything has settled" signal.

Fix: use `await screen.findByText(...)` / `findAllByText(...)` on the specific gated content
itself, not a proxy assertion on nearby unconditional content. Don't reach for `waitFor` +
`getByText` when `findByText` already does the polling.

Source: Loyalty Task 4 (`BenefitsTab` four-tab restructure) —
`'shows only the earn rules for the customer current tier'` in
`src/pages/Loyalty/index.test.tsx`.
