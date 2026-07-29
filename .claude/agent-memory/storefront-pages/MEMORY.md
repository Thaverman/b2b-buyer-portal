# Storefront-Pages Memory

Cross-session learnings for the `storefront-pages` role. Add entries as you discover patterns, gotchas, or workflows worth preserving.

## Entries
- [Dropped tab-click race](pattern_dropped-tab-click-race.md) — collapsing tabs and dropping a now-redundant "click into tab" step can unmask a real render race between two independently-loaded queries; use `findByText`/`findAllByText` on the specific gated content, not a proxy assertion on unrelated always-visible text.
- [Negative-assertion race](pattern_negative-assertion-race.md) — a synchronous `queryByText(...).not.toBeInTheDocument()` right after an unrelated `await` can pass even when the guard it's meant to lock is deleted, if the "absent" content is gated behind a slower, independent `useQuery`; verified this empirically on Loyalty's PrePointsGate/`TierProgressCard` test.
- [Removed-section text used as anchor](pattern_removed-section-text-used-as-anchor.md) — a removal-sweep test brief can miss a test where the deleted component's string was reused elsewhere purely as a mount-order wait anchor, not as an assertion about that component; grep the whole page test suite for the removed component's strings before calling a sweep done.
