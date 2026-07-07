import { LoyaltyTier, parseThreshold } from './api';

interface ParsedTier {
  tier: LoyaltyTier;
  threshold: number;
}

// Tier thresholds are strings with no documented unit: if ANY tier threshold
// fails to parse, the units are suspect — return null so callers hide the
// progress UI entirely.
export const findNextTier = (tiers: LoyaltyTier[], progress: number | null): ParsedTier | null => {
  if (progress === null) {
    return null;
  }
  const parsed = tiers
    .map((tier) => ({ tier, threshold: parseThreshold(tier.threshold) }))
    .filter((entry): entry is ParsedTier => entry.threshold !== null)
    .sort((a, b) => a.threshold - b.threshold);

  if (parsed.length !== tiers.length) {
    return null;
  }

  return parsed.find((entry) => entry.threshold > progress) ?? null;
};
