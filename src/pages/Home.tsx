import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Presentation, Sparkles } from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";

const templates = [
  {
    title: "Investor update",
    detail: "A clean 10-slide deck for product, traction, and roadmap.",
    prompt: "Create a 10-slide investor update for our SaaS launch.",
    tint: "from-sky-500/10 via-background to-primary/5",
    badge: "Board-ready",
    meta: "10 slides · focused story",
  },
  {
    title: "Sales deck",
    detail: "An executive-ready narrative for enterprise buyers.",
    prompt: "Create a polished sales deck for enterprise clients.",
    tint: "from-violet-500/10 via-background to-fuchsia-500/5",
    badge: "Lead conversion",
    meta: "12 slides · buyer proof",
  },
  {
    title: "Workshop outline",
    detail: "A structured presentation for internal sessions.",
    prompt: "Outline a workshop deck for a marketing team.",
    tint: "from-emerald-500/10 via-background to-teal-500/5",
    badge: "Team session",
    meta: "8 slides · facilitation flow",
  },
];

const pillars = [
  {
    title: "Prompt to structure",
    description: "Start with one sentence and get a clear presentation direction in seconds.",
  },
  {
    title: "Slide-first workflow",
    description: "Everything in the app is centered on deck creation, review, and export.",
  },
  {
    title: "Polished by default",
    description: "Use modern slide styles, image sourcing, and editable layouts without extra setup.",
  },
];

const productCards = [
  {
    title: "Slide Studio",
    description: "Turn a brief into a polished deck with structure, style, and export-ready layouts.",
  },
  {
    title: "Slide Pro",
    description: "A faster path to better presentations for teams that ship decks every week.",
  },
  {
    title: "Deck History",
    description: "Keep every presentation organized in one place while staying focused on slides.",
  },
];

const newsRows = [
  {
    eyebrow: "OUR JOURNAL",
    title: "Latest from the deck blog",
    empty: "No slide notes published yet.",
  },
  {
    eyebrow: "TESTIMONIALS",
    title: "What users are saying",
    empty: "No testimonials yet.",
  },
  {
    eyebrow: "FROM US",
    title: "Latest slide news",
    empty: "No updates yet.",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    navigate(`/slides?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <PageLayout>
      <SEOHead
        title="SlidePix — AI presentation builder"
        description="Create polished presentations from a simple brief. Slide-first workflow, modern layouts, and fast exports."
        keywords="AI slides, presentation generator, pitch deck, deck builder, slides"
        path="/"
      />

      <div className="relative overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            aria-hidden
            className="absolute -top-24 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, hsla(210, 80%, 68%, 0.18) 0%, hsla(220, 70%, 58%, 0.08) 38%, transparent 70%)",
            }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="absolute right-[8%] top-[12%] h-64 w-64 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, hsla(258, 72%, 66%, 0.12) 0%, transparent 70%)",
            }}
            animate={{ y: [0, -18, 0], scale: [1, 1.12, 1] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] [background-size:56px_56px]" />
        </div>

        <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center px-4 py-20 md:px-8 md:py-24 lg:px-10 xl:px-12">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 lg:gap-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="mx-auto flex w-full max-w-4xl flex-col items-center text-center"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary shadow-sm">
                <Sparkles className="h-3 w-3" />
                Presentation workspace
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5.25rem] xl:leading-[0.92] md:whitespace-nowrap">
                Turn a <span className="ml-2 bg-gradient-to-r from-primary via-sky-500 to-violet-500 bg-clip-text text-transparent inline">brief</span>
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg xl:max-w-3xl">
                Describe the topic, launch the deck, and keep the experience centered on presentation creation.
              </p>

              <div className="mt-9 w-full max-w-[56rem] rounded-[1.75rem] border border-border/60 bg-card/70 p-4 text-left shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl md:p-5 lg:p-6">
                <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  <Presentation className="h-3.5 w-3.5 text-primary" />
                  Start with a deck prompt
                </div>

                <div className="relative mt-3 rounded-[1.5rem] border border-border/50 bg-background/70 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:p-4">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="Create a 10-slide launch deck for our new analytics product"
                    rows={3}
                    className="min-h-[4.75rem] w-full resize-none border-0 bg-transparent px-1 py-0.5 pr-16 text-[15px] leading-6 text-foreground placeholder:text-muted-foreground/50 focus:outline-none md:min-h-[5.25rem]"
                  />
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="absolute right-3.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-[1.02] hover:opacity-95"
                    aria-label="Open Slides"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5">
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60">
                    Starter templates
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {templates.map((template, index) => (
                      <button
                        key={template.title}
                        type="button"
                        onClick={() => setPrompt(template.prompt)}
                        className="group relative overflow-hidden rounded-[1.35rem] border border-border/50 bg-background/60 p-4 text-left transition-all hover:border-primary/30 hover:bg-background/80"
                      >
                        <div className={`absolute inset-0 rounded-[1.35rem] bg-gradient-to-br ${template.tint} opacity-65 transition-opacity group-hover:opacity-95`} aria-hidden />
                        <div className="relative flex h-full min-h-[11rem] flex-col">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] font-mono text-muted-foreground/40">
                              0{index + 1}
                            </div>
                            <div className="rounded-full border border-border/40 bg-background/50 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 transition-colors group-hover:border-primary/20 group-hover:text-primary">
                              {template.badge}
                            </div>
                          </div>
                          <h3 className="mt-3 text-sm font-semibold text-foreground">
                            {template.title}
                          </h3>
                          <p className="mt-1.5 max-w-[18rem] text-xs leading-5 text-muted-foreground">
                            {template.detail}
                          </p>

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="h-12 rounded-xl border border-border/40 bg-background/60 p-2">
                              <div className="h-2 w-8 rounded-full bg-foreground/10" />
                              <div className="mt-2 h-5 w-12 rounded-lg bg-foreground/10" />
                            </div>
                            <div className="h-12 rounded-xl border border-border/40 bg-background/60 p-2">
                              <div className="h-2 w-10 rounded-full bg-foreground/10" />
                              <div className="mt-2 h-5 w-9 rounded-lg bg-foreground/10" />
                            </div>
                            <div className="h-12 rounded-xl border border-border/40 bg-background/60 p-2">
                              <div className="h-2 w-7 rounded-full bg-foreground/10" />
                              <div className="mt-2 h-5 w-14 rounded-lg bg-foreground/10" />
                            </div>
                          </div>

                          <div className="mt-auto pt-4">
                            <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
                              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/55">
                                {template.meta}
                              </span>
                              <span className="text-[10px] font-semibold text-foreground/80 transition-colors group-hover:text-primary">
                                Use template →
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="relative mx-auto max-w-7xl px-4 pb-20 md:px-8 lg:px-10">
          <div className="grid gap-4 md:grid-cols-3">
            {pillars.map((pillar, index) => (
              <motion.article
                key={pillar.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="rounded-[1.5rem] border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Presentation className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{pillar.description}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="relative mx-auto max-w-7xl px-4 pb-24 md:px-8 lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            className="mb-6"
          >
            <span className="text-xs uppercase tracking-[0.28em] text-muted-foreground/60">Our Product</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">AI for presentations</h2>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {productCards.map((card, index) => (
              <motion.article
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="group rounded-[1.75rem] border border-border/40 bg-card/30 p-6 backdrop-blur-sm transition-all duration-300 hover:border-foreground/15 hover:bg-card/60"
              >
                <div className="mb-4 text-xs text-muted-foreground/60">0{index + 1}</div>
                <h3 className="text-lg font-semibold text-foreground">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
                <div className="mt-8 h-32 rounded-2xl border border-border/30 bg-background/50">
                  <div className="grid h-full grid-cols-5 gap-1 p-3 opacity-70">
                    {Array.from({ length: 15 }).map((_, cell) => (
                      <div key={cell} className="rounded bg-foreground/5" />
                    ))}
                  </div>
                </div>
                <div className="mt-4 text-xs text-muted-foreground/70">Explore slides →</div>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="relative mx-auto max-w-7xl px-4 py-24 md:px-8 lg:px-10">
          <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <span className="text-xs uppercase tracking-[0.28em] text-muted-foreground/60">Understand</span>
              <h2 className="mt-4 max-w-md text-4xl font-black tracking-tight md:text-6xl">
                The deck
                <span className="block text-muted-foreground/20">workflow</span>
              </h2>
            </motion.div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                "Start with a prompt and shape the story.",
                "Pick a visual direction that matches the audience.",
                "Review the outline and tweak each slide.",
                "Export once the deck feels right.",
              ].map((item, index) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="rounded-[1.5rem] border border-border/40 bg-background/40 p-5"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/40">Step 0{index + 1}</div>
                  <p className="mt-3 text-sm leading-6 text-foreground">{item}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative mx-auto max-w-5xl px-4 py-24 text-center md:px-8 lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
              <Sparkles className="h-3 w-3" />
              Slide Pro
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
              Introducing Slide Pro, a subscription to greatness
            </h2>
            <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Access sharper workflows, cleaner decks, and a focused presentation experience that stays centered on slides.
            </p>
            <button
              type="button"
              onClick={() => navigate("/slides")}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-all hover:opacity-90"
            >
              Learn more
              <ArrowRight className="h-4 w-4" />
            </button>
          </motion.div>
        </section>

        <section className="relative mx-auto max-w-7xl px-4 py-20 md:px-8 lg:px-10">
          <div className="space-y-16">
            {newsRows.map((row) => (
              <div key={row.title} className="grid gap-6 md:grid-cols-[0.7fr_1.3fr] md:items-start">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/40">{row.eyebrow}</div>
                  <h3 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">{row.title}</h3>
                </div>
                <div className="rounded-[1.75rem] border border-border/40 bg-card/20 p-10 text-center text-sm text-muted-foreground/50">
                  {row.empty}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
