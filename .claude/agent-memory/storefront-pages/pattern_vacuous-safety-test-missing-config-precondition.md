# Vacuous safety test from a missing config precondition

When a spec/brief hands you exact test code for a new "gate" argument on a
function whose *other* early-return branches can already short-circuit to the
same observable result, verify the branch you're adding is actually the one
that fires — don't trust the given test literally just because it's provided
verbatim.

Concrete case: `prefetchLoyaltyLanding(customerId, isAgenting, isLoyaltyEntitled)`
bails via `!isTierProgressAvailable() || isAgenting || !customerId || !isLoyaltyEntitled`.
A brief-supplied test called it with no `window.BC_CONTEXT.loyalty.progressSite`
configured (so `isTierProgressAvailable()` was already `false`) and asserted
`resolveLoyaltyLanding()` resolves `false`. That assertion is true **whether or
not** the new `!isLoyaltyEntitled` term exists — the earlier OR-branch already
guarantees it. Proven empirically: reverting only the third-param/`!isLoyaltyEntitled`
change left the test green.

Fix: configure the endpoint precondition (here, `withProgressSite()` + an MSW
handler with a call-tracking spy) so that if the new gate is missing, the code
falls through to the real network call and the test's `expect(requests).not
.toHaveBeenCalled()` genuinely fails. Model the strengthened test on the
codebase's existing analogous gate test (here, "does not call the endpoint
while masquerading") rather than inventing a new assertion style.

General rule: whenever a task brief tells you to "prove the new test fails
with the change reverted," actually do the revert-and-run for every new test,
not just eyeball the diff. A vacuous test passes at baseline too, so a normal
"run once, see red, add code, see green" loop will NOT catch this — you have
to specifically flip only the production line back and rerun that one test.
