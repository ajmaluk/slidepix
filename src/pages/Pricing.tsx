import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Lock, LogIn, Loader2, BadgeInfo, CalendarDays, ShieldCheck } from "lucide-react";
import { PricingTable } from "@clerk/react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";
import { isPaidActivated } from "@/lib/subscription";
import { useAuthSession } from "@/hooks/useAuthSession";
import { toast } from "sonner";
import { BILLING_CATALOG, type BillingPlan } from "@/lib/billingCatalog";

export default function PricingPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuthSession();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim());

  const displayPlans = BILLING_CATALOG;

  const handleAction = (plan: BillingPlan) => {
    if (!session) {
      toast("Authentication Required", {
        description: "Please login to subscribe or upgrade your plan.",
        icon: <LogIn className="w-4 h-4" />,
      });
      navigate("/auth");
      return;
    }

    if (plan.key === "enterprise") {
      navigate("/contact-sales");
      return;
    }

    if (plan.key === "free") {
      navigate("/slides");
      return;
    }

    // Navigate to local payment flow
    navigate("/payment", { state: { planKey: plan.key, billingCycle } });
  };

  const getPriceLabel = (plan: BillingPlan) => {
    if (plan.key === "free") {
      return "$0";
    }

    return billingCycle === "monthly" ? `$${plan.monthlyBaseFee}` : `$${plan.annualBaseFee}`;
  };

  const getPeriodLabel = (plan: BillingPlan) => {
    if (plan.key === "free") {
      return "forever";
    }

    return billingCycle === "monthly" ? "/month" : "/year";
  };

  return (
    <PageLayout>
      <SEOHead 
        title="Pricing — SlidePix Plans" 
        description="Choose the plan that fits your presentation workflow. From free slide drafts to professional and enterprise-grade deck creation." 
        path="/pricing"
        keywords="SlidePix pricing, presentation plans, deck subscription, slide generator pricing"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Pricing", url: "/pricing" }
        ]}
        jsonLd={[{
          "@type": "Product",
          "name": "SlidePix Subscription",
          "description": "Subscription plans for SlidePix presentation services.",
          "brand": {
            "@type": "Brand",
            "name": "SlidePix"
          },
          "offers": {
            "@type": "AggregateOffer",
            "priceCurrency": "USD",
            "lowPrice": "0",
            "highPrice": "129",
            "offerCount": displayPlans.length,
            "offers": displayPlans.map((plan) => ({
              "@type": "Offer",
              "name": plan.name,
              "price": plan.key === "free" ? "0" : String(billingCycle === "monthly" ? plan.monthlyBaseFee : plan.annualBaseFee),
              "priceCurrency": "USD",
              "description": plan.description,
              "availability": "https://schema.org/InStock",
              "priceValidUntil": "2027-12-31"
            }))
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "reviewCount": "1280",
            "bestRating": "5",
            "worstRating": "1"
          }
        }, {
          "@type": "FAQPage",
          "mainEntity": [
            { "@type": "Question", "name": "Is there a free plan?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. SlidePix includes a free tier for trying the slide workflow with no credit card required." }},
            { "@type": "Question", "name": "Can I upgrade or downgrade at any time?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. You can move between plans as your presentation needs change." }},
            { "@type": "Question", "name": "What payment methods are accepted?", "acceptedAnswer": { "@type": "Answer", "text": "The payment flow supports the configured checkout provider and enterprise invoicing can be arranged separately." }},
            { "@type": "Question", "name": "Is there a free trial for paid plans?", "acceptedAnswer": { "@type": "Answer", "text": "Yes, eligible paid plans include a trial period so you can evaluate the workflow before committing." }},
            { "@type": "Question", "name": "What happens when my subscription expires?", "acceptedAnswer": { "@type": "Answer", "text": "Your account moves back to the free tier and your saved slide history remains available according to your storage rules." }}
          ]
        }]}
      />
      <section className="py-20 md:py-32 px-4 text-center">
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs tracking-widest uppercase text-muted-foreground/60">Pricing</motion.span>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl md:text-6xl font-bold tracking-tight mt-4 mb-6">Simple, transparent pricing</motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-muted-foreground max-w-xl mx-auto">Start for free, upgrade when you need more power.</motion.p>

        <div className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-border/40 bg-card/30 p-1">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${billingCycle === "monthly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            Monthly billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("annual")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${billingCycle === "annual" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            Annual billing
          </button>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 pb-20">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading plans...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {displayPlans.map((plan, i) => (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`p-6 rounded-2xl border ${plan.highlighted ? "border-foreground/30 bg-card/50 relative" : "border-border/30 bg-card/20"}`}
              >
                {plan.highlighted && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-foreground text-background text-[10px] font-medium tracking-wider">POPULAR</span>}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {plan.publiclyAvailable && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500"><ShieldCheck className="w-3 h-3" /> Public</span>}
                  {plan.freeTrialDays > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-500"><CalendarDays className="w-3 h-3" /> {plan.freeTrialDays} day trial</span>}
                </div>
                <div className="flex items-baseline gap-1 mt-3 mb-1">
                  <span className="text-4xl font-bold">{getPriceLabel(plan)}</span>
                  <span className="text-sm text-muted-foreground">{getPeriodLabel(plan)}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{plan.description}</p>
                {plan.key !== "free" && (
                  <div className="mb-4 rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
                    <BadgeInfo className="inline-block mr-1 w-3 h-3 align-[-2px]" />
                    <span className="font-medium text-foreground">{billingCycle === "monthly" ? `$${plan.monthlyBaseFee}` : `$${plan.annualBaseFee}`}</span>
                    <span className="ml-1">{billingCycle === "monthly" ? "monthly base fee" : "annual base fee"}</span>
                  </div>
                )}
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="w-3.5 h-3.5 text-foreground/50" />{feature}</li>
                  ))}
                </ul>
                {(!isPaidActivated && plan.key !== "free") ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl text-sm font-medium border border-border text-muted-foreground bg-accent/10 cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Lock className="w-3.5 h-3.5" /> Under Maintenance
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction(plan)}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${plan.highlighted ? "bg-foreground text-background hover:opacity-90" : "border border-border hover:bg-card"}`}
                  >
                    {!session && plan.key !== "free" ? "Login to Buy" : plan.key === "free" ? "Open Slides" : "Buy Now"}
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <section className="max-w-7xl mx-auto px-4 pb-24">
        <div className="mb-6 flex flex-col gap-2 text-center">
          <span className="text-xs tracking-widest uppercase text-muted-foreground/60">Clerk Billing</span>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Manage subscriptions through Clerk</h2>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Use Clerk's billing dashboard to keep plan changes, subscriptions, and checkout flows in one place.
          </p>
        </div>

        {clerkEnabled ? (
          <div className="rounded-[2rem] border border-border/30 bg-card/20 p-4 md:p-6 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.55)]">
            <PricingTable />
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-border/40 bg-card/10 px-6 py-14 text-center">
            <ShieldCheck className="mx-auto mb-4 h-6 w-6 text-muted-foreground/60" />
            <h3 className="text-lg font-semibold mb-2">Clerk billing is not configured yet</h3>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Set <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">VITE_CLERK_PUBLISHABLE_KEY</code> in your environment, then configure plans in the Clerk dashboard to enable the hosted pricing table here.
            </p>
          </div>
        )}
      </section>
    </PageLayout>
  );
}
