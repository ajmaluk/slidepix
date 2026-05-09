import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Presentation } from "lucide-react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { useAuthSession } from "@/hooks/useAuthSession";

const navLinks = [
  { label: "Slides", href: "/slides" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim());

  const handleGetStarted = () => {
    if (session?.user?.id) {
      navigate("/slides");
      return;
    }

    navigate("/auth?mode=sign-up&redirect=/slides");
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="sticky top-3 z-50 mx-auto mt-3 flex w-[min(calc(100%-1rem),84rem)] items-center justify-between rounded-[1.5rem] border border-border/60 bg-card/70 px-4 py-3 shadow-[0_20px_80px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl md:px-6"
    >
      <Link to="/" className="flex items-center gap-3">
        <img src="/logo-transparent.png" alt="SlidePix" className="h-8 w-8 object-contain" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-foreground">SlidePix</span>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tighter text-primary">
              Studio
            </span>
          </div>
        </div>
      </Link>

      <div className="hidden items-center gap-6 md:flex">
        {navLinks.map((link) => (
          <Link
            key={link.label}
            to={link.href}
            className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate("/slides")}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium tracking-wider text-foreground transition-all hover:bg-foreground hover:text-background"
        >
          <Presentation className="h-3.5 w-3.5" />
          Open Slides
        </button>
        <button
          onClick={handleGetStarted}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium tracking-wider text-background transition-all hover:opacity-90"
        >
          Get Started
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <div className="hidden items-center gap-2 lg:flex">
          {clerkEnabled ? (
            <>
              <Show when="signed-out">
                <SignInButton mode="modal">Login</SignInButton>
                <SignUpButton mode="modal">Register</SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton afterSignOutUrl="/" />
              </Show>
            </>
          ) : (
            <>
              <Link
                to="/auth?mode=sign-in&redirect=/slides"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium tracking-wider text-foreground transition-all hover:bg-accent"
              >
                Login
              </Link>
              <Link
                to="/auth?mode=sign-up&redirect=/slides"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium tracking-wider text-foreground transition-all hover:bg-accent"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.nav>
  );
}
