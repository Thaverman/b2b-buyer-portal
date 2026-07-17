---
title: "MSW test server (tests/mockServer.ts) holds unhandled requests on a never-resolving promise despite onUnhandledRequest:'error' — unmocked fetches HANG (react-query stays pending → data??[] fallback), so a new query needs no default handler and won't break existing tests"
type: gotcha
created: 2026-07-17
updated: 2026-07-17
lastVerified: 2026-07-17
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a5a84fefe5205583b3b19f2
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: tests/mockServer.ts
    symbol: startMockServer           # default handler http.all('*', () => new Promise<never>(() => {})) holds unmatched requests forever; listen({ onUnhandledRequest: 'error' })
tags: [memory, b2b-buyer-portal, b2b, testing, msw, react-query, test-infra]
---

# MSW test server hangs unhandled requests (does not error)

`apps/storefront/tests/mockServer.ts` builds the shared MSW server with a
catch-all default handler:

```ts
const server = setupServer(
  // hold all http requests that aren't mocked
  http.all('*', () => new Promise<never>(() => {})),
);
// … server.listen({ onUnhandledRequest: 'error' })
```

That default handler **never resolves**. So even though the server runs with
`onUnhandledRequest: 'error'`, a request with no test-specific `server.use(...)`
handler does **not** raise — it **hangs forever**. The `'error'` policy only fires
for requests that match no handler at all, and the `http.all('*')` catch-all means
every request matches.

**Consequence:** a `useQuery` hitting an unmocked endpoint stays
`isFetching`/pending indefinitely; `query.data ?? fallback` keeps the fallback
(usually `[]`). The feature degrades quietly rather than the test erroring.

**Practical upshot when adding a new shop-scoped query** (e.g. the memberships
tab's `membershipsQuery` hitting `/shop/memberships`): you do **not** need to add
a default handler to `mockServer.ts` or to every existing test. Existing tests
that don't mock the new endpoint just leave the new query pending → empty
fallback → any UI gated on that data (e.g. an auto-hidden tab) stays hidden →
**zero regression**. Add a `server.use(http.get(…))` only in the new tests that
assert the feature. (This is exactly how the Loyalty page already tolerates tests
that omit `mockTiers`.)

**Caveat:** a hang can mask a genuinely-missing mock. If a test times out waiting
for content that should render, first check you registered the endpoint's handler.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-memberships-tab-read-only]]
