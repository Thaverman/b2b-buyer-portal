import { http, HttpResponse, startMockServer } from 'tests/test-utils';

import { RawTierAttribute, resolveLoyaltyEntitlement } from '@/pages/Loyalty/api';
import { getCustomerInfo } from '@/shared/service/bc';

// Nothing else asserts that the `loyaltyTier` alias src/shared/service/bc/graphql/user.ts
// builds into the query and the `attributes?.loyaltyTier` property access this module's
// getCurrentCustomerInfo reads off the response actually agree. If they ever diverge, the
// resolver gets `undefined` every login, returns `true`, and the feature silently never
// gates — indistinguishable from an API outage.
//
// getCurrentCustomerInfo itself is not driven end-to-end here: beyond this query it also
// calls the B2B GraphQL company/user endpoints, and only dispatches isLoyaltyEntitled once
// those succeed too, which would require mocking a second backend just to reach this seam.
// These tests instead drive the real getCustomerInfo() query/response round trip and feed
// the resolver the exact shape getCurrentCustomerInfo extracts.
const { server } = startMockServer();

const proxyGraphqlUrl = 'https://api-b2b.bigcommerce.com/api/v3/proxy/bc-storefront/graphql';

const loyaltyConfig = {
  shopKey: 'shop-key',
  apiBase: 'https://ssw.example.com/customers',
  appClientId: 'app-client-id',
};

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('includes the tier attribute selection, aliased to loyaltyTier, when tierAttributeId is configured', async () => {
  const requestBody = vi.fn();
  server.use(
    http.post(proxyGraphqlUrl, async ({ request }) => {
      requestBody(await request.json());
      return HttpResponse.json({ data: { customer: {} } });
    }),
  );

  await getCustomerInfo(2);

  const [{ query }] = requestBody.mock.calls[0];
  // The alias, not just the id: this is the half of the seam that lives in this file.
  expect(query).toContain('loyaltyTier: attribute(entityId: 2)');
});

it('omits the attributes selection entirely when no tierAttributeId is configured', async () => {
  const requestBody = vi.fn();
  server.use(
    http.post(proxyGraphqlUrl, async ({ request }) => {
      requestBody(await request.json());
      return HttpResponse.json({ data: { customer: {} } });
    }),
  );

  await getCustomerInfo(undefined);

  const [{ query }] = requestBody.mock.calls[0];
  expect(query).not.toContain('attributes');
});

it('resolves to not-entitled from the exact attributes.loyaltyTier shape the query returns', async () => {
  window.BC_CONTEXT = { loyalty: { ...loyaltyConfig, tierAttributeId: 2 } };
  server.use(
    http.post(proxyGraphqlUrl, () =>
      HttpResponse.json({
        data: {
          customer: {
            entityId: 1,
            attributes: { loyaltyTier: { entityId: 2, name: 'Loyalty Tier', value: null } },
          },
        },
      }),
    ),
  );

  const data = await getCustomerInfo(2);
  // Same property access as src/utils/loginInfo.ts's getCurrentCustomerInfo.
  const { attributes } = data.data.customer;

  expect(resolveLoyaltyEntitlement(attributes?.loyaltyTier as RawTierAttribute | undefined)).toBe(
    false,
  );
});
