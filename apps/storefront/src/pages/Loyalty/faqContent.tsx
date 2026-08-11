import { ReactNode } from 'react';
import { Link } from '@mui/material';

// The FAQ renders only inside the signed-in portal, so its links are contact
// channels, never storefront URLs. mailto:/tel: invoke a protocol handler and
// never navigate, which is why neither needs target="_top" the way the
// storefront CTAs in BenefitsTab/LoyaltyHero do.
const REP_EMAIL = 'contactsmartrewards@storesupply.com';
const REP_PHONE = '1-833-397-2619';

function RepEmail() {
  return (
    <Link href={`mailto:${REP_EMAIL}`} underline="always">
      {REP_EMAIL}
    </Link>
  );
}

function RepPhone() {
  return (
    <Link href="tel:+18333972619" underline="always">
      {REP_PHONE}
    </Link>
  );
}

interface FaqItem {
  question: string;
  answer?: ReactNode;
  bullets?: string[];
}

interface FaqSection {
  title: string;
  items: FaqItem[];
}

export const FAQ_INTRO =
  'Smart Rewards is our free loyalty program for Store Supply Warehouse customers. Every qualifying purchase earns points that convert into store credit, every tier gets free ground shipping on orders over $300, and higher tiers add an account rep and early access to closeouts and new products.';

export const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'About Smart Rewards',
    items: [
      {
        question: 'What is Smart Rewards?',
        answer:
          'A free rewards program for Store Supply Warehouse customers. Every qualifying purchase earns you points that convert into store credit you can use on future orders. You also get free ground shipping on orders over $300, and at higher tiers, early access to new products and an account rep.',
      },
      {
        question: 'Does it cost anything to be in the program?',
        answer: "No. There's no cost to be in Smart Rewards.",
      },
      {
        question: 'Do I need to sign up?',
        answer:
          "No. If you're an existing Store Supply Warehouse customer, you're already in. Your tier is based on your ordering history.",
      },
      {
        question: 'Who is eligible?',
        answer:
          'All Store Supply Warehouse customers. Your tier is determined by your purchasing activity over the past 12 months.',
      },
    ],
  },
  {
    title: 'Program Tiers',
    items: [
      {
        question: 'What are the different program tiers?',
        answer:
          "Smart Rewards has three tiers. Every purchase earns you points based on your tier's rate, calculated on your order total after discounts, excluding tax and shipping. Your points can be redeemed for store credit certificates.",
        bullets: [
          'Essential: 1% rate (after $500 in annual purchases), free ground shipping on orders over $300.',
          'Select: 2% rate, free ground shipping on orders over $300, an account rep, and 48-hour early access to closeouts and new products.',
          'Signature: 3% rate (the highest), free ground shipping on orders over $300, a dedicated account rep, and 1-week early access to closeouts and new products.',
        ],
      },
      {
        question: 'How is my tier determined?',
        answer:
          'We look at your order count and annual spend over the past 12 months, updated monthly.',
      },
      {
        question: 'What do I need to qualify for each tier?',
        bullets: [
          "Essential: You're in after your first order.",
          'Select: 8+ orders per year, or $2,000+ in annual purchases.',
          'Signature: 16+ orders per year, or $5,000+ in annual purchases.',
        ],
      },
      {
        question: 'How do I move up to a higher tier?',
        answer:
          "When your orders reach the next tier's threshold, you move up automatically. No application needed. We check monthly, so you'll move as soon as you qualify.",
      },
      {
        question: 'Can my tier go down?',
        answer:
          "Yes. If your ordering falls below your current tier's threshold over a 12-month period, your tier may change. We'll give you 30 days' notice before any change takes effect.",
      },
      {
        question: 'How often is my tier reviewed?',
        answer: 'Monthly. We look at your orders from the past 12 months.',
      },
      {
        question: 'Where can I see my current tier?',
        // Reworded: was "Log in at https://www.storesupply.com/login.php#/login to
        // see your tier, benefits, and progress."
        answer: 'Your tier, benefits, and progress are on the My benefits tab.',
      },
    ],
  },
  {
    title: 'Earning and Redeeming Credit',
    items: [
      {
        question: 'How do I earn credit?',
        answer:
          "Each purchase earns you points based on your tier's credit rate (1% for Essential, 2% for Select, 3% for Signature). Points are calculated on your order total after any discounts, excluding tax and shipping charges.",
      },
      {
        question: 'How do I redeem my points?',
        answer:
          "You'll receive an email when points are in your account. You redeem points for store credit certificates. You can then apply the certificates to any future order.",
      },
      {
        question: 'How long are my store credit certificates valid?',
        answer: "12 months from the date they're issued.",
      },
      {
        question: 'Can I use store credit with other discounts?',
        answer:
          'Yes. Store credit certificates work alongside product discounts on the same order.',
      },
      {
        question: 'Is there a limit on how much credit I can use per order?',
        answer:
          'One store credit certificate per order. Certificates cannot be transferred to other accounts.',
      },
      {
        question: 'What counts toward my points calculation?',
        answer:
          'Your invoice total after product discounts, excluding tax and shipping charges. If you return an item, the refund amount is deducted from your next point calculation.',
      },
      {
        question: 'Do I earn points on every order at the Essential level?',
        answer:
          'At the Essential tier, you earn at a 1% rate once you reach $500 in annual purchases. After that threshold, your purchases earn points for the remainder of the year.',
      },
    ],
  },
  {
    title: 'Free Shipping',
    items: [
      {
        question: 'How does free shipping work?',
        answer: 'Every tier gets free ground shipping on all qualifying orders over $300.',
      },
      {
        question: 'How do I know if my order qualifies for free shipping?',
        answer:
          'Your cart shows your progress toward the $300 threshold as you shop. Once you cross $300, free ground shipping applies automatically at checkout.',
      },
      {
        question: 'Are there any shipping exclusions?',
        answer: 'Free shipping covers standard ground delivery. The following are excluded:',
        bullets: [
          'Oversized items and items requiring LTL (less-than-truckload) freight',
          'Items requiring special handling',
          'Shipments to Alaska, Hawaii, and Puerto Rico',
        ],
      },
      {
        question: 'Can I upgrade to faster shipping?',
        answer:
          'If you are located more than 1 shipping day away via ground shipping from one of our shipping locations, you may choose expedited shipping for an extra cost if you need your item faster than standard ground shipping can get it to you.',
      },
    ],
  },
  {
    title: 'Your Account Rep (Select and Signature Tiers)',
    items: [
      {
        question: 'What is an account rep?',
        answer:
          'At the Select tier, you have access to an account rep who can help with orders, product questions, stock availability, and recommendations. At Signature, you have a dedicated rep assigned specifically to your account.',
      },
      {
        question: 'How do I reach my account rep?',
        answer: (
          <>
            You can reach your rep by phone at <RepPhone /> or by email at <RepEmail />.
          </>
        ),
      },
      {
        question: 'How can my account rep help me?',
        answer:
          'Placing orders, sourcing specific products, checking stock availability, product recommendations for your store, and any questions about your account or benefits.',
      },
    ],
  },
  {
    title: 'Early Access (Select and Signature Tiers)',
    items: [
      {
        question: 'What is early access?',
        answer:
          "Select and Signature members see closeout deals and new products before they're available to all customers. Select gets 48 hours. Signature gets a full week.",
      },
      {
        question: 'How do I find early access products?',
        // Reworded: the second sentence was "You can also log in at
        // https://www.storesupply.com/login.php#/login to see what's open to you."
        answer:
          "We'll email you when early access items are available. You can also check the My benefits tab to see what's open to you.",
      },
      {
        question: 'Can my rep help me find early access products?',
        answer:
          'Yes. Your dedicated rep can flag items or categories that might be relevant based on your ordering patterns.',
      },
    ],
  },
  {
    title: 'Questions and Troubleshooting',
    items: [
      {
        question: 'Where can I see my benefits, credit balance, and tier status?',
        // Reworded: was "Log in at https://www.storesupply.com/login.php#/login to
        // find your tier, benefits, points, and any store credits." Split by where
        // each thing actually lives in the portal.
        answer:
          'Your tier and benefits are on the My benefits tab, your points balance is at the top of this page, and any store credit certificates are under My rewards.',
      },
      {
        question: 'I think my tier is wrong. What do I do?',
        answer: (
          <>
            Your tier is based on your orders over the past 12 months, updated monthly. If something
            looks off, contact us at <RepEmail /> and we&apos;ll look into it.
          </>
        ),
      },
      {
        question: 'Can I combine Smart Rewards with other promotions?',
        answer: (
          <>
            Store credit certificates work alongside product discounts. For questions about specific
            promotions, contact us at <RepEmail />.
          </>
        ),
      },
      {
        question: "I have a question that's not covered here. Who do I contact?",
        answer: (
          <>
            Reach us at <RepEmail />. Select and Signature members can also contact their account
            rep directly.
          </>
        ),
      },
    ],
  },
];
