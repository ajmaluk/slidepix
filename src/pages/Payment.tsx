import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CreditCard, Shield, Globe, 
  ArrowLeft, Loader2, Sparkles,
  CheckCircle2, AlertTriangle
} from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { UserSubscription, getUserSubscription, calculateUpgradePrice, SubscriptionTier, getSubscriptionPlans, type SubscriptionPlan } from "@/lib/subscription";
import { useAuthSession } from "@/hooks/useAuthSession";
import { EdgeFunctionError, invokeEdgeFunction } from "@/lib/edgeFunctions";
import { BILLING_COUNTRIES } from "@/lib/countries";
import { BILLING_CATALOG } from "@/lib/billingCatalog";
import { toast } from "sonner";
import { loadScript } from "@paypal/paypal-js";

type CheckoutPlan = {
  id: SubscriptionTier;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  popular?: boolean;
};

export default function PaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const passedPlanKey = location.state?.planKey as SubscriptionTier | undefined;
  const passedPlanName = location.state?.planName as string | undefined;
  const passedBillingCycle = location.state?.billingCycle as "monthly" | "annual" | "yearly" | undefined;
  const { session, loading: sessionLoading } = useAuthSession();
  const [currentSub, setCurrentSub] = useState<UserSubscription | null>(null);
  const [dbPlans, setDbPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState<"monthly" | "yearly">(
    passedBillingCycle === "yearly" || passedBillingCycle === "annual" ? "yearly" : "monthly"
  );
  const [country, setCountry] = useState(BILLING_COUNTRIES[0]);
  const [countrySearch, setCountrySearch] = useState("");
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (sessionLoading) return;

      try {
        if (!session?.user) {
          if (!cancelled) {
            toast.error("Please login to proceed with payment");
            navigate("/auth");
          }
          return;
        }

        const [sub, plans] = await Promise.all([
          getUserSubscription(session.user.id),
          getSubscriptionPlans()
        ]);

        if (!cancelled) {
          setCurrentSub(sub);
          setDbPlans(plans);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [navigate, session, sessionLoading]);

  const displayPlans = useMemo(() => {
    if (dbPlans.length > 0) {
      return dbPlans.map((p) => ({
        id: p.tier,
        name: p.name,
        monthlyPrice: p.price_monthly,
        yearlyPrice: p.price_yearly,
        description: p.description || "",
        features: p.features || [],
        popular: p.highlighted,
      }));
    }
    // Use BILLING_CATALOG as source of truth (skip free tier)
    return BILLING_CATALOG.filter((p) => p.key !== "free").map((p) => ({
      id: p.key,
      name: p.name,
      monthlyPrice: p.monthlyBaseFee,
      yearlyPrice: p.annualBaseFee,
      description: p.description,
      features: p.features,
      popular: p.highlighted,
    })) satisfies CheckoutPlan[];
  }, [dbPlans]);

  const selectedPlan = useMemo(() => {
    return (
      displayPlans.find((p) => p.id === passedPlanKey) ||
      displayPlans.find((p) => p.name === passedPlanName) ||
      displayPlans[1]
    );
  }, [displayPlans, passedPlanKey, passedPlanName]);

  const billingCycleLabel = duration === "monthly" ? "Monthly" : "Annual";

  useEffect(() => {
    let cancelled = false;

    // Load PayPal v6 SDK
    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    if (!clientId || clientId === "sb" || clientId === "test") {
      console.warn("Using mock PayPal checkout because VITE_PAYPAL_CLIENT_ID is missing or set to test");
      // Simulate loaded
      setPaypalLoaded(true);
      return;
    }

    const initPayPal = async () => {
      try {
        setPaypalLoaded(false);
        const paypal = await loadScript({
          clientId: clientId,
          components: "buttons", // v6 standard buttons
          currency: country.currency
        });

        if (paypal && paypal.Buttons) {
          // Clear any existing buttons if country changed
          const container = document.getElementById("paypal-button-container");
          if (container) container.innerHTML = "";

          const buttons = paypal.Buttons({
            style: {
              layout: "vertical",
              color: "blue",
              shape: "rect",
              label: "pay"
            },
            createOrder: async () => {
              try {
                const data = await invokeEdgeFunction<{ orderId?: string }>(
                  "paypal-checkout",
                  {
                    action: "create_order",
                    planId: selectedPlan.id,
                    duration,
                    currency: country.currency,
                  },
                  { timeoutMs: 30000 }
                );

                if (!data?.orderId || typeof data.orderId !== "string") {
                  throw new Error("Payment provider did not return an order ID");
                }

                return data.orderId; // Must return the precise string ID for PayPal v6
              } catch (err: any) {
                if (err instanceof EdgeFunctionError && err.status === 404) {
                  toast.error("Payment service is not deployed yet. Deploy function: paypal-checkout.");
                } else {
                  toast.error("Could not initialize payment: " + (err?.message || "unknown error"));
                }
                throw err;
              }
            },
            onApprove: async (data) => {
              try {
                if (!data?.orderID) {
                  throw new Error("Missing payment order ID from PayPal approval");
                }

                setProcessing(true);
                await invokeEdgeFunction<{ success: boolean }>(
                  "paypal-checkout",
                  {
                    action: "capture_order",
                    orderId: data.orderID,
                    planId: selectedPlan.id,
                    duration, // Pass duration to ensure correct tiering
                  },
                  { timeoutMs: 45000 } // Extended timeout for capture
                );

                toast.success(`Successfully upgraded to ${selectedPlan.name}!`);
                navigate("/slides");
              } catch (err: any) {
                setProcessing(false);
                if (err instanceof EdgeFunctionError && err.status === 404) {
                  toast.error("Payment service is not deployed yet. Deploy function: paypal-checkout.");
                } else {
                  toast.error("Payment settlement failed: " + (err?.message || "Please contact support if funds were deducted."));
                }
              }
            },
            onCancel: () => {
              toast.info("Payment cancelled.");
            },
            onError: (err) => {
              console.error("PayPal Error:", err);
              toast.error("An error occurred during payment processing.");
            }
          });

          await buttons.render("#paypal-button-container");
          if (!cancelled) {
            setPaypalLoaded(true);
          }
        }
      } catch (err) {
        console.error("Failed to load PayPal SDK", err);
        if (!cancelled) {
          toast.error("Failed to load payment gateway");
        }
      }
    };

    initPayPal();

    return () => {
      cancelled = true;
    };
  }, [country.currency, selectedPlan.id, selectedPlan.name, duration, navigate]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return [];
    return BILLING_COUNTRIES.filter(c => 
      c.name.toLowerCase().includes(countrySearch.toLowerCase())
    ).slice(0, 5);
  }, [countrySearch]);



  const upgradeInfo = useMemo(() => {
    return calculateUpgradePrice(
      currentSub, 
      selectedPlan.id as SubscriptionTier, 
      duration === "yearly" ? 365 : 30
    );
  }, [selectedPlan.id, duration, currentSub]);

  const totalPrice = upgradeInfo.finalPrice;
  const displayPrice = country.symbol + totalPrice.toLocaleString();

  // The manual handlePayment is no longer needed since we use PayPal buttons directly

  if (loading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground font-medium">Preparing secure checkout...</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <SEOHead title="Payment — Secure Checkout" description="Complete your subscription to SlidePix. Secure payments and instant activation." path="/payment" noIndex />
      <div className="relative overflow-hidden">
        <AnimatePresence>
          {processing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md"
            >
              <div className="flex flex-col items-center gap-4 text-center p-8 rounded-3xl bg-card border border-border shadow-2xl max-w-sm">
                <div className="relative">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary opacity-50" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Verifying Payment</h3>
                  <p className="text-sm text-muted-foreground">
                    We're settling your transaction with PayPal and activating your Pro features. Please don't close this window.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_40%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_35%),linear-gradient(to_bottom,rgba(2,6,23,0.02),transparent_25%)]" />

        <div className="max-w-6xl mx-auto px-4 py-12 md:py-20">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <Button variant="ghost" size="sm" onClick={() => navigate("/pricing")} className="gap-2 rounded-full border border-border/50 bg-background/60 backdrop-blur-sm">
              <ArrowLeft className="w-4 h-4" />
              Back to plans
            </Button>
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              Secure checkout via PayPal
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2 space-y-8">
              <section className="space-y-6">
                <Card className="rounded-[28px] border-border/50 bg-card/75 backdrop-blur-xl shadow-[0_24px_80px_rgba(15,23,42,0.08)] overflow-hidden">
                  <CardContent className="p-6 md:p-8 space-y-6">
                    <div className="flex items-start justify-between gap-6 flex-wrap">
                      <div className="space-y-3 max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                          <Sparkles className="w-3.5 h-3.5" />
                          Secure Checkout
                        </div>
                        <div>
                          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Complete your upgrade</h2>
                          <p className="mt-2 text-muted-foreground text-sm md:text-base max-w-xl">
                            Review the selected plan, choose your billing cycle, and finish payment through PayPal.
                          </p>
                        </div>
                      </div>

                      <div className="min-w-[220px] rounded-2xl border border-border/50 bg-background/70 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected plan</div>
                        <div className="mt-2 flex items-center justify-between gap-4">
                          <div>
                            <div className="text-lg font-semibold">{selectedPlan.name}</div>
                            <div className="text-xs text-muted-foreground">{selectedPlan.description}</div>
                          </div>
                          {selectedPlan.popular && (
                            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                              Popular
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDuration("monthly")}
                        className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                          duration === "monthly"
                            ? "border-primary/40 bg-primary/10 shadow-sm"
                            : "border-border/50 bg-card/50 hover:border-primary/20 hover:bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold">Monthly</div>
                            <div className="text-xs text-muted-foreground">Flexible billing</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">{country.symbol}{selectedPlan.monthlyPrice}</div>
                            <div className="text-[11px] text-muted-foreground">/month</div>
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDuration("yearly")}
                        className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                          duration === "yearly"
                            ? "border-emerald-500/40 bg-emerald-500/10 shadow-sm"
                            : "border-border/50 bg-card/50 hover:border-emerald-500/20 hover:bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              Annual
                              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                                Save 20%
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">Best value billing</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">{country.symbol}{selectedPlan.yearlyPrice}</div>
                            <div className="text-[11px] text-muted-foreground">/year</div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/70 backdrop-blur-xl shadow-[0_18px_60px_rgba(15,23,42,0.06)] overflow-visible">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      Billing location
                    </CardTitle>
                    <CardDescription>Choose the billing country and currency used for this order.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 relative">
                    <div className="space-y-2 relative">
                      <Label>Country</Label>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="Search your country..."
                          value={countrySearch || country.name}
                          onChange={(e) => {
                            setCountrySearch(e.target.value);
                            setShowCountrySuggestions(true);
                          }}
                          onFocus={() => setShowCountrySuggestions(true)}
                          className="bg-background/60 pl-10"
                        />
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      </div>

                      <AnimatePresence>
                        {showCountrySuggestions && filteredCountries.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-50 w-full mt-1 bg-card border border-border rounded-2xl shadow-xl overflow-hidden"
                          >
                            {filteredCountries.map((c) => (
                              <button
                                key={c.name}
                                type="button"
                                className="w-full px-4 py-3 text-left text-sm hover:bg-accent transition-colors flex items-center justify-between gap-3"
                                onClick={() => {
                                  setCountry(c);
                                  setCountrySearch("");
                                  setShowCountrySuggestions(false);
                                }}
                              >
                                <span className="flex items-center gap-2">
                                  <Globe className="w-3 h-3 text-muted-foreground" />
                                  {c.name}
                                </span>
                                <span className="text-xs text-muted-foreground">{c.currency}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/70 border-border/50 backdrop-blur-xl shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      Secure payment via PayPal
                    </CardTitle>
                    <CardDescription>Cards and PayPal wallets are processed inside the secure checkout widget.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
                        <div className="font-semibold text-foreground">Instant activation</div>
                        <div className="mt-1 text-muted-foreground">Access unlocks after capture succeeds.</div>
                      </div>
                      <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
                        <div className="font-semibold text-foreground">Protected checkout</div>
                        <div className="mt-1 text-muted-foreground">PayPal handles card vaulting and authorization.</div>
                      </div>
                      <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
                        <div className="font-semibold text-foreground">Flexible billing</div>
                        <div className="mt-1 text-muted-foreground">Switch between monthly and annual pricing instantly.</div>
                      </div>
                    </div>

                    <div className="relative min-h-[170px] w-full rounded-3xl border border-border/50 bg-gradient-to-b from-background/80 to-background/60 p-4 flex items-center justify-center overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_50%)]" />
                      {!paypalLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm z-10 rounded-3xl">
                          <div className="flex flex-col items-center gap-3 text-center">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            <p className="text-xs text-muted-foreground">Loading PayPal secure buttons...</p>
                          </div>
                        </div>
                      )}
                      {(!import.meta.env.VITE_PAYPAL_CLIENT_ID || import.meta.env.VITE_PAYPAL_CLIENT_ID === "sb" || import.meta.env.VITE_PAYPAL_CLIENT_ID === "test") && paypalLoaded ? (
                        <Button 
                          className="w-full relative z-20 bg-[#0070ba] hover:bg-[#003087] text-white" 
                          onClick={async () => {
                            try {
                              setProcessing(true);
                              const data = await invokeEdgeFunction<{ orderId?: string }>(
                                "paypal-checkout",
                                {
                                  action: "create_order",
                                  planId: selectedPlan.id,
                                  duration,
                                  currency: country.currency,
                                },
                                { timeoutMs: 30000 }
                              );

                              if (!data?.orderId) throw new Error("No mock order ID returned");

                              await invokeEdgeFunction<{ success: boolean }>(
                                "paypal-checkout",
                                {
                                  action: "capture_order",
                                  orderId: data.orderId,
                                  planId: selectedPlan.id,
                                  duration,
                                },
                                { timeoutMs: 45000 }
                              );

                              toast.success(`Successfully upgraded to ${selectedPlan.name}!`);
                              navigate("/slides");
                            } catch (err: any) {
                              setProcessing(false);
                              toast.error(err.message || "Mock payment failed");
                            }
                          }}
                        >
                          Mock PayPal Checkout
                        </Button>
                      ) : (
                        <div id="paypal-button-container" className="w-full relative z-20" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </section>
            </div>

            <div className="lg:col-span-1">
              <Card className="border-border/50 bg-card/80 backdrop-blur-xl shadow-[0_20px_70px_rgba(15,23,42,0.12)] sticky top-24 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary via-emerald-500 to-cyan-500" />
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-xl">Order summary</CardTitle>
                    <span className="rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {billingCycleLabel}
                    </span>
                  </div>
                  <CardDescription>Review the plan, pricing, and location before paying.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-3xl border border-border/50 bg-secondary/20 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold">{selectedPlan.name} Plan</div>
                        <p className="text-xs text-muted-foreground mt-1">{selectedPlan.description}</p>
                      </div>
                      {selectedPlan.popular && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                          Popular
                        </span>
                      )}
                    </div>

                    <div className="flex items-end justify-between gap-4 pt-2">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current total</div>
                        <div className="text-3xl font-bold tracking-tight">{displayPrice}</div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{duration === "monthly" ? "Billed monthly" : "Billed annually"}</div>
                        <div className="mt-1">Currency: {country.currency}</div>
                      </div>
                    </div>

                    {currentSub && currentSub.tier !== "free" && currentSub.subscription_active && upgradeInfo.discount > 0 && (
                      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/15 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 font-medium">
                        <span>Pro-rated upgrade discount</span>
                        <span>-{country.symbol}{upgradeInfo.discount}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">What’s included</p>
                    <ul className="space-y-2.5">
                      {selectedPlan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 rounded-2xl border border-border/40 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-border/50 bg-background/60 p-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Billing location</span>
                      <span className="font-medium">{country.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Currency</span>
                      <span className="font-medium">{country.currency}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive text-xs w-full flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="leading-5">
                      <strong>Strict no refund and no return policy.</strong><br />
                      All sales are final after activation.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground mt-2 border-t border-border/20 w-full pt-4">
                    <Shield className="w-3 h-3 text-emerald-500" />
                    Secure 256-bit SSL encrypted checkout via PayPal
                  </div>
                </CardFooter>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
