# A page root under `B3Spin` must claim its own width, or it collapses on mobile

`B3Spin` renders its children inside `SpinContext` (`src/components/spin/styled.ts`),
which is `display: flex` in the default **row** direction (`isFlex` defaults to `true`).
So the page's own root element is a flex *item*, not a block box, and with no width or
`flex` of its own it resolves to `flex: 0 1 auto` / `width: auto` and sizes to its
content.

On desktop this is invisible: `B3Layout`'s content column is `flex: 1` with
`maxWidth: 1450px`, so there is plenty of room and the content-sized page still looks
full width. On mobile it is not: `B3MobileLayout` puts `children` in
`<Box sx={{ flex: 1, display: 'flex' }}>` inside a `height: 70vh` column, so a
content-sized page shrinks to the width of its own longest text run — cards and rows
collapse into a narrow ragged strip against the left edge.

The two pages that render correctly on mobile both declare it explicitly:

- `src/pages/PaymentMethods/index.tsx` — `{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }`
- `src/pages/Loyalty/index.tsx` — the same plus `pb: { xs: 15, md: 0 }` for host-page overlays

**Rule for any new page:** the element directly inside `<B3Spin>` needs at least
`{ flex: 1, width: '100%' }`. Prefer that minimal pair over copying
PaymentMethods/Loyalty wholesale — adding `display: flex; flexDirection: column` also
turns every child into a flex item, and because the mobile column *is* height-constrained
(`70vh`), those children pick up `flex-shrink: 1` and can be squashed vertically. If the
existing markup assumes normal block flow (margins, a table, a list of cards), leave the
root a block box and only claim the width.

## Testing it

jsdom performs no layout, so nothing can assert a *rendered* width — but a static
(non-media-query) `sx` value does reach `getComputedStyle`, because emotion injects a real
class and jsdom cascades simple class selectors. `toHaveStyle` therefore works:

```tsx
expect(screen.getByTestId('favorites-page')).toHaveStyle({ width: '100%' });
```

This is the same situation as the collapsed-accordion entry — jsdom *does* apply
emotion-injected CSS here. What still does not work is anything behind a media query
(`sx={{ pb: { xs: 15, md: 0 } }}`): jsdom never matches media rules, so the responsive
branch is unobservable. Assert the unconditional declarations only.

`data-testid` on the page root is the practical hook (precedent:
`data-testid="quick-add"` on a `width: 100%` Box in `QuickOrder/components/QuickAdd.tsx`,
`data-testid="actions"` in `CompanyHierarchy/components/CompanyTableRowCard.tsx`).
A presence-only mobile test will **not** catch this class of bug — `index.mobile.test.tsx`
for Favorites asserted name/SKU/price/buttons and passed throughout.

Discovered on the Favorites mobile-layout fix (2026-09-10): the page shipped with a bare
`<Box>` under `B3Spin` and the user reported the UI "does not do well on mobile". Verified
by adding the `toHaveStyle` assertion first (red), then the `sx` (green), then reverting
the `sx` again to confirm the test can fail.
