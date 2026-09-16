/** One active subscription charged to the card being deleted, ready for display. */
export interface AffectedSubscription {
  publicId: string;
  /** null when the product lookup failed — the warning still counts it. */
  productName: string | null;
  frequencyDays: number;
}
