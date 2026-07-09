---
title: Loyalty Earn Points tab renders blank cards — fetchEarnRules read customTitle with no title fallback
type: concept
created: 2026-07-09
updated: 2026-07-09
lastVerified: 2026-07-09
repo: b2b-buyer-portal
storeHash: all
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: fetchEarnRules       # title: rule.customTitle ?? rule.title ?? '' — was customTitle ?? '' (blank)
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: fetchRedeemRules     # sibling that ALREADY did customTitle ?? title ?? '' — keep the two mappings consistent
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/EarnPointsTab.tsx
    symbol: EarnPointsTab        # renders rule.title / rule.summary per card — blank when title is ''
tags: [memory, b2b-buyer-portal, b2b, loyalty, influence-io, earn-rules, mapping-bug]
---

# Loyalty Earn Points tab renders blank cards — fetchEarnRules read customTitle with no title fallback

The `/loyalty` **Earn Points** tab rendered a row of **blank cards** even though
`GET launcher/v1/shop/rules/earn` returned **200** with valid rules. Root cause is
a client-side mapping bug, not the backend.

Influence.io's Launcher earn-rule payload carries the label in **`title`** (and no
`customTitle`, no `summary`). But `fetchEarnRules` mapped
`title: rule.customTitle ?? ''` — so every rule's title resolved to `''`, and
`EarnPointsTab` (which renders `rule.title` / `rule.summary` per `Card`) drew empty
cards. The sibling `fetchRedeemRules` already did it correctly
(`rule.customTitle ?? rule.title ?? ''`), which is exactly why the **Rewards**
(redeem) tab showed titles while **Earn Points** did not.

## Evidence (live, 2026-07-09)

`GET https://launcher.api.influence.io/launcher/v1/shop/rules/earn?shop=24erkpw9h6`
→ 200, 5 rules, every one shaped like:

```
title='Place an order'  customTitle=None  summary=None  templateName='placeorder'  earnType='increments'
title='Sign up'         customTitle=None  summary=None  templateName='signup'
title='General Purpose' customTitle=None  summary=None  templateName='generalpurpose'
```

Verified via Playwright on `sandbox.storesupply.com` logged in as
`thaverman@storesupply.com` — the Earn tab showed empty cards while Rewards/History/
Tiers/Overview all rendered correctly.

## Fix

`src/pages/Loyalty/api.ts`:
- `RawEarnRule` gained a `title?: string` field.
- Mapping changed to `title: rule.customTitle ?? rule.title ?? ''` (mirrors
  `fetchRedeemRules`).
- Repro test added in `api.test.ts` (`fetchEarnRules` → "falls back to title when
  customTitle is absent"): a `title`-only rule now maps its title through.

Status: **fix committed to `dev` on 2026-07-09, not yet deployed.** The deployed
sandbox bundle still shows blank cards until this ships. All 70 Loyalty tests +
`tsc --noEmit` pass locally with the change.

## Diagnostic rule (reusable)

- Influence.io Launcher **earn** and **redeem** rules put the customer-facing label
  in `title`; a merchant override lives in `customTitle`. Any DTO mapping must be
  `customTitle ?? title ?? ''` — never `customTitle ?? ''`. Earn had drifted from
  redeem; keep the two normalizers in lockstep.
- `summary` is often absent on real earn rules — a blank body line is expected, not
  a bug.
- Non-social earn rules (`placeorder` / `generalpurpose` / `signup`) are
  informational-only (no follow button) by design — `getSocialCompletionFlag`
  returns null and `renderAction` renders nothing. Only the missing title was the bug.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-digest-mismatch-influence-launcher]]
- [[b2b-buyer-portal--bc-context-host-config-gating]]
