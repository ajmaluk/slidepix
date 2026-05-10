import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "@/lib/navigation";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, CreditCard, ShieldCheck } from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { BILLING_CATALOG, type BillingPlan } from "@/lib/billingCatalog";
import { useAuthSession } from "@/hooks/useAuthSession";

export default function PaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading: sessionLoading } = useAuthSession();
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());

  const passedPlanKey = location.state?.planKey as BillingPlan["key"] | undefined;
  const passedPlanName = location.state?.planName as string | undefined;
  const passedBillingCycle = location.state?.billingCycle as "monthly" | "annual" | "yearly" | undefined;

  const selectedPlan = useMemo(() => {
    return (
      BILLING_CATALOG.find((plan) => plan.key === passedPlanKey) ||
      BILLING_CATALOG.find((plan) => plan.name === passedPlanName) ||
      BILLING_CATALOG.find((plan) => plan.key === "pro") ||
      BILLING_CATALOG[0]
    );
  }, [passedPlanKey, passedPlanName]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!session?.user) {
      navigate("/auth?mode=sign-in&redirect=/pricing");
    }
  }, [navigate, session?.user, sessionLoading]);

  return (
    <PageLayout>
      <SEOHead
        title="Billing — SlidePix"
        description="Review plan details and manage your SlidePix subscription with Clerk billing."
        path="/payment"
        noIndex
      />

      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[2rem] border border-white/10 bg-card/20 p-6 md:p-8 backdrop-blur-xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              Billing overview
            </div>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
              Finish your plan setup in Clerk
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              SlidePix now uses Clerk for subscriptions and billing management. Review the plan you selected, then manage everything from the hosted billing table.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Selected plan</div>
                <div className="mt-2 text-xl font-semibold text-foreground">{selectedPlan.name}</div>
                <p className="mt-2 text-sm text-muted-foreground">{selectedPlan.description}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Billing cycle</div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {passedBillingCycle === "yearly" || passedBillingCycle === "annual" ? "Annual" : "Monthly"}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Clerk will handle the active subscription state for the account.</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={() => navigate("/pricing")} className="gap-2 rounded-full">
                Back to pricing
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => navigate("/slides")} className="rounded-full">
                Open slides
              </Button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Hosted by Clerk</p>
                  <p className="text-xs text-muted-foreground">Subscriptions are managed in one place.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <BadgeCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Active session required</p>
                  <p className="text-xs text-muted-foreground">Only signed-in users can continue.</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-[2rem] border border-white/10 bg-card/20 p-4 md:p-6 backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Clerk billing</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Manage subscriptions</h2>
              </div>
              <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                User billing
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-6 text-center">
              <p className="text-lg font-semibold text-foreground">
                {clerkEnabled ? "Clerk billing is configured" : "Clerk billing is not configured yet"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {clerkEnabled
                  ? "Billing management is handled through Clerk dashboard flows and the plan details above."
                  : "Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in your environment, then configure plans in the Clerk dashboard to enable billing flows."}
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </PageLayout>
  );
}
