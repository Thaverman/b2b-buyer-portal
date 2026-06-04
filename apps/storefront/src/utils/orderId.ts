import Sqids, { defaultOptions } from 'sqids';

const ALPHABET = 'JH4D0BET3UA1W5VO8XZYIRLCGK7FQS96N2MP';
const MIN_LENGTH = 8;

const sqids = new Sqids({
  alphabet: ALPHABET,
  minLength: MIN_LENGTH,
  blocklist: new Set([...defaultOptions.blocklist, 'Uline']),
});

/** The store suffix set by the host project; obfuscation is active only when present. */
function getStoreSuffix(): string {
  return (window.BC_CONTEXT?.storeSuffix ?? '').trim();
}

/** Real numeric id -> display string. Falls back to the plain id when no suffix is set. */
export function formatOrderId(id: number | string): string {
  const numeric = Number(id);
  const suffix = getStoreSuffix();

  if (!suffix || !Number.isInteger(numeric) || numeric < 0) {
    return String(id);
  }

  return `${sqids.encode([numeric])}-${suffix}`;
}

/** Display string (or raw route param) -> real numeric id, or null if it can't be resolved. */
export function parseOrderId(value: string): number | null {
  const raw = (value ?? '').trim();

  if (raw === '') {
    return null;
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw); // pure digits = real id
  }

  const encoded = raw.replace(/-[^-]*$/, ''); // strip trailing -SUFFIX if present
  const [decoded] = sqids.decode(encoded);

  return decoded ?? null;
}

/**
 * Normalizes a search-box value: if it is one of our obfuscated order ids, returns
 * the decoded real id as a string; otherwise returns the input unchanged. Round-trip
 * validation (re-encoding the decoded id must reproduce the input) ensures free text,
 * PO numbers, and raw numeric ids pass through untouched.
 */
export function decodeOrderIdForSearch(value: string): string {
  const trimmed = (value ?? '').trim();
  const decoded = parseOrderId(trimmed);

  if (decoded != null && formatOrderId(decoded) === trimmed) {
    return String(decoded);
  }

  return value;
}
