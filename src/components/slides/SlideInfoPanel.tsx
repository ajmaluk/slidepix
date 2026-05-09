import { motion } from "framer-motion";
import { X, Sparkles, Send, Layout, Type, Image as ImageIcon, ChevronRight, Target, PencilLine, Layers3, Wand2, Gauge } from "lucide-react";
import { Slide } from "@/lib/slides";
import { Button } from "@/components/ui/button";

interface SlideInfoPanelProps {
  slide: Slide | null;
  onClose: () => void;
  onRefine: (slideId: string, prompt: string) => void;
}

export function SlideInfoPanel({ slide, onClose, onRefine }: SlideInfoPanelProps) {
  if (!slide) return null;

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed lg:absolute top-0 right-0 w-full md:w-[24rem] lg:w-[28rem] h-full bg-background/85 backdrop-blur-2xl border-l border-border z-50 flex flex-col shadow-[0_0_80px_rgba(15,23,42,0.28)]"
    >
      <div className="p-5 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary/5 via-background to-violet-500/5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
             <Layout className="w-4 h-4 text-primary" />
             <span className="text-xs font-bold uppercase tracking-wider">Pro Editor</span>
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.24em]">Slide {slide.title}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 scrollbar-none">
        <div className="rounded-[1.75rem] border border-border/60 bg-card/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                <Target className="w-3 h-3 text-primary" />
                Current Slide
              </div>
              <p className="mt-3 text-sm font-semibold leading-relaxed">{slide.title}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <Layers3 className="w-3 h-3 text-primary" />
              {slide.layout}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            Refine content, sharpen the visual hierarchy, or redirect the slide with a concise creative instruction.
          </p>
        </div>

        {/* Slide Overview */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Gauge className="w-3 h-3 text-primary" />
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Content</label>
          </div>
          <div className="p-4 bg-muted/35 rounded-[1.75rem] border border-border/50 space-y-4">
             <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                   <Type className="w-3 h-3" />
                   <span className="text-[10px] font-medium">Headline</span>
                </div>
                <p className="text-sm font-semibold">{slide.title}</p>
             </div>
             
             {slide.content && (
                <div className="space-y-1">
                   <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Layout className="w-3 h-3" />
                      <span className="text-[10px] font-medium">Bullet Points</span>
                   </div>
                   <ul className="space-y-1.5">
                      {slide.content.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
                          <span>{point}</span>
                        </li>
                      ))}
                   </ul>
                </div>
             )}

             {slide.imageUrl && (
                <div className="space-y-2 pt-4 border-t border-border/40">
                   <div className="flex items-center gap-2 text-muted-foreground mr-1">
                      <ImageIcon className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Visual Asset</span>
                   </div>
                   <div className="relative aspect-video rounded-2xl overflow-hidden border border-border/50 shadow-md">
                      <img src={slide.imageUrl} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-black/60 backdrop-blur-sm text-[8px] text-white/70 truncate">
                        Query: {slide.imageQuery}
                      </div>
                   </div>
                </div>
             )}
          </div>
        </section>

        {/* Complex Speaker Notes / Talk Track */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <PencilLine className="w-3 h-3 text-primary" />
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Presenter's Talk Track</label>
          </div>
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-[1.75rem]">
             <p className="text-xs text-foreground/90 leading-relaxed italic whitespace-pre-wrap">
                {slide.notes || "No specific talk track provided for this slide."}
             </p>
          </div>
        </section>

        {/* Intellectual Design Strategy */}
        {slide.strategy && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Wand2 className="w-3 h-3 text-primary" />
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Design Rationale</label>
            </div>
            <div className="p-4 bg-accent/30 rounded-[1.75rem] border border-border/50">
               <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {slide.strategy}
               </p>
            </div>
          </section>
        )}

        {/* AI Suggested Enhancements */}
        <section className="space-y-3">
           <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">AI Intelligence Layer</label>
              <Sparkles className="w-3 h-3 text-primary animate-pulse" />
           </div>
           <div className="space-y-2">
              {[
                "Change layout to Split Screen",
                "Add more focus on Sustainability",
                "Swap for a more vibrant image"
              ].map((s) => (
                <button 
                  key={s}
                  onClick={() => onRefine(slide.id, s)}
                  className="w-full flex items-center justify-between p-3 bg-primary/5 border border-primary/10 rounded-[1.25rem] hover:bg-primary/10 transition-colors text-left group"
                >
                   <span className="text-xs font-medium">{s}</span>
                   <ChevronRight className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
           </div>
        </section>
      </div>

      {/* Refinement Area */}
      <div className="p-4 bg-gradient-to-r from-background to-secondary/20 border-t border-border">
         <div className="relative">
            <input 
               placeholder="Refine this slide..." 
               className="w-full bg-background border border-border rounded-[1.25rem] p-3 pr-10 text-xs focus:ring-1 focus:ring-primary outline-none"
               onKeyDown={(e) => {
                 if (e.key === 'Enter') {
                   onRefine(slide.id, (e.target as HTMLInputElement).value);
                   (e.target as HTMLInputElement).value = '';
                 }
               }}
            />
            <Button className="absolute right-1.5 top-1.5 h-7 w-7 p-0 rounded-lg shadow-sm">
               <Send className="w-3 h-3" />
            </Button>
         </div>
      </div>
    </motion.div>
  );
}
