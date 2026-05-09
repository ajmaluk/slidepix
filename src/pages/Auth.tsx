import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Sparkles } from "lucide-react";
import { SignIn, SignUp } from "@clerk/react";
import { SEOHead } from "@/components/SEOHead";

function AuthFeature({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
        <BadgeCheck className="h-4 w-4 text-emerald-400" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export default function Auth() {
  const location = useLocation();
  const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim());
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const mode = searchParams.get("mode");
  const redirectTarget = searchParams.get("redirect") || "/slides";

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="SlidePix Auth"
        description="Sign in or create a SlidePix account to build polished decks."
        path="/auth"
        noIndex
      />

      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-6 lg:py-8">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-8 lg:p-12"
        >
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
          <div className="relative z-10 flex h-full flex-col justify-between gap-10">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Presentation workspace
              </div>

              <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Welcome back to <span className="text-primary">SlidePix</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Sign in to continue generating decks, managing pricing, and opening your slide history.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <AuthFeature
                title="Deck generation"
                description="Create structured presentation outlines and polished slide visuals from a brief."
              />
              <AuthFeature
                title="Saved projects"
                description="Return to your stored slide history, draft decks, and ongoing presentation work."
              />
              <AuthFeature
                title="Billing access"
                description="Manage your plan and upgrades from the pricing area after login."
              />
              <AuthFeature
                title="Secure sessions"
                description="Your active Clerk session keeps navigation and authenticated actions consistent."
              />
            </div>
          </div>
        </motion.section>

        <section className="flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="space-y-5"
          >
            <div className="rounded-[2rem] border border-white/10 bg-card/30 p-4 backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Authentication
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                    {mode === "sign-up" ? "Create your account" : "Sign in to SlidePix"}
                  </h2>
                </div>
                <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                  Clerk
                </div>
              </div>

              {clerkEnabled ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-3">
                    <SignIn
                      routing="virtual"
                      signUpUrl="/auth?mode=sign-up"
                      forceRedirectUrl={redirectTarget}
                      fallbackRedirectUrl={redirectTarget}
                    />
                  </div>
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-3">
                    <SignUp
                      routing="virtual"
                      signInUrl="/auth?mode=sign-in"
                      forceRedirectUrl={redirectTarget}
                      fallbackRedirectUrl={redirectTarget}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-6 text-center">
                  <p className="text-lg font-semibold">Clerk is not configured yet</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Set <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px]">VITE_CLERK_PUBLISHABLE_KEY</code> in your environment, then reload to enable sign in and sign up.
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    <ArrowRight className="h-3.5 w-3.5" />
                    Configure Clerk
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}

