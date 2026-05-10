import Link from "next/link";
import { ArrowRight, Layers3, Presentation, Sparkles, Wand2, SlidersHorizontal } from "lucide-react";

const highlights = [
  {
    title: "Narrative-first generation",
    description: "Start from one idea and let SlidePix shape the deck structure, flow, and visual direction.",
    icon: Wand2,
  },
  {
    title: "Style-led design system",
    description: "Choose a visual language first, then let the presentation adapt to the tone you want.",
    icon: SlidersHorizontal,
  },
  {
    title: "Export-ready output",
    description: "Move from concept to a polished deck you can refine, present, and export cleanly.",
    icon: Layers3,
  },
];

export default function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <img src="/logo-transparent.png" alt="SlidePix" className="h-8 w-8 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-foreground">SlidePix</span>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tighter text-primary">
                  Studio
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">AI Presentation Builder</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/pricing"
              className="hidden rounded-full border border-border px-4 py-2 text-xs font-medium tracking-wider text-foreground transition-all hover:bg-accent sm:inline-flex"
            >
              Pricing
            </Link>
            <Link
              href="/slides"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium tracking-wider text-background transition-all hover:opacity-90"
            >
              Open studio
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.14),transparent_26%),linear-gradient(to_bottom,rgba(2,6,23,0.04),transparent_30%)] pointer-events-none" />
          <div className="mx-auto grid w-full max-w-7xl gap-16 px-4 pb-20 pt-10 md:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-16">
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary shadow-sm">
                <Sparkles className="h-3 w-3" />
                SlidePix Studio
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-tight text-foreground md:text-6xl">
                A polished front door for the studio.
                <span className="mt-3 block bg-gradient-to-r from-sky-400 via-blue-500 to-violet-500 bg-clip-text text-transparent">
                  The work lives on `/slides`.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
                SlidePix turns a rough topic into a presentation flow, then opens the full deck-building studio on the slides route when you’re ready to work.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/slides"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-all hover:opacity-90"
                >
                  Open the studio
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-all hover:bg-accent"
                >
                  View pricing
                </Link>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {["Idea to deck", "Style-first workflow", "Export-ready output"].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground shadow-sm backdrop-blur"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10">
              <div className="rounded-[2rem] border border-border/60 bg-card/80 p-4 shadow-[0_30px_120px_-50px_rgba(15,23,42,0.65)] backdrop-blur-xl md:p-6">
                <div className="rounded-[1.6rem] border border-border/60 bg-background/80 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Presentation className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Slides route</p>
                        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Canonical workspace</p>
                      </div>
                    </div>
                    <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-500">
                      Ready
                    </div>
                  </div>

                  <div className="mt-6 rounded-[1.5rem] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.16),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.92))] p-6 text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">Workflow preview</p>
                    <h2 className="mt-3 text-2xl font-black leading-tight md:text-3xl">
                      Start with one idea and turn it into a polished deck
                    </h2>
                    <p className="mt-3 max-w-md text-sm leading-6 text-white/70">
                      The slide workspace keeps the generator, preview, and export flow. `/` stays focused on discovery.
                    </p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {highlights.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
                              <Icon className="h-3.5 w-3.5" />
                              {item.title}
                            </div>
                            <p className="mt-3 text-sm leading-6 text-white/75">{item.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between rounded-[1.25rem] border border-border/60 bg-muted/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">Need the full studio?</p>
                      <p className="text-xs text-muted-foreground">Jump straight into `/slides`.</p>
                    </div>
                    <Link
                      href="/slides"
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-accent"
                    >
                      Open
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
