# Storefront-Pages Memory

Cross-session learnings for the `storefront-pages` role. Add entries as you discover patterns, gotchas, or workflows worth preserving.

## Entries
- [Dropped tab-click race](pattern_dropped-tab-click-race.md) — collapsing tabs and dropping a now-redundant "click into tab" step can unmask a real render race between two independently-loaded queries; use `findByText`/`findAllByText` on the specific gated content, not a proxy assertion on unrelated always-visible text.
- [Negative-assertion race](pattern_negative-assertion-race.md) — a synchronous `queryByText(...).not.toBeInTheDocument()` right after an unrelated `await` can pass even when the guard it's meant to lock is deleted, if the "absent" content is gated behind a slower, independent `useQuery`; verified this empirically on Loyalty's PrePointsGate/`TierProgressCard` test.
