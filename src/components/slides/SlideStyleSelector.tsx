import React from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SlideStyle, STYLE_PRESETS } from '@/lib/slides';

interface SlideStyleSelectorProps {
  selectedStyle: SlideStyle;
  onSelect: (style: SlideStyle) => void;
  className?: string;
}

const STYLE_ART: Record<SlideStyle, {
  tagline: string;
  detail: string;
  bestFor: string;
  monogram: string;
  accent: string;
  glow: string;
}> = {
  freestyle: {
    tagline: "Adaptive energy",
    detail: "Loose rhythm, expressive motion, and room to improvise.",
    bestFor: "Brainstorms",
    monogram: "F",
    accent: "from-orange-400/30 via-rose-400/10 to-transparent",
    glow: "shadow-[0_28px_90px_-40px_rgba(251,146,60,0.45)]",
  },
  academic: {
    tagline: "Structured clarity",
    detail: "Formal pacing with an editorial, citation-friendly feel.",
    bestFor: "Reports",
    monogram: "A",
    accent: "from-sky-400/25 via-indigo-400/10 to-transparent",
    glow: "shadow-[0_28px_90px_-40px_rgba(59,130,246,0.35)]",
  },
  minimal: {
    tagline: "Whitespace first",
    detail: "Quiet layouts, sharp contrast, and a calm visual hierarchy.",
    bestFor: "Product stories",
    monogram: "M",
    accent: "from-slate-300/35 via-slate-200/10 to-transparent",
    glow: "shadow-[0_28px_90px_-40px_rgba(148,163,184,0.28)]",
  },
  professional: {
    tagline: "High contrast",
    detail: "Crisp dark surfaces with a boardroom-ready finish.",
    bestFor: "Executive decks",
    monogram: "P",
    accent: "from-blue-500/35 via-violet-500/15 to-transparent",
    glow: "shadow-[0_28px_90px_-40px_rgba(59,130,246,0.35)]",
  },
  botanical: {
    tagline: "Soft organic",
    detail: "Gentle tonal shifts with a natural, breathable layout.",
    bestFor: "Wellness",
    monogram: "B",
    accent: "from-emerald-400/25 via-green-300/10 to-transparent",
    glow: "shadow-[0_28px_90px_-40px_rgba(16,185,129,0.32)]",
  },
  wabisabi: {
    tagline: "Quiet imperfection",
    detail: "Warm neutrals, handmade texture, and restrained balance.",
    bestFor: "Reflection",
    monogram: "W",
    accent: "from-amber-300/30 via-stone-300/10 to-transparent",
    glow: "shadow-[0_28px_90px_-40px_rgba(217,119,6,0.26)]",
  },
  memphis: {
    tagline: "Playful geometry",
    detail: "Lighthearted composition with bright accents and motion.",
    bestFor: "Workshops",
    monogram: "M",
    accent: "from-pink-300/25 via-yellow-200/10 to-transparent",
    glow: "shadow-[0_28px_90px_-40px_rgba(236,72,153,0.3)]",
  },
  constructivism: {
    tagline: "Bold structure",
    detail: "Strong contrast, sharp angles, and a poster-like hierarchy.",
    bestFor: "Manifestos",
    monogram: "C",
    accent: "from-red-500/35 via-black/20 to-transparent",
    glow: "shadow-[0_28px_90px_-40px_rgba(239,68,68,0.35)]",
  },
};

export default function SlideStyleSelector({ selectedStyle, onSelect, className }: SlideStyleSelectorProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {STYLE_PRESETS.map((style) => {
        const art = STYLE_ART[style.id];
        const selected = selectedStyle === style.id;

        return (
        <motion.button
          key={style.id}
          whileHover={{ y: -3, scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(style.id)}
          className={cn(
            "group relative aspect-[16/11] overflow-hidden rounded-[1.75rem] border text-left transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
            selected
              ? "border-primary/60 ring-4 ring-primary/10 shadow-[0_30px_100px_-42px_rgba(59,130,246,0.35)]"
              : "border-border/70 hover:border-primary/30 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.34)] hover:shadow-[0_24px_80px_-36px_rgba(15,23,42,0.42)]"
          )}
        >
          <div className={cn("absolute inset-0 bg-gradient-to-br", style.gradient)} />
          <div className={cn("absolute inset-0 bg-gradient-to-br opacity-80", art.accent)} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.42),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.12),transparent_30%),linear-gradient(to_bottom,transparent,rgba(15,23,42,0.14))]" />
          <div className={cn("absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100", selected ? "opacity-100" : "")}>
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/12 to-transparent" />
          </div>

          <div className="absolute inset-0 p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] backdrop-blur-md",
                selected ? "bg-white/90 text-slate-900" : "bg-black/18 text-white/90"
              )}>
                <Sparkles className="w-3 h-3" />
                {art.tagline}
              </div>
              {selected && (
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-xl shrink-0 ring-4 ring-white/30">
                  <Check className="w-4 h-4 text-primary" />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div className="max-w-[75%]">
                  <p className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.22em]",
                    selected ? "text-slate-700" : "text-white/75"
                  )}>
                    {style.id}
                  </p>
                  <h3 className={cn(
                    "mt-2 text-xl md:text-2xl font-semibold leading-[0.95]",
                    selected ? "text-slate-900" : "text-white"
                  )}>
                    {style.name}
                  </h3>
                </div>
                <div className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-[1.25rem] border text-lg font-black backdrop-blur-md transition-transform",
                  selected ? "bg-white/88 text-slate-900 border-white/70 scale-105" : "bg-black/16 text-white border-white/15"
                )}>
                  {art.monogram}
                </div>
              </div>

              <p className={cn(
                "max-w-[90%] text-[11px] leading-relaxed",
                selected ? "text-slate-600" : "text-white/78"
              )}>
                {art.detail}
              </p>

              <div className={cn(
                "h-px w-full",
                selected ? "bg-slate-900/10" : "bg-white/15"
              )} />

              <div className="flex items-center justify-between gap-3">
                <p className={cn(
                  "text-[10px] leading-relaxed",
                  selected ? "text-slate-500" : "text-white/65"
                )}>
                  {style.description}
                </p>
                <span className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.18em]",
                  selected ? "border-slate-900/10 bg-slate-900/5 text-slate-600" : "border-white/15 bg-black/15 text-white/75"
                )}>
                  {art.bestFor}
                </span>
              </div>
            </div>
          </div>

          <div className={cn(
            "absolute inset-0 rounded-[1.75rem] ring-1 ring-inset transition-opacity pointer-events-none",
            selected ? "ring-white/22 opacity-100" : "ring-white/10 opacity-0 group-hover:opacity-100"
          )} />
          <div className={cn(
            "absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-0 transition-opacity group-hover:opacity-100",
            art.glow
          )} />
        </motion.button>
        );
      })}
      </div>
    </div>
  );
}
