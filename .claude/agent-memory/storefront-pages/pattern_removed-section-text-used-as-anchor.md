# Pattern: a removed section's text may be load-bearing in unrelated tests

When a "removal sweep" brief enumerates exact tests to delete/update, it may still miss a
test where the removed component's user-facing string was reused as a **mount-order
anchor** rather than as an assertion about that component itself.

## Concrete case

Loyalty's `'shows the shopping CTA and gate summary for a PrePointsGate customer'` test
(kept as-is in the Task 1 brief — not in its delete/update list) contained:

```ts
// BenefitsTab mounts only after the customer resolves; wait for its earn section
// so the card-absence check below is meaningful rather than racing the mount.
expect(await screen.findByText('How you earn points')).toBeInTheDocument();
expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument();
```

`'How you earn points'` was `EarnPointsTab`'s `SectionHeader` text. It had nothing to do
with what the test was actually verifying (`TierProgressCard` absence) — it was only there
to force a wait for the slower `customerQuery` before the negative assertion (see
`pattern_negative-assertion-race.md`). Deleting `EarnPointsTab` turned this into a
permanently-failing `findByText`, even though the brief's test-sweep step never mentioned
this test by name.

## Takeaway

After finishing a brief's enumerated test deletions, `grep` the *whole* page test suite
(not just the tests explicitly touched) for the removed component's rendered strings
(`SectionHeader` text, button labels, etc.) before calling the sweep done — some hits will
be assertions-about-the-thing (safe, already covered by the brief) but others will be
synchronization anchors borrowed by unrelated tests. Replace the anchor with a
customer/data-dependent string that's still guaranteed to render (e.g. `/points
available/` — driven by the same `customerQuery` as the deleted section, but not owned by
it), keeping the comment explaining *why* the anchor exists.

Source: Task 1 of the Loyalty "My benefits" redesign (earn-rules/tiers/memberships removal
sweep), `src/pages/Loyalty/index.test.tsx`.
