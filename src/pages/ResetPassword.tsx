import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, Sparkles } from "lucide-react";
import { TaskResetPassword } from "@clerk/react";
import { SEOHead } from "@/components/SEOHead";

export default function ResetPasswordPage() {
  const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim());

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <SEOHead
        title="Reset Password — SlidePix"
        description="Reset your SlidePix password using Clerk."
        path="/reset-password"
        noIndex
      />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-[2rem] border border-white/10 bg-card/30 p-6 backdrop-blur-xl sm:p-8"
        >
          <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Clerk Password Reset
          </div>

          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Reset your password</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Use the Clerk reset flow to finish your password update securely.
              </p>
            </div>
            <div className="hidden rounded-full border border-white/10 bg-white/5 p-3 text-muted-foreground sm:flex">
              <Lock className="h-5 w-5" />
            </div>
          </div>

          {clerkEnabled ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-3">
              <TaskResetPassword />
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-6 text-center">
              <p className="text-sm leading-6 text-muted-foreground">
                Configure <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px]">VITE_CLERK_PUBLISHABLE_KEY</code> to enable Clerk password reset.
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <Link to="/auth?mode=sign-in" className="inline-flex items-center gap-2 transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
