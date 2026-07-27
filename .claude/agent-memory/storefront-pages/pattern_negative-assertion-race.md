# Pattern: a synchronous negative assertion after an unrelated `await` can be a no-op

Related to [pattern_dropped-tab-click-race.md](pattern_dropped-tab-click-race.md) but for
*absence* assertions specifically, where `findByText` isn't an option (it waits for something
to appear; it can't prove something never will).

## The trap

```ts
mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
mockTierProgress(buildTierProgressWith({ targetKind: 'PrePointsGate', summary: '...' }));

renderWithProviders(<Loyalty />, customerPreloadedState);

expect(await screen.findByRole('link', { name: 'Start shopping to earn points' })).toBeInTheDocument();
expect(screen.getByText('...summary...')).toBeInTheDocument();
expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument(); // <- looks solid, isn't
```

In Loyalty's `index.tsx`, the CTA and gate summary in `LoyaltyHero` are driven only by
`tierProgressQuery` (keyed off the Redux `customer.id`, no dependency on the digest/JWT
chain). `TierProgressCard` — the thing the final assertion is trying to rule out — lives
inside `BenefitsTab`, which bails to `null` until `customerQuery` (JWT → digest → Launcher
`/customer`) resolves. `tierProgressQuery` reliably settles before `customerQuery` because
it skips that chain entirely.

Result: `await screen.findByRole(...)` resolves as soon as `tierProgressQuery` settles.
`BenefitsTab` (and therefore `TierProgressCard`) has very likely **not mounted yet** at that
point, so `queryByText(/Progress to/)` finds nothing — not because the `targetKind !==
'NextTier'` guard in `TierProgressCard.tsx` worked, but because the component gating on
`customer` hasn't rendered at all yet. **Verified empirically:** deleting the guard
(`if (!progress || progress.targetKind !== 'NextTier')` → `if (!progress)`) and re-running
this exact test — alone or as part of the full file — still passes 100% of the time. The
assertion is a false sense of security.

## How to actually lock the invariant

Force everything relevant to settle first, anchored on content that specifically requires
`customer` (the slower query) to have loaded — not a proxy on unrelated always-visible text:

```ts
await waitFor(() => expect(screen.getByText(/Progress to/)).toBeInTheDocument()); // proves guard is OFF
```
or, to test the guard being ON, anchor on something customer-dependent that's guaranteed to
render regardless of the guard (e.g. the points-available line, or the "My benefits"
`SectionHeader` — careful: that text string is shared with the Tab label, so it's already in
the DOM before `BenefitsTab` mounts; pick a string unique to the tab body) before asserting
the negative.

## Takeaway

When a page composes multiple independently-gated `useQuery` calls, an `await
findBy...`/`getBy...` pair proves only that *its own* dependency chain settled — never
assume it proves siblings gated on a *different* async dependency have also settled. For
absence assertions, wait for a customer-dependent (i.e. same-or-slower query) marker before
asserting the negative, or the test will pass regardless of whether the code under test is
correct.

Source: Loyalty final-review fix wave, `'shows the shopping CTA and gate summary for a
PrePointsGate customer'` in `src/pages/Loyalty/index.test.tsx` — task explicitly required
verifying red-then-green by removing/restoring the `TierProgressCard` guard; the guard
removal did **not** turn the test red as expected.
