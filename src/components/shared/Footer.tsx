import { Link } from "@/lib/navigation";

export default function Footer() {
  return (
    <footer className="border-t border-border/20 px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-6 border-b border-border/10 pb-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <img src="/logo-transparent.png" alt="SlidePix" className="h-6 w-6 object-contain opacity-70" />
              <span className="text-sm font-semibold text-foreground">SlidePix</span>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium tracking-[0.16em] uppercase text-muted-foreground">
            <Link to="/slides" className="transition-colors hover:text-foreground">Slides</Link>
            <Link to="/pricing" className="transition-colors hover:text-foreground">Pricing</Link>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-3 text-center text-xs text-muted-foreground/60 md:flex-row md:text-left">
          <p>Craft a presentation, refine the story, and export a polished deck.</p>
          <p>© 2026 SlidePix. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
