import { getCurrentCustomerJWT } from '@/shared/service/bc';
import b2bLogger from '@/utils/b3Logger';
import { platform } from '@/utils/basicConfig';

// Module-internal: knip fails the build on unused exports, so this file only
// exports what other files actually import.
interface LoyaltyConfig {
  shopKey: string;
  apiBase: string;
  appClientId: string;
  progressSite?: string;
}

const LAUNCHER_API_BASE = 'https://launcher.api.influence.io/launcher/v1';

const getLoyaltyConfig = (): LoyaltyConfig | undefined => {
  const config = window.BC_CONTEXT?.loyalty;
  if (!config?.shopKey || !config?.apiBase || !config?.appClientId) {
    return undefined;
  }
  return config;
};

// Stencil-only: getCurrentCustomerJWT early-returns undefined on every other platform,
// which would misrender as "session expired"; gate the feature out instead.
export const isLoyaltyAvailable = () => platform === 'bigcommerce' && Boolean(getLoyaltyConfig());

export const isTierProgressAvailable = (): boolean =>
  isLoyaltyAvailable() && Boolean(getLoyaltyConfig()?.progressSite);

type LoyaltyErrorKind =
  | 'sessionExpired'
  | 'notEnrolled'
  | 'misconfigured'
  | 'rateLimited'
  | 'upstream';

export class LoyaltyError extends Error {
  kind: LoyaltyErrorKind;

  constructor(kind: LoyaltyErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

export interface LoyaltyIdentity {
  digest: string;
  customerId: string;
  email: string;
}

// The SSW backend (.NET/Newtonsoft) may serialize PascalCase keys; accept either casing.
interface RawDigestResponse {
  digest?: string;
  Digest?: string;
  customerId?: number | string;
  CustomerId?: number | string;
  email?: string;
  Email?: string;
}

const requireConfig = (): LoyaltyConfig => {
  const config = getLoyaltyConfig();
  if (!config) {
    throw new Error('Loyalty is not configured on this store');
  }
  return config;
};

export const getLoyaltyDigest = async (): Promise<LoyaltyIdentity> => {
  const config = requireConfig();

  // The Current Customer JWT lives ~15s; fetch a fresh one for every call.
  const jwt = await getCurrentCustomerJWT(config.appClientId).catch(() => undefined);
  if (!jwt) {
    // Also fires when the SSW app is not installed / appClientId is wrong — without this
    // line a pure config error is indistinguishable from a real expired session.
    b2bLogger.error(
      'Loyalty: /customer/current.jwt returned no token — expired storefront session, or BC_CONTEXT.loyalty.appClientId does not belong to an app installed on this store',
    );
    throw new LoyaltyError('sessionExpired');
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/loyalty/digest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jwt }),
    });
  } catch {
    throw new LoyaltyError('upstream');
  }

  if (response.ok) {
    const raw: RawDigestResponse = await response.json();
    return {
      digest: raw.digest ?? raw.Digest ?? '',
      customerId: String(raw.customerId ?? raw.CustomerId ?? ''),
      email: raw.email ?? raw.Email ?? '',
    };
  }
  if (response.status === 401) {
    b2bLogger.error(
      'Loyalty: digest endpoint rejected the JWT (401) — expired session, or BC_CONTEXT.loyalty.appClientId does not match the backend configuration',
    );
    throw new LoyaltyError('sessionExpired');
  }
  if (response.status === 429) {
    throw new LoyaltyError('rateLimited');
  }
  throw new LoyaltyError('upstream');
};

interface LoyaltyMembershipSummary {
  id: string;
  title: string;
  perks: string[];
}

export interface LoyaltyCustomer {
  pointBalance: number;
  currentLoyaltyTierId: string | null;
  currentLoyaltyTierProgress: number | null;
  createdAt: string;
  followInstagram: boolean;
  followTikTok: boolean;
  followTwitter: boolean;
  likeFacebook: boolean;
  currentMembership: LoyaltyMembershipSummary | null;
}

interface RawLoyaltyCustomer {
  pointBalance?: number;
  currentLoyaltyTierId?: string;
  currentLoyaltyTierProgress?: number;
  createdAt?: string;
  followInstagram?: boolean;
  followTikTok?: boolean;
  followTwitter?: boolean;
  likeFacebook?: boolean;
  currentMembership?: { id?: string | number; title?: string; perks?: string[] };
}

const identityParams = (config: LoyaltyConfig, identity: LoyaltyIdentity) => ({
  shop: config.shopKey,
  customer_id: identity.customerId,
  customer_email: identity.email,
  digest: identity.digest,
});

const launcherStatusToError = (
  status: number,
  notFoundKind: 'notEnrolled' | 'upstream',
  customerId?: string,
): LoyaltyError => {
  if (status === 401) {
    // The digest is a timeless HMAC of stable inputs — a Launcher 401 means the identity
    // keying or shop key is wrong, never an expired session; re-login cannot fix it.
    b2bLogger.error(
      'Loyalty: Launcher API rejected the digest (401) — identity keying or shop key mismatch',
    );
    return new LoyaltyError('misconfigured');
  }
  if (status === 404) {
    if (notFoundKind === 'notEnrolled') {
      // Ambiguous upstream: genuinely unknown customer OR a digest identity that does not
      // match Influence.io records (see spec S1/Q3) — log so a systemic bug is visible.
      // NEVER log the digest here — it's a stable HMAC identity secret.
      b2bLogger.error(
        `Loyalty: Launcher API returned 404 for customer ${customerId ?? 'unknown'} — not enrolled, or digest identity does not match Influence.io records`,
      );
    }
    return new LoyaltyError(notFoundKind);
  }
  if (status === 429) {
    return new LoyaltyError('rateLimited');
  }
  return new LoyaltyError('upstream');
};

const launcherGet = async (
  path: string,
  params: Record<string, string>,
  notFoundKind: 'notEnrolled' | 'upstream',
): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(`${LAUNCHER_API_BASE}${path}?${new URLSearchParams(params)}`);
  } catch {
    throw new LoyaltyError('upstream');
  }
  if (!response.ok) {
    throw launcherStatusToError(response.status, notFoundKind, params.customer_id);
  }
  return response.json();
};

export const fetchLoyaltyCustomer = async (identity: LoyaltyIdentity): Promise<LoyaltyCustomer> => {
  const config = requireConfig();
  const raw = (await launcherGet(
    '/customer',
    identityParams(config, identity),
    'notEnrolled',
  )) as RawLoyaltyCustomer;

  return {
    pointBalance: raw.pointBalance ?? 0,
    currentLoyaltyTierId: raw.currentLoyaltyTierId ?? null,
    currentLoyaltyTierProgress: raw.currentLoyaltyTierProgress ?? null,
    createdAt: raw.createdAt ?? '',
    followInstagram: raw.followInstagram ?? false,
    followTikTok: raw.followTikTok ?? false,
    followTwitter: raw.followTwitter ?? false,
    likeFacebook: raw.likeFacebook ?? false,
    currentMembership: raw.currentMembership
      ? {
          id: String(raw.currentMembership.id ?? ''),
          title: raw.currentMembership.title ?? '',
          perks: raw.currentMembership.perks ?? [],
        }
      : null,
  };
};

export interface LoyaltyTier {
  id: string;
  title: string;
  threshold: string;
  perks: string[];
}

interface RawTier {
  id?: string | number;
  title?: string;
  threshold?: string | number;
  perks?: string[];
}

export const fetchTiers = async (): Promise<LoyaltyTier[]> => {
  const config = requireConfig();
  const raw = (await launcherGet('/shop/tiers', { shop: config.shopKey }, 'upstream')) as {
    rules?: RawTier[];
  };

  return (raw.rules ?? []).map((tier) => ({
    id: String(tier.id ?? ''),
    title: tier.title ?? '',
    threshold: String(tier.threshold ?? ''),
    perks: tier.perks ?? [],
  }));
};

export interface LoyaltyMembership {
  id: string;
  title: string;
  description: string;
  perks: string[];
}

interface RawMembership {
  id?: string | number;
  title?: string;
  description?: string;
  perks?: string[];
}

export const fetchMemberships = async (): Promise<LoyaltyMembership[]> => {
  const config = requireConfig();
  const raw = (await launcherGet('/shop/memberships', { shop: config.shopKey }, 'upstream')) as {
    memberships?: RawMembership[];
  };

  return (raw.memberships ?? []).map((membership) => ({
    id: String(membership.id ?? ''),
    title: membership.title ?? '',
    description: membership.description ?? '',
    perks: membership.perks ?? [],
  }));
};

export interface LoyaltyTierProgress {
  currentTierName: string;
  targetTierName: string;
  ordersInWindow: number;
  targetOrdersRequired: number;
  spendInWindow: number;
  targetAmountRequired: number;
  ordersProgressPct: number;
  spendProgressPct: number;
  summary: string;
}

// PascalCase: SSW backend (.NET/Newtonsoft), same serializer as the digest endpoint.
interface RawTierProgress {
  CurrentTierName?: string;
  TargetKind?: string;
  TargetTierName?: string;
  OrdersInWindow?: number;
  TargetOrdersRequired?: number;
  SpendInWindow?: number;
  TargetAmountRequired?: number;
  OrdersProgressPct?: number;
  SpendProgressPct?: number;
  Summary?: string;
}

export const fetchTierProgress = async (
  customerId: string | number,
): Promise<LoyaltyTierProgress | null> => {
  const config = requireConfig();
  if (!config.progressSite) {
    throw new Error('Loyalty tier progress is not configured on this store');
  }
  const params = new URLSearchParams({
    site: config.progressSite,
    bigCommerceStoreId: window.B3.setting.store_hash,
    bigCommerceCustomerId: String(customerId),
    recentTransactionsTake: '0',
  });

  let response: Response;
  try {
    response = await fetch(
      `${config.apiBase}/loyaltycustomersclient/GetDetailWithProgress?${params}`,
    );
  } catch {
    throw new LoyaltyError('upstream');
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new LoyaltyError('rateLimited');
    }
    throw new LoyaltyError('upstream');
  }

  const raw = (await response.json()) as {
    Success?: boolean;
    Result?: { TierProgress?: RawTierProgress | null };
  };
  const progress = raw.Success === true ? raw.Result?.TierProgress : null;
  // Anything other than an explicit next-tier target means there is nothing to show.
  if (!progress || progress.TargetKind !== 'NextTier') {
    return null;
  }

  return {
    currentTierName: progress.CurrentTierName ?? '',
    targetTierName: progress.TargetTierName ?? '',
    ordersInWindow: progress.OrdersInWindow ?? 0,
    targetOrdersRequired: progress.TargetOrdersRequired ?? 0,
    spendInWindow: progress.SpendInWindow ?? 0,
    targetAmountRequired: progress.TargetAmountRequired ?? 0,
    ordersProgressPct: progress.OrdersProgressPct ?? 0,
    spendProgressPct: progress.SpendProgressPct ?? 0,
    summary: progress.Summary ?? '',
  };
};

export interface EarnRule {
  id: string;
  title: string;
  summary: string;
  earnType: string;
  templateName: string;
  socialUrl: string;
  earnValue: number;
  limitTiers: boolean;
  loyaltyTierIds: string[];
}

interface RawEarnRule {
  id?: string | number;
  customTitle?: string;
  title?: string;
  summary?: string;
  earnType?: string;
  templateName?: string;
  socialUrl?: string;
  earnValue?: number;
  limitTiers?: boolean;
  loyaltyTierIds?: (string | number)[];
}

export const fetchEarnRules = async (): Promise<EarnRule[]> => {
  const config = requireConfig();
  const raw = (await launcherGet('/shop/rules/earn', { shop: config.shopKey }, 'upstream')) as {
    rules?: RawEarnRule[];
  };

  return (raw.rules ?? []).map((rule) => ({
    id: String(rule.id ?? ''),
    title: rule.customTitle ?? rule.title ?? '',
    summary: rule.summary ?? '',
    earnType: rule.earnType ?? '',
    templateName: rule.templateName ?? '',
    socialUrl: rule.socialUrl ?? '',
    earnValue: rule.earnValue ?? 0,
    limitTiers: rule.limitTiers ?? false,
    loyaltyTierIds: (rule.loyaltyTierIds ?? []).map(String),
  }));
};

type SocialFlag = keyof Pick<
  LoyaltyCustomer,
  'followInstagram' | 'followTikTok' | 'followTwitter' | 'likeFacebook'
>;

const SOCIAL_MATCHERS: { match: string; flag: SocialFlag }[] = [
  { match: 'instagram', flag: 'followInstagram' },
  { match: 'tiktok', flag: 'followTikTok' },
  { match: 'twitter', flag: 'followTwitter' },
  { match: 'facebook', flag: 'likeFacebook' },
];

// earnType/templateName enums are undocumented upstream (spec S4) — match heuristically
// on the rule's template name or social URL; unmatched rules render informational-only.
export const getSocialCompletionFlag = (rule: EarnRule): SocialFlag | null => {
  const haystack = `${rule.templateName} ${rule.socialUrl}`.toLowerCase();
  return SOCIAL_MATCHERS.find((matcher) => haystack.includes(matcher.match))?.flag ?? null;
};

// Tier-gated rules (limitTiers) only apply to customers in one of the listed tiers;
// with no known tier we hide them rather than show a rate the customer may not get.
export const isEarnRuleForTier = (rule: EarnRule, currentTierId: string | null): boolean => {
  if (!rule.limitTiers) {
    return true;
  }
  if (!currentTierId) {
    return false;
  }
  return rule.loyaltyTierIds.includes(currentTierId);
};

interface SocialResult {
  success: boolean;
  points: number;
  updatedBalance: number;
}

const launcherPost = async (path: string, body: Record<string, unknown>): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(`${LAUNCHER_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LoyaltyError('upstream');
  }
  if (!response.ok) {
    throw launcherStatusToError(response.status, 'upstream');
  }
  return response.json();
};

const identityBody = (config: LoyaltyConfig, identity: LoyaltyIdentity) => ({
  customer: { id: identity.customerId, email: identity.email },
  shop: config.shopKey,
  digest: identity.digest,
});

export const completeSocialRule = async (
  identity: LoyaltyIdentity,
  ruleId: string,
): Promise<SocialResult> => {
  const config = requireConfig();
  const raw = (await launcherPost('/customer/social', {
    ...identityBody(config, identity),
    ruleId,
  })) as { success?: boolean; points?: number; updatedBalance?: number };

  return {
    success: raw.success ?? false,
    points: raw.points ?? 0,
    updatedBalance: raw.updatedBalance ?? 0,
  };
};

export interface RedeemRule {
  id: string;
  title: string;
  pointCost: number | null;
  redeemType: string;
  status: string;
  minRedeemablePoints: number | null;
  maxRedeemablePoints: number | null;
}

interface RawRedeemRule {
  id?: string | number;
  title?: string;
  customTitle?: string;
  pointCost?: number;
  redeemType?: string;
  status?: string;
  minRedeemablePoints?: number;
  maxRedeemablePoints?: number;
}

export const fetchRedeemRules = async (): Promise<RedeemRule[]> => {
  const config = requireConfig();
  const raw = (await launcherGet('/shop/rules/redeem', { shop: config.shopKey }, 'upstream')) as {
    rules?: RawRedeemRule[];
  };

  return (raw.rules ?? []).map((rule) => ({
    id: String(rule.id ?? ''),
    title: rule.customTitle ?? rule.title ?? '',
    pointCost: rule.pointCost ?? null,
    redeemType: rule.redeemType ?? '',
    status: rule.status ?? '',
    minRedeemablePoints: rule.minRedeemablePoints ?? null,
    maxRedeemablePoints: rule.maxRedeemablePoints ?? null,
  }));
};

// v1 handles fixed-cost rules only (spec): increment-type rules (min/max redeemable
// points) and rules with an unrecognized status are logged and hidden. status enum is
// undocumented upstream; '' (absent) and 'active' are treated as showable (spec S4).
export const isRedeemableCatalogRule = (rule: RedeemRule): boolean => {
  if (rule.pointCost === null) {
    return false;
  }
  if (rule.minRedeemablePoints !== null || rule.maxRedeemablePoints !== null) {
    b2bLogger.error(
      `Loyalty: hiding increment-type redeem rule ${rule.id} — variable-amount redemption is not supported in v1`,
    );
    return false;
  }
  if (rule.status !== '' && rule.status.toLowerCase() !== 'active') {
    b2bLogger.error(
      `Loyalty: hiding redeem rule ${rule.id} with unrecognized status "${rule.status}"`,
    );
    return false;
  }
  return true;
};

interface RedeemResult {
  success: boolean;
  couponCode: string;
}

export const redeemReward = async (
  identity: LoyaltyIdentity,
  ruleId: string,
): Promise<RedeemResult> => {
  const config = requireConfig();
  const raw = (await launcherPost('/customer/redeem', {
    ...identityBody(config, identity),
    ruleId,
    redemptionSource: 'buyer-portal',
  })) as { success?: boolean; couponCode?: string };

  return { success: raw.success ?? false, couponCode: raw.couponCode ?? '' };
};

export interface EarnedReward {
  id: string;
  couponCode: string;
  title: string;
  createdAt: string;
}

interface EarnedRewardPage {
  items: EarnedReward[];
  nextToken: string | null;
}

interface RawEarnedReward {
  id?: string | number;
  couponCode?: string;
  title?: string;
  createdAt?: string;
}

export const fetchEarnedRewards = async (
  identity: LoyaltyIdentity,
  nextToken?: string,
): Promise<EarnedRewardPage> => {
  const config = requireConfig();
  const params: Record<string, string> = identityParams(config, identity);
  if (nextToken) {
    params.nextToken = nextToken;
  }
  const raw = (await launcherGet('/customer/all-rewards', params, 'notEnrolled')) as {
    items?: RawEarnedReward[];
    nextToken?: string | null;
  };

  return {
    items: (raw.items ?? []).map((item) => ({
      id: String(item.id ?? ''),
      couponCode: item.couponCode ?? '',
      title: item.title ?? '',
      createdAt: item.createdAt ?? '',
    })),
    nextToken: raw.nextToken ?? null,
  };
};

export interface PointActivity {
  id: string;
  action: string;
  status: string;
  points: number;
  createdAt: string;
  customDescription: string;
}

interface PointActivityPage {
  items: PointActivity[];
  nextToken: string | null;
}

interface RawPointActivity {
  id?: string | number;
  action?: string;
  status?: string;
  points?: number;
  createdAt?: string;
  customDescription?: string;
}

export const fetchPointsHistory = async (
  identity: LoyaltyIdentity,
  nextToken?: string,
): Promise<PointActivityPage> => {
  const config = requireConfig();
  const params: Record<string, string> = { ...identityParams(config, identity), limit: '10' };
  if (nextToken) {
    params.nextToken = nextToken;
  }
  const raw = (await launcherGet('/customer/points', params, 'notEnrolled')) as {
    items?: RawPointActivity[];
    nextToken?: string | null;
  };

  return {
    items: (raw.items ?? []).map((item) => ({
      id: String(item.id ?? ''),
      action: item.action ?? '',
      status: item.status ?? '',
      points: item.points ?? 0,
      createdAt: item.createdAt ?? '',
      customDescription: item.customDescription ?? '',
    })),
    nextToken: raw.nextToken ?? null,
  };
};

interface ShippingCalculation {
  qualifies: boolean;
  threshold: number;
  eligibleSubtotal: number;
  remaining: number;
}

// The theme owns the eligibility math (excluded products/categories, LTL);
// the portal only renders. Both globals are absent until the theme ships them.
export const isShippingTrackerAvailable = (): boolean =>
  Boolean(window.loyaltyShippingConfig) &&
  typeof window.getLoyaltyShippingCalculation === 'function';

export const getShippingCalculation = async (): Promise<ShippingCalculation> => {
  const calculate = window.getLoyaltyShippingCalculation;
  if (!calculate) {
    throw new Error('Loyalty shipping calculation is not available on this store');
  }
  let raw: Awaited<ReturnType<typeof calculate>>;
  try {
    raw = await calculate();
  } catch (error) {
    b2bLogger.error(`Loyalty: shipping calculation failed — ${String(error)}`);
    throw new LoyaltyError('upstream');
  }
  const threshold = raw.threshold ?? window.loyaltyShippingConfig?.threshold ?? 0;
  const eligibleSubtotal = raw.eligibleSubtotal ?? 0;
  return {
    qualifies: raw.qualifies ?? false,
    threshold,
    eligibleSubtotal,
    remaining: raw.remaining ?? Math.max(0, threshold - eligibleSubtotal),
  };
};

// Rollout gate: mirrors the theme's parseAllowedTiers/isTierAllowed canon
// (influence-client.js) EXACTLY — CSV of tier names, trimmed, lowercased, blanks
// dropped; empty list = everyone; a null/blank tier title never matches a
// non-empty list (fail closed).
export const parseAllowedTiers = (csv: string | undefined): string[] =>
  (csv ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');

export const isTierAllowed = (tierTitle: string | null | undefined, allowed: string[]): boolean => {
  if (allowed.length === 0) {
    return true;
  }
  if (!tierTitle) {
    return false;
  }
  return allowed.includes(tierTitle.trim().toLowerCase());
};

// The `|| {}` mirrors the theme's cart-panel guard: a missing/blocked global
// degrades to an empty allowlist (fail open), never a throw.
export const getAllowedTiers = (): string[] =>
  parseAllowedTiers((window.loyaltyRolloutConfig || {}).allowedTiers);
