import { http, HttpResponse, startMockServer } from 'tests/test-utils';

import {
  clearLoyaltyLanding,
  prefetchLoyaltyLanding,
  prefetchLoyaltyLandingIfIdle,
  resolveLoyaltyLanding,
} from './loyaltyLanding';

const { server } = startMockServer();

const shopKey = 'store-key';
const apiBase = 'https://ssw.example.com/customers';
const appClientId = 'ssw-app-client-id';
const progressUrl = `${apiBase}/loyaltycustomersclient/GetDetailWithProgress`;

const withProgressSite = () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
  window.loyalty_site_name = 'StoreSupply';
};

const mockProgress = (targetKind: string) =>
  server.use(
    http.get(progressUrl, () =>
      HttpResponse.json({
        Success: true,
        Result: { TierProgress: { TargetKind: targetKind, TargetTierName: 'Signature' } },
      }),
    ),
  );

afterEach(() => {
  delete window.BC_CONTEXT;
  delete window.loyalty_site_name;
});

// Module state persists within this file: this MUST stay the first test.
it('resolves false when no prefetch has happened', async () => {
  expect(await resolveLoyaltyLanding(50)).toBe(false);
});

it('resolves true for a NextTier customer', async () => {
  withProgressSite();
  mockProgress('NextTier');

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(true);
});

it('resolves true for a PrePointsGate customer', async () => {
  withProgressSite();
  mockProgress('PrePointsGate');

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(true);
});

it('resolves false for an AtTop customer', async () => {
  withProgressSite();
  mockProgress('AtTop');

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(false);
});

it('resolves false when the endpoint fails', async () => {
  withProgressSite();
  server.use(http.get(progressUrl, () => HttpResponse.json({}, { status: 500 })));

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(false);
});

it('resolves false when the endpoint is slower than the budget', async () => {
  withProgressSite();
  server.use(http.get(progressUrl, () => new Promise<never>(() => {})));

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
});

it('does not call the endpoint without the loyalty_site_name global', async () => {
  const requests = vi.fn();
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
  server.use(
    http.get(progressUrl, () => {
      requests();
      return HttpResponse.json({});
    }),
  );

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
  expect(requests).not.toHaveBeenCalled();
});

it('does not call the endpoint while masquerading', async () => {
  const requests = vi.fn();
  withProgressSite();
  server.use(
    http.get(progressUrl, () => {
      requests();
      return HttpResponse.json({});
    }),
  );

  prefetchLoyaltyLanding(264074, true);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
  expect(requests).not.toHaveBeenCalled();
});

it('does not redirect a customer who is not loyalty-entitled', async () => {
  // Config in place so a reverted gate would genuinely hit the endpoint and could
  // resolve true; without this the check is vacuous either way (see task-3-report.md).
  const requests = vi.fn();
  withProgressSite();
  server.use(
    http.get(progressUrl, () => {
      requests();
      return HttpResponse.json({
        Success: true,
        Result: { TierProgress: { TargetKind: 'NextTier', TargetTierName: 'Signature' } },
      });
    }),
  );

  prefetchLoyaltyLanding(264074, false, false);

  expect(await resolveLoyaltyLanding()).toBe(false);
  expect(requests).not.toHaveBeenCalled();
});

it('does not call the endpoint without a customer id', async () => {
  const requests = vi.fn();
  withProgressSite();
  server.use(
    http.get(progressUrl, () => {
      requests();
      return HttpResponse.json({});
    }),
  );

  prefetchLoyaltyLanding(0, false);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
  expect(requests).not.toHaveBeenCalled();
});

it('replaces the previous check on a new prefetch', async () => {
  withProgressSite();
  mockProgress('NextTier');
  prefetchLoyaltyLanding(264074, false);
  expect(await resolveLoyaltyLanding()).toBe(true);

  mockProgress('AtTop');
  prefetchLoyaltyLanding(264074, false);
  expect(await resolveLoyaltyLanding()).toBe(false);
});

it('prefetchLoyaltyLandingIfIdle does not replace a pending check', async () => {
  withProgressSite();
  mockProgress('NextTier');
  prefetchLoyaltyLanding(264074, false);

  // Would resolve false if it replaced the stored NextTier check.
  mockProgress('AtTop');
  prefetchLoyaltyLandingIfIdle(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(true);
});

it('prefetchLoyaltyLandingIfIdle leaves a stored resolved-null check in place', async () => {
  // A resolved-null check (from an ineligible prefetch) still counts as stored:
  // IfIdle only ever fills a slot that no prefetch has touched.
  withProgressSite();
  prefetchLoyaltyLanding(0, false); // stores resolved-null
  mockProgress('NextTier');
  prefetchLoyaltyLandingIfIdle(264074, false);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
});

it('clearLoyaltyLanding forgets the stored check so IfIdle can refill', async () => {
  withProgressSite();
  mockProgress('NextTier');
  prefetchLoyaltyLanding(264074, false);
  expect(await resolveLoyaltyLanding()).toBe(true);

  clearLoyaltyLanding();
  expect(await resolveLoyaltyLanding(50)).toBe(false);

  mockProgress('PrePointsGate');
  prefetchLoyaltyLandingIfIdle(264074, false);
  expect(await resolveLoyaltyLanding()).toBe(true);
});
