# Collapsed MUI Accordion content: `getByText` finds it, `getByRole` does not

MUI's `Accordion`/`Collapse` keeps a collapsed panel's DOM mounted (good — `getByText`/
`findByText` can assert on answers and bullet lists without ever clicking to expand).
But once the collapse transition settles into the `exited` state with
`collapsedSize: '0px'`, `Collapse` adds a class that sets `visibility: hidden` on the
whole collapsed subtree (`@mui/material/Collapse/Collapse.js`, the `MuiCollapse-hidden`
class).

`@testing-library/dom`'s `getByRole`/`findByRole` (and `getAllByRole`) exclude any
element whose computed `visibility` is `hidden` by default (`isInaccessible` in
`role-helpers.js`). So any interactive element — critically, `<a href>` links rendered
via MUI `<Link>` — inside a collapsed `AccordionDetails` is invisible to role queries
even though `getByText` finds the same node's text content just fine. Verified this
empirically (jsdom does compute `visibility: hidden` correctly from the emotion-injected
CSS class here, this isn't a "jsdom doesn't apply CSS" situation).

Passing `{ hidden: true }` to the role query does **not** rescue a `name`-filtered query:
it only bypasses the outer "is this whole element inaccessible" filter, but
`dom-accessibility-api`'s accessible-name computation *separately* treats
`visibility: hidden` content as contributing an empty string to the name. So
`getAllByRole('link', { hidden: true })` (no name filter) will list the hidden anchors,
but `getAllByRole('link', { hidden: true, name: '...' })` still finds zero. There is no
query-option workaround for a name-filtered role query — you must actually expand the
accordion item (click its `AccordionSummary`/summary text) before the role/name query.

Practical rule for FAQ/accordion-style content tests in this codebase:
- Copy/bullet-list assertions: use `getByText`/`findByText`, no need to click anything.
- Any assertion that needs `getByRole('link'|'button'|..., { name: ... })` on content
  that lives inside a collapsed accordion item: click that item's summary text first
  (`await user.click(screen.getByText('<question>'))`), one explicit awaited click per
  item — don't try to route around it with `.closest('a')`/node access, which trips
  `testing-library/no-node-access` (enabled via `plugin:testing-library/react`), and
  don't add `defaultExpanded` to production code just to make a test's role query work
  (that's a real UI-behavior change to suit a test).

Discovered on the Loyalty FAQ hardcoding task (2026-08-11) when a brief's own test code
tried `findAllByRole('link', { name: REP_EMAIL })` against a collapsed-by-default
Accordion answer with no expand step. Confirmed via temporary (reverted before commit)
diagnostics logging `getComputedStyle(el).visibility` on the anchors and comparing
`getAllByRole('link', {hidden:true})` (found 5) vs. the same call with a `name` filter
(found 0).
