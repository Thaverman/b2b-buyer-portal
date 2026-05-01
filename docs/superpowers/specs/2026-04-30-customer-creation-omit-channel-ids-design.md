# Customer Creation — Omit `channel_ids` for Global Customer Behavior

**Date:** 2026-04-30
**Status:** Approved (design)
**Owner:** Tim Haverman

## Problem

When a customer registers through the buyer portal, the BC `customerCreate` GraphQL payload currently sets `channel_ids` to the single channel the user registered from. On multi-channel stores, this scopes the customer to only that channel, which is not the desired behavior — new accounts should be available across **all** channels in the store.

## Goal

Make new customer accounts global (associated with every channel) by default, while preserving the registration-source breadcrumb stored in `origin_channel_id`.

## Approach

Omit `channel_ids` from the BC `customerCreate` payload. BigCommerce's `customerCreate` mutation treats an unspecified `channel_ids` as "global customer," which is exactly the desired outcome.

Setting the field to `null` is not equivalent to omitting it — some BC inputs reject `null` for list types — so the implementation must drop the assignment entirely rather than assigning `null`. The downstream key-camelizer (`convertObjectOrArrayKeysToCamel`) drops `undefined` keys, so simply not assigning the field keeps it out of the GraphQL variables.

`origin_channel_id` is unrelated to channel association — it is BC's "channel where this customer originated" stamp — and stays as-is.

## Implementation

### 1. Source change

**File:** [`apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts`](../../../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts)

Delete line 63 (`bcFields.channel_ids = [channelId];`). Keep line 62 (`bcFields.origin_channel_id = channelId;`) untouched.

Before:

```ts
bcFields.addresses = [];
bcFields.origin_channel_id = channelId;
bcFields.channel_ids = [channelId];
```

After:

```ts
bcFields.addresses = [];
bcFields.origin_channel_id = channelId;
```

### 2. Test update

**File:** [`apps/storefront/src/pages/Registered/index.test.tsx`](../../../apps/storefront/src/pages/Registered/index.test.tsx)

Remove `channel_ids: [1],` from the expected `customerData` fixture (currently line 855). The rest of the fixture stays.

## Out-of-scope / explicitly unchanged

- **`origin_channel_id`** — preserved on the customer record so the registration-source breadcrumb survives.
- **`sendSubscribersState`** (newsletter side effect) — sends `channel_id` (singular) to a different BC subscribers API. Unrelated to customer-channel association. Untouched.
- **B2B `createCompany` / `registerCompany`** — operate on company records, not BC customer channel association. No change.

## Risks

- **Single-channel stores:** none. The field has been `[1]` and global is functionally identical.
- **Multi-channel stores:** new accounts will become available across all channels instead of only the one they registered from. This is the intended outcome.
- **GraphQL schema:** if `CustomerInputType.channelIds` were a non-nullable list, omitting it would error. The recreation guide and BC's customer API both treat this field as optional; verify with a test run before merging.

## Verification

1. `cd apps/storefront && yarn test src/pages/Registered/index.test.tsx` passes after the test fixture update.
2. `yarn tsc --noEmit` clean.
3. Manual: register a new customer on a multi-channel test store; confirm via BC admin that the customer appears on all channels rather than only the registration channel.

## Out-of-scope follow-ups

None identified. This is a self-contained one-line behavior change plus a test fixture update.
