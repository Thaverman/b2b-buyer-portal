# Verify baseline lint redness with `git stash -u`, and prettier --fix is safe on brief-supplied verbatim code

Two related lint-time gotchas from the Loyalty membership-ladder task (Task 3):

## 1. Don't just eyeball a lint failure as "pre-existing" — prove it with `git stash -u`

`yarn lint:dependencies` / `yarn lint:knip` can fail on a file you never
touched (e.g. `src/utils/analytics.ts` reported as an unused/orphan file).
Before writing it off in a report as "known baseline redness," actually prove
it: `git stash -u` (stash tracked + untracked changes), rerun the failing
linter, confirm the same error appears on the clean tree, then `git stash pop`.
This is cheap (seconds) and turns "I assume this is pre-existing" into "I
verified this is pre-existing" — the difference matters when a reviewer asks.
Same technique works for `yarn lint:eslint` failures in files you never
`git status`-touched: cross-check with `git log -- <file>` to confirm the
error's origin commit predates your session.

## 2. A brief's "write this code verbatim" can still trip prettier — that's fine to auto-fix

A task brief that hands you exact code (including multi-prop destructured
function signatures or long inline object literals inside a single-line
`buildXWith({...})` call) may not match this repo's prettier line-width/wrap
rules exactly as transcribed. `eslint --max-warnings 0` will flag these as
`prettier/prettier` warnings even though the code is 100% semantically
correct and matches the brief. Running `eslint --fix` (or `yarn format`) on
just the affected file(s) resolves these safely — it only touches
whitespace/line-wrapping, never logic or strings. Confirm this by rerunning
`tsc --noEmit` and the affected test file afterward and checking the pass/fail
counts are byte-for-byte identical to before the fix. Don't skip the `--fix`
step just because "the brief said verbatim" — verbatim code content, not
verbatim whitespace, is the actual contract.
