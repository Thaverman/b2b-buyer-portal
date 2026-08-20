# Loyalty Theme-Page Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the buyer portal hand `/loyalty` off to the new Stencil Smart Rewards page behind a single host-config value, so the theme page can go live without a portal deploy and roll back by deleting a config key.

**Architecture:** One new optional key, `BC_CONTEXT.loyalty.themePageUrl`. A module-private reader in the Loyalty page's `api.ts` validates it (root-relative only — it feeds a navigation sink) and returns `''` when absent or unusable. `index.tsx` computes a `isHandingOff` flag from that value plus the existing `isAvailable` gate, disables every data query while handing off, navigates the top-level window, and renders the spinner it already uses for the pending-verdict state. Absent key = today's behavior, byte for byte.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query` v5, MUI v5, Vitest + jsdom, Testing Library, MSW, `vitest-location-mock`.

**Spec:** [docs/superpowers/specs/2026-08-13-smart-rewards-stencil-handoff-design.md](../specs/2026-08-13-smart-rewards-stencil-handoff-design.md) — §7 Cutover. Read it alongside this plan.

## Scope

This plan implements **§7 only**. Sections §1–§6 and §8–§9 of the spec describe
work in the SSW Stencil theme repository, which is a different codebase; they
are executed there, against the spec plus its appendices, and cannot be written
as tasks with real paths from here. Spec §12 carries the phased build order for
that side.

Explicitly **not** in this plan (spec §11): deleting the portal's Loyalty page,
folder, locale keys, route and test suite. That is a separate change, made after
the theme page is verified live on sandbox and production.

## Global Constraints

- All commands run from `apps/storefront/`, never the repo root.
- Node `>=22.16.0`, Yarn `1.22.22`.
- Do not add new violations of the project-wide-disabled ESLint rules. In
  particular: **no non-null assertions** (`!`) and no `any`.
- Imports: `lodash-es` only (never `lodash/xyz`); named imports from
  `@mui/icons-material`; use the `@/` and `tests/` aliases, not long relative
  paths.
- Test data comes from builders. Import every test utility from
  `tests/test-utils`, never from `@testing-library/*` or `msw` directly.
- `yarn lint:knip` fails the build on unused exports. `getThemePageUrl` must be
  consumed by `index.tsx` in the same task that exports it.
- Commit subject format: `type: TICKET-### Short description`. Use `B2B-0000`
  when no ticket exists, matching recent history on `dev`.
- `themePageUrl` is accepted **only** as a root-relative path (`/…`, and not
  `//…`). Anything else is logged and ignored. It is a navigation sink; this
  rules out `javascript:` URLs and off-origin redirects without an allowlist.
- The handoff is gated on the existing `isAvailable` (Stencil + configured +
  not masquerading + not explicitly unentitled). A masquerading rep or an
  unentitled customer is never navigated to the theme page.
- **Never hardcode the jsdom base URL in an assertion.** This suite's
  `currentJwtUrl` is `http://localhost:3000/...`, but that is the configured
  storefront API base, *not* the document origin — the jsdom origin is
  `http://localhost`. Capture `const { origin } = window.location;` before
  rendering and assert against a template, or capture `initialHref` and assert
  it is unchanged. `vitest-location-mock` (loaded in
  `tests/setup-test-environment.ts`) is what makes `window.location.href`
  writable and readable back.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/index.d.ts` | Window/host-config typing | Add `themePageUrl?: string` to the `BC_CONTEXT.loyalty` block |
| `src/pages/Loyalty/api.ts` | Loyalty data + host-config readers | Add `getThemePageUrl()` beside the existing banner-URL readers |
| `src/pages/Loyalty/api.test.ts` | Unit tests for the above | Add a `getThemePageUrl` describe block |
| `src/pages/Loyalty/index.tsx` | Page composition and gates | Compute `isHandingOff`, disable queries, navigate, early-return |
| `src/pages/Loyalty/index.test.tsx` | Page-level behavior tests | Add handoff tests |

No new files. The reader lives with the other host-config readers in `api.ts`
because it is the same concern (`getLoyaltyConfig()` access + validation +
`b2bLogger` on misconfiguration) and has exactly one consumer.

---

### Task 1: `getThemePageUrl` host-config reader

**Files:**
- Modify: `apps/storefront/src/index.d.ts` (inside `BC_CONTEXT.loyalty`, after `benefitsBannerUrl?: string;`)
- Modify: `apps/storefront/src/pages/Loyalty/api.ts` (append after `getBenefitsBannerUrl`)
- Test: `apps/storefront/src/pages/Loyalty/api.test.ts` (append after the `getBenefitsBannerUrl` describe block)

**Interfaces:**
- Consumes: the module-private `getLoyaltyConfig()` and the `b2bLogger` import already present in `api.ts`.
- Produces: `getThemePageUrl(): string` — a usable root-relative path, or `''`. Task 2 is its only consumer.

- [ ] **Step 1: Write the failing tests**

Append to `apps/storefront/src/pages/Loyalty/api.test.ts`:

```ts
describe('getThemePageUrl', () => {
  it('returns an empty string when the key is absent', () => {
    window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };

    expect(getThemePageUrl()).toBe('');
  });

  it('returns a root-relative path verbatim', () => {
    window.BC_CONTEXT = {
      loyalty: { shopKey, apiBase, appClientId, themePageUrl: '/smart-rewards/' },
    };

    expect(getThemePageUrl()).toBe('/smart-rewards/');
  });

  it('trims surrounding whitespace', () => {
    window.BC_CONTEXT = {
      loyalty: { shopKey, apiBase, appClientId, themePageUrl: '  /smart-rewards/  ' },
    };

    expect(getThemePageUrl()).toBe('/smart-rewards/');
  });

  it('ignores a blank value without logging', () => {
    window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, themePageUrl: '   ' } };

    expect(getThemePageUrl()).toBe('');
    expect(b2bLogger.error).not.toHaveBeenCalled();
  });

  it.each([
    ['an absolute URL', 'https://evil.example.com/smart-rewards/'],
    ['a protocol-relative URL', '//evil.example.com/smart-rewards/'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a bare relative path', 'smart-rewards/'],
  ])('ignores and logs %s', (_label, themePageUrl) => {
    window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, themePageUrl } };

    expect(getThemePageUrl()).toBe('');
    expect(b2bLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('is not a root-relative path'),
    );
  });
});
```

Add `getThemePageUrl` to the existing import list from `'./api'` at the top of
the file, keeping the list alphabetically sorted — it goes between
`getShippingCalculation` and `getTierAttributeId` (`getTh` sorts before `getTi`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/api.test.ts -t getThemePageUrl`
Expected: FAIL. TypeScript/Vitest reports `getThemePageUrl` is not exported from `./api`.

- [ ] **Step 3: Add the typing**

In `apps/storefront/src/index.d.ts`, inside the `BC_CONTEXT.loyalty` object,
directly after the `benefitsBannerUrl?: string;` line:

```ts
        /**
         * Root-relative URL of the Stencil Smart Rewards page. When set, /loyalty
         * hands off to it instead of rendering; absent = the portal renders as
         * today. Only a root-relative path is honored — see getThemePageUrl.
         */
        themePageUrl?: string;
```

- [ ] **Step 4: Write the minimal implementation**

Append to `apps/storefront/src/pages/Loyalty/api.ts`:

```ts
// Cutover switch (spec 2026-08-13 §7): when the theme ships its own Smart Rewards
// page, /loyalty hands off rather than rendering a second copy.
//
// Root-relative only. This value feeds a navigation sink, and the theme page lives
// on the storefront origin, so requiring a leading '/' (and rejecting '//', which is
// protocol-relative and therefore off-origin) rules out javascript: URLs and open
// redirects without maintaining an allowlist. A set-but-unusable value is a
// misconfiguration rather than an un-opted store, so it is logged — same posture as
// getTierAttributeId above.
export const getThemePageUrl = (): string => {
  const configured = getLoyaltyConfig()?.themePageUrl?.trim();
  if (!configured) {
    return '';
  }
  if (!configured.startsWith('/') || configured.startsWith('//')) {
    b2bLogger.error(
      `Loyalty: BC_CONTEXT.loyalty.themePageUrl ${JSON.stringify(
        configured,
      )} is not a root-relative path — ignoring it and rendering the portal page`,
    );
    return '';
  }
  return configured;
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty/api.test.ts -t getThemePageUrl`
Expected: PASS, 8 tests.

- [ ] **Step 6: Negative control — prove the tests can fail**

Temporarily change `startsWith('/')` to `startsWith('')` in the implementation
and re-run the command from Step 5.
Expected: the four `it.each` rejection cases FAIL. Then revert the edit and
re-run to confirm PASS again.

This step exists because tests written from a plan in this repo have shipped
vacuous more than once — a test that cannot fail is worse than no test, and the
only way to know is to break the implementation and watch it go red.

- [ ] **Step 7: Run the full Loyalty api suite and type-check**

Run: `yarn test --run src/pages/Loyalty/api.test.ts`
Expected: PASS, no regressions.

Run: `yarn tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/index.d.ts \
        apps/storefront/src/pages/Loyalty/api.ts \
        apps/storefront/src/pages/Loyalty/api.test.ts
git commit -m "feat: B2B-0000 Add themePageUrl host-config reader for the loyalty cutover"
```

---

### Task 2: `/loyalty` hands off to the theme page

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: `getThemePageUrl(): string` from Task 1.
- Produces: no new exports. Behavior only.

- [ ] **Step 1: Write the failing tests**

Append to `apps/storefront/src/pages/Loyalty/index.test.tsx`. This suite is flat
`it()` calls with no `describe` blocks — follow that. Every name carries the word
"cutover" so `-t cutover` selects exactly these six and nothing else (`-t theme`
would also catch three existing shipping-tracker and FAQ tests).

```tsx
it('cutover: hands off to the theme page when themePageUrl is configured', async () => {
  const { origin } = window.location;
  window.BC_CONTEXT = {
    loyalty: { shopKey, apiBase, appClientId, themePageUrl: '/smart-rewards/' },
  };

  renderWithProviders(<Loyalty />, customerPreloadedState);

  await waitFor(() => {
    expect(window.location.href).toBe(`${origin}/smart-rewards/`);
  });
});

it('cutover: renders no portal chrome while handing off', async () => {
  const { origin } = window.location;
  window.BC_CONTEXT = {
    loyalty: { shopKey, apiBase, appClientId, themePageUrl: '/smart-rewards/' },
  };

  renderWithProviders(<Loyalty />, customerPreloadedState);

  await waitFor(() => {
    expect(window.location.href).toBe(`${origin}/smart-rewards/`);
  });
  expect(screen.queryByRole('tab', { name: 'My Benefits' })).not.toBeInTheDocument();
  expect(screen.queryByText('Smart Rewards')).not.toBeInTheDocument();
});

it('cutover: fetches no loyalty data while handing off', async () => {
  const { origin } = window.location;
  const digestHandler = vi.fn(() => HttpResponse.json(identity));
  mockJwt();
  server.use(http.post(digestUrl, digestHandler));
  window.BC_CONTEXT = {
    loyalty: { shopKey, apiBase, appClientId, themePageUrl: '/smart-rewards/' },
  };

  renderWithProviders(<Loyalty />, customerPreloadedState);

  await waitFor(() => {
    expect(window.location.href).toBe(`${origin}/smart-rewards/`);
  });
  await delay(50);

  expect(digestHandler).not.toHaveBeenCalled();
});

it('cutover: renders the portal page unchanged when themePageUrl is absent', async () => {
  const initialHref = window.location.href;
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 4120 }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Smart Rewards')).toBeInTheDocument();
  expect(window.location.href).toBe(initialHref);
});

it('cutover: does not hand a masquerading rep off to the theme page', () => {
  const initialHref = window.location.href;
  window.BC_CONTEXT = {
    loyalty: { shopKey, apiBase, appClientId, themePageUrl: '/smart-rewards/' },
  };

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
  expect(window.location.href).toBe(initialHref);
});

it('cutover: ignores an off-origin themePageUrl and renders the portal page', async () => {
  const initialHref = window.location.href;
  window.BC_CONTEXT = {
    loyalty: {
      shopKey,
      apiBase,
      appClientId,
      themePageUrl: 'https://evil.example.com/smart-rewards/',
    },
  };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 4120 }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Smart Rewards')).toBeInTheDocument();
  expect(window.location.href).toBe(initialHref);
});
```

Two details that will bite if you improvise them:

- **`customerPreloadedState` is the entire options object**
  (`{ preloadedState: { company: … } }`), so it is passed as
  `renderWithProviders(<Loyalty />, customerPreloadedState)` — *not* wrapped in
  another `{ preloadedState: … }`. Check its definition near the top of the file.
- **`mockLoyaltyApis(customer)` is `mockJwt()` + `mockDigest()` +
  `mockCustomer(customer)`.** Use it for the render-as-before cases. The
  no-fetch test deliberately calls `mockJwt()` and its own spy handler instead,
  so that a fetch *would* succeed if the query were wrongly enabled — that is
  what makes the assertion meaningful rather than vacuous.

Every helper above already exists in the file: `mockJwt`, `mockDigest`,
`mockCustomer`, `mockLoyaltyApis`, `buildLoyaltyCustomerWith`,
`customerPreloadedState`, `identity`, `digestUrl`, `shopKey`, `apiBase`,
`appClientId`, and the `delay` / `buildB2BFeaturesStateWith` imports. Do not
add new builders.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx -t cutover`
Expected: FAIL. The three handoff tests fail because `window.location.href`
never changes and the portal page renders its tabs instead.

- [ ] **Step 3: Implement the handoff**

In `apps/storefront/src/pages/Loyalty/index.tsx`:

1. Change the React import to bring in `useEffect`:

```tsx
import { useEffect } from 'react';
```

2. Add `getThemePageUrl` to the existing named import block from `./api`,
   keeping it alphabetically sorted (between `getLoyaltyDigest` and
   `isLoyaltyAvailable`).

3. Directly after the `const isAvailable = …` line, add:

```tsx
  // Cutover (spec 2026-08-13 §7): with the theme's own Smart Rewards page live,
  // this route hands off instead of rendering a second copy of it. Gated on
  // isAvailable so a masquerading rep or an explicitly unentitled customer is
  // never sent there — the portal's gates stay authoritative for the handoff.
  const themePageUrl = getThemePageUrl();
  const isHandingOff = isAvailable && themePageUrl !== '';
```

4. Add `&& !isHandingOff` to the `enabled` option of `digestQuery`,
   `tiersQuery`, `membershipsQuery` and `tierProgressQuery`. `customerQuery`
   needs no change — it is already gated on `identity`, which cannot resolve
   once `digestQuery` is disabled.

5. After the last query declaration (`tierProgress`) and **before** the
   `if (!isAvailable)` early return — hooks must stay unconditional — add:

```tsx
  useEffect(() => {
    if (isHandingOff) {
      // Scripted navigation, not an anchor: the portal tree is portaled into the
      // ThemeFrame iframe, but React still executes in the parent realm, so window
      // is the top-level window and no target="_top" is needed here.
      window.location.href = themePageUrl;
    }
  }, [isHandingOff, themePageUrl]);
```

6. Immediately after the existing `if (!isAvailable) { … }` block, add:

```tsx
  if (isHandingOff) {
    // Same hidden shell as the pending-verdict state below: no hero or tabs may
    // flash before the browser leaves for the theme page.
    return (
      <B3Spin isSpinning>
        <Box sx={{ flex: 1, width: '100%', minHeight: 200 }} />
      </B3Spin>
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx -t cutover`
Expected: PASS, 6 tests.

- [ ] **Step 5: Negative control — prove the tests can fail**

Temporarily change `const isHandingOff = isAvailable && themePageUrl !== '';`
to `const isHandingOff = false;` and re-run Step 4.
Expected: the three handoff tests FAIL while the three "renders as before"
tests still pass. Revert and re-run to confirm all six pass.

Then temporarily drop the `isAvailable &&` from that same line and re-run.
Expected: the masquerading-rep test FAILS. Revert and re-run.

- [ ] **Step 6: Run the whole Loyalty suite**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS. Compare any failure against the branch's pre-existing baseline
before treating it as caused by this change — `dev` is not reliably green, and
pre-existing redness is not this task's to fix.

- [ ] **Step 7: Type-check and lint**

Run: `yarn tsc --noEmit`
Expected: no errors.

Run: `yarn lint`
Expected: dependency-cruiser, ESLint (`--max-warnings 0`) and knip all clean.
`getThemePageUrl` is now consumed, so knip has nothing to report.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/index.tsx \
        apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Hand /loyalty off to the theme Smart Rewards page when configured"
```

---

## Verification before handing back

- [ ] `yarn tsc --noEmit` clean.
- [ ] `yarn lint` clean.
- [ ] `yarn test --run src/pages/Loyalty` at or above the pre-change baseline.
- [ ] Both negative controls performed and reverted — no test in this plan
      passes against a deliberately broken implementation.
- [ ] With no `themePageUrl` set, the page's rendered output is unchanged. This
      is the whole safety argument for shipping the cutover ahead of the theme
      page: an absent key means the old behavior, exactly.

## Live check, once the theme page exists

Not part of this plan's definition of done, but the step that closes §7:
set `BC_CONTEXT.loyalty.themePageUrl` on sandbox, sign in, open the Smart
Rewards nav item, and confirm the browser lands on the theme page with the
portal torn down rather than the theme page loading inside the account panel.
Then delete the key and confirm the portal page returns. jsdom cannot test the
iframe-escape behavior — `renderWithProviders` never mounts `ThemeFrame` — so
this is the only place that property is actually verified.
