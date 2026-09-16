type OrdergrooveErrorKind =
  | 'unavailable'
  | 'sessionExpired'
  | 'rateLimited'
  | 'timeout'
  | 'upstream';

export class OrdergrooveError extends Error {
  kind: OrdergrooveErrorKind;

  constructor(kind: OrdergrooveErrorKind) {
    super(kind);
    this.kind = kind;
  }
}
