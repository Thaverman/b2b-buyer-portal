import { formatOrderId, parseOrderId } from './orderId';

describe('with a store suffix set', () => {
  beforeEach(() => {
    window.storeSuffix = 'SW';
  });

  afterEach(() => {
    delete window.storeSuffix;
  });

  it('encodes a numeric id to an obfuscated string with the suffix', () => {
    const result = formatOrderId(66996);

    // encoded body uses only the configured alphabet (uppercase + digits), min length 8
    expect(result).toMatch(/^[A-Z0-9]{8,}-SW$/);
    expect(result).not.toContain('66996');
  });

  it('accepts a numeric string as input', () => {
    expect(formatOrderId('66996')).toBe(formatOrderId(66996));
  });

  it('round-trips every id back to the original number', () => {
    [0, 1, 42, 123, 66996, 999999, 2147483647].forEach((id) => {
      expect(parseOrderId(formatOrderId(id))).toBe(id);
    });
  });

  it('decodes an obfuscated value whose suffix is missing (tolerant)', () => {
    const withSuffix = formatOrderId(123); // e.g. "XXXXXXXX-SW"
    const withoutSuffix = withSuffix.replace(/-SW$/, '');

    expect(parseOrderId(withoutSuffix)).toBe(123);
  });

  it('treats a pure-digit string as a real id', () => {
    expect(parseOrderId('66996')).toBe(66996);
  });

  it('returns null for unparseable input', () => {
    expect(parseOrderId('not-an-id')).toBeNull();
    expect(parseOrderId('')).toBeNull();
  });

  it('never emits the blocklisted word "uline"', () => {
    for (let id = 1; id <= 3000; id += 1) {
      expect(formatOrderId(id).toLowerCase()).not.toContain('uline');
    }
  });

  it('falls back to the plain id for invalid numeric input', () => {
    expect(formatOrderId('abc')).toBe('abc');
    expect(formatOrderId(-5)).toBe('-5');
    expect(formatOrderId(1.5)).toBe('1.5');
  });
});

describe('without a store suffix', () => {
  beforeEach(() => {
    delete window.storeSuffix;
  });

  it('returns the plain numeric id', () => {
    expect(formatOrderId(66996)).toBe('66996');
    expect(formatOrderId('66996')).toBe('66996');
  });

  it('still parses pure-digit ids', () => {
    expect(parseOrderId('66996')).toBe(66996);
  });
});
