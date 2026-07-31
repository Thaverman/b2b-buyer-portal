# Docs Memory

Cross-session learnings for the `docs` role. Add entries as you discover patterns, gotchas, or workflows worth preserving.

## Entries

- **Design-spec sync during in-flight implementation**: when a spec under
  `docs/superpowers/specs/` describes a data shape that a parallel
  implementation task is actively changing, do a surgical text sync (not a
  rewrite) of only the described shape/behavior sentences — leave everything
  else, including unrelated concurrent edits already sitting uncommitted in
  the same file, untouched. Match edits by distinctive surrounding text, not
  line numbers, since other agents may have already touched the file. Never
  touch the corresponding `docs/superpowers/plans/*.md` execution log for
  already-completed work — plans are historical records, specs are the living
  doc. Example: 2026-07-30 sync of
  `docs/superpowers/specs/2026-07-27-loyalty-smart-rewards-redesign-design.md`
  FAQ shape (flat `items[]` → nested `sections[].items[]` with `bullets`,
  `getFaqItems()` → `getFaqSections()`).
