# Knip flags an exported type as unused when its only consumer switches to a wrapper type

When restructuring a flat shape into a nested one (e.g. `LoyaltyFaqItem[]` ->
`LoyaltyFaqSection[]` with `LoyaltyFaqSection.items: LoyaltyFaqItem[]`), the inner
type (`LoyaltyFaqItem`) can end up used only *inside* the api file that defines
it — its former external consumer (a page component) now imports the outer
wrapper type instead and no longer references the inner type by name.

`yarn lint:knip` treats this as an "Unused exported types" finding even though
the type is still referenced (just not imported elsewhere). Fix: drop the
`export` keyword and follow the file's existing convention for module-internal
types — this codebase already has the idiom in `api.ts` files:

```ts
// Module-internal: knip fails the build on unused exports, so this file only
// exports what other files actually import.
interface LoyaltyConfig { ... }
```

Grep the target file for that exact comment before assuming a type must stay
exported just because a task brief says "X gains a field" — the brief describes
the shape, not necessarily its export visibility. Verify with `yarn lint:knip`
after any shape-restructuring change that removes a component's direct import
of a previously-exported type.

Source: Loyalty FAQ tab nested-sections restructure (2026-07-30).
