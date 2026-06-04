# Customer Creation — Omit `channel_ids` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop sending `channel_ids` in the BC `customerCreate` payload so new customer accounts default to BigCommerce's "global customer" behavior (available across all channels) rather than being scoped to the registration channel.

**Architecture:** Single-line source change in [`createCustomer.ts`](../../../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts) (delete the assignment) plus a matching one-line test-fixture update. The `convertObjectOrArrayKeysToCamel` helper iterates `Object.keys`, so an unassigned property is genuinely absent from the GraphQL variables — no `null` or `delete` needed.

**Tech Stack:** TypeScript, React, Vitest (jsdom), MSW, GraphQL.

**Spec:** [docs/superpowers/specs/2026-04-30-customer-creation-omit-channel-ids-design.md](../specs/2026-04-30-customer-creation-omit-channel-ids-design.md)

---

## File Map

| File | Change | Reason |
| ---- | ------ | ------ |
| `apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts` | Modify | Remove `bcFields.channel_ids = [channelId];` |
| `apps/storefront/src/pages/Registered/index.test.tsx` | Modify | Remove `channel_ids: [1],` from `expectedPayloadType2` (also propagates to `expectedPayloadType1` via spread) |

No new files, no deletions, no schema changes, no Redux changes.

---

## Working Directory

All commands run from `apps/storefront/`:

```bash
cd apps/storefront
```

---

## Task 1: Update the test fixture (TDD: red first)

**Files:**
- Modify: `apps/storefront/src/pages/Registered/index.test.tsx:855`

**Why test-first:** This existing test currently asserts that `channel_ids: [1]` is in the BC `customerCreate` payload. After the source change, that assertion will be wrong. Updating the fixture first lets us see the test fail in the expected direction (assertion mismatch on `channel_ids`) before we fix it by removing the source line.

- [ ] **Step 1: Read the current fixture**

Open [`apps/storefront/src/pages/Registered/index.test.tsx`](../../../apps/storefront/src/pages/Registered/index.test.tsx) and locate the `expectedPayloadType2` object (around line 848). Confirm it contains the line `channel_ids: [1],` at line 855. Confirm `expectedPayloadType1` (around line 865) is defined via `{ ...expectedPayloadType2, ... }` spread — so removing the field from `expectedPayloadType2` removes it from both fixtures automatically.

- [ ] **Step 2: Remove the `channel_ids` line from the fixture**

Delete **only** this one line:

```ts
  channel_ids: [1],
```

The surrounding fixture stays exactly as-is. Final shape of `expectedPayloadType2` after the edit:

```ts
const expectedPayloadType2 = {
  accepts_product_review_abandoned_cart_emails: false,
  addresses: [],
  authentication: {
    force_password_reset: false,
    new_password: 'Password123',
  },
  email: 'john.doe@example.com',
  first_name: 'John',
  form_fields: [],
  last_name: 'Doe',
  origin_channel_id: 1,
  phone: '1234567890',
  storeHash: 'store-hash',
};
```

- [ ] **Step 3: Run the affected test and confirm it fails for the expected reason**

Run:

```bash
yarn test src/pages/Registered/index.test.tsx --run
```

Expected: at least one assertion fails because the actual payload (still produced by unmodified source) **contains** `channel_ids: [1]` but the expected fixture no longer does. Vitest will print a diff showing the extra `channel_ids` property in the received value. **Do not proceed if the test fails for any other reason** — investigate first.

- [ ] **Step 4: Do NOT commit yet**

Leaving the failing test uncommitted keeps the red→green change visible as a single commit.

---

## Task 2: Remove the `channel_ids` assignment from the source

**Files:**
- Modify: `apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts:63`

- [ ] **Step 1: Open the file and locate lines 61-63**

The current block is:

```ts
  bcFields.addresses = [];
  bcFields.origin_channel_id = channelId;
  bcFields.channel_ids = [channelId];
```

- [ ] **Step 2: Delete only line 63**

After the edit:

```ts
  bcFields.addresses = [];
  bcFields.origin_channel_id = channelId;
```

That is the entire change. Do **not**:
- Replace with `bcFields.channel_ids = null;` — `null` is not equivalent to omission for some BC list inputs.
- Add a `delete bcFields.channel_ids;` — the property never gets set in the first place after this edit.
- Touch `bcFields.origin_channel_id` (line 62). It stays.

- [ ] **Step 3: Re-run the affected test and confirm it now passes**

```bash
yarn test src/pages/Registered/index.test.tsx --run
```

Expected: all tests pass. The fixture from Task 1 now matches the produced payload because the source no longer assigns `channel_ids`.

- [ ] **Step 4: Run type check**

```bash
yarn tsc --noEmit
```

Expected: clean exit (no errors). The type that contained `channel_ids: number[]` is the loose `CustomFieldItems` map (`Record<string, any>`), so removing the assignment does not affect typings.

- [ ] **Step 5: Run lint on the touched files**

```bash
yarn lint:eslint src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts src/pages/Registered/index.test.tsx
```

Expected: clean exit (no errors, no warnings).

- [ ] **Step 6: Commit both changes together**

```bash
git add apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts apps/storefront/src/pages/Registered/index.test.tsx
git commit -m "fix: omit channel_ids on customer create so accounts are global"
```

Use the project commit format (see [CONTRIBUTING.md](../../../CONTRIBUTING.md) and [commit-validation.json](../../../commit-validation.json)). If a JIRA ticket is associated with this change, prepend it: `fix: B2B-XXXX omit channel_ids on customer create so accounts are global`.

---

## Task 3: Whole-suite regression check

**Files:** none modified.

- [ ] **Step 1: Run the full test suite for the affected page**

```bash
yarn test src/pages/Registered/ --run
```

Expected: all tests pass. This catches any other test in the `Registered` page tree that may have asserted on `channel_ids` (the spec verification turned up only the one fixture, but a full run is cheap insurance).

- [ ] **Step 2: Run the entire storefront unit-test suite**

```bash
yarn test --run
```

Expected: all tests pass. Run time is ~1-2 min locally. If any non-Registered test fails, it almost certainly indicates a snapshot or fixture elsewhere that asserted on the customer payload — investigate before declaring success.

- [ ] **Step 3: Run dependency / unused-code linters**

```bash
yarn lint:dependencies
yarn lint:knip
```

Expected: both clean. Neither should be affected by a one-line behavior change, but `lint` is gated on all three and will fail in CI if any one breaks.

- [ ] **Step 4: No commit**

Task 3 is verification only. Nothing to stage.

---

## Self-review checklist (run before declaring done)

- [ ] [`createCustomer.ts`](../../../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts) no longer contains `channel_ids` (grep should return zero hits in that file).
- [ ] [`index.test.tsx`](../../../apps/storefront/src/pages/Registered/index.test.tsx) no longer contains `channel_ids` (grep should return zero hits in that file).
- [ ] [`createCustomer.ts`](../../../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts) **still** contains `origin_channel_id = channelId` on line 62.
- [ ] `yarn tsc --noEmit` exit 0.
- [ ] `yarn test --run` exit 0.
- [ ] `yarn lint` exit 0.
- [ ] Single commit on the branch with both file changes.

---

## Out-of-scope follow-ups

- A multi-channel manual smoke test on a real BC store is listed in the spec's Verification section. That requires environment access this plan does not assume — leave for the human reviewer to perform after the PR is up.
- The recreation guide ([docs/subscriptions-analytics-customer-recreation.md](../../subscriptions-analytics-customer-recreation.md#3-create-a-new-customer)) describes the now-removed `channel_ids` assignment and references stale `getBCFieldsValue` dead code. Updating that guide is a docs-only change worth a separate PR; do not roll it into this one.
