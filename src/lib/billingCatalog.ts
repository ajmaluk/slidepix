export type BillingPlanKey = "free" | "basic" | "pro" | "enterprise";

export type BillingPlan = {
  key: BillingPlanKey;
  name: string;
  description: string;
  monthlyBaseFee: number;
  annualBaseFee: number;
  freeTrialDays: number;
  publiclyAvailable: boolean;
  highlighted?: boolean;
  features: string[];
};

export const BILLING_PROVIDER = "firebase" as const;

export const BILLING_CATALOG: BillingPlan[] = [
  {
    key: "free",
    name: "Free",
    description: "Ideal for trying SlidePix and building your first decks.",
    monthlyBaseFee: 0,
    annualBaseFee: 0,
    freeTrialDays: 0,
    publiclyAvailable: true,
    features: [
      "Slide-first workspace access",
      "Starter style library",
      "Up to 3 deck generations/day",
      "PDF export",
      "Recent history saved locally",
      "Community support",
    ],
  },
  {
    key: "basic",
    name: "Basic",
    description: "Expanded tools for individuals who make decks regularly.",
    monthlyBaseFee: 15,
    annualBaseFee: 144,
    freeTrialDays: 7,
    publiclyAvailable: true,
    features: [
      "Everything in Free",
      "Up to 20 deck generations/day",
      "All starter templates",
      "Template-based deck drafts",
      "Persistent slide history",
      "Image sourcing support",
      "Priority Email Support",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    description: "Professional workflows for teams and power presenters.",
    monthlyBaseFee: 39,
    annualBaseFee: 372,
    freeTrialDays: 7,
    publiclyAvailable: true,
    highlighted: true,
    features: [
      "Everything in Basic",
      "Unlimited deck generations",
      "Brand kit aware layouts",
      "Editable outline workflow",
      "Version history and restore",
      "Advanced export controls",
      "Team collaboration",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    description: "Custom deployment and governance for larger organizations.",
    monthlyBaseFee: 129,
    annualBaseFee: 1200,
    freeTrialDays: 0,
    publiclyAvailable: true,
    features: [
      "Everything in Pro",
      "SSO and access controls",
      "Custom retention policies",
      "Workspace admin controls",
      "Dedicated support",
      "Usage analytics",
      "Dedicated Account Manager",
    ],
  },
];

export function normalizeBillingPlanKey(value: unknown): BillingPlanKey {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "basic" || normalized === "pro" || normalized === "enterprise") {
    return normalized;
  }
  return "free";
}

export function getBillingPlan(plan: BillingPlanKey): BillingPlan {
  const found = BILLING_CATALOG.find((item) => item.key === plan);
  if (!found) {
    return BILLING_CATALOG[0];
  }
  return found;
}
