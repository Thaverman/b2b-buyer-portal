# `react/no-array-index-key` fires on inline index keys even when index-qualified keys are the deliberate, correct choice

Some list data intentionally needs a position-qualified React key (e.g. theme/CMS
config that can repeat identical text across items — `key={`${index}-${text}`}`
guards against key collisions that plain `key={text}` would cause). But writing
that key inline inside the same `.map((item, index) => ...)` call that returns
the JSX trips `react/no-array-index-key`, even though the rule's real target
(reordering-unstable pure index keys like `key={index}`) isn't what's happening.

Fix: precompute the key in an earlier, non-JSX-returning `.map()` (a plain data
transform), then reference it via property access in the JSX-returning map.
ESLint's rule only pattern-matches the index parameter used directly inside a
`key=` prop within the same callback — it doesn't flag `key={item.key}` sourced
from a prior transform, even though the value is index-derived either way.

`FaqTab.tsx` already does this for sections/questions:

```ts
const keyedSections = sections.map((section, sectionIndex) => ({
  ...section,
  key: `${sectionIndex}-${section.title}`,
  items: section.items.map((item, itemIndex) => ({
    ...item,
    key: `${itemIndex}-${item.question}`,
    // bullets need the same treatiment — see below
    bullets: item.bullets.map((bullet, bulletIndex) => ({
      key: `${bulletIndex}-${bullet}`,
      text: bullet,
    })),
  })),
}));
// ...
{item.bullets.map((bullet) => (
  <Typography key={bullet.key}>{bullet.text}</Typography>
))}
```

Writing `key={`${bulletIndex}-${bullet}`}` directly inside
`item.bullets.map((bullet, bulletIndex) => <Typography key={...}>)` fails lint;
lifting the index-qualified key into the same precompute step used for
sections/items (shape it as `{ key, text }` objects) passes.

Source: Loyalty FAQ bullet-list key fix (2026-07-30), following up on a reviewer
finding that bullets were keyed by raw text (`key={bullet}`) unlike sections/
questions, which risked React key collisions on repeated bullet text.
