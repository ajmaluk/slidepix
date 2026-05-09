import React from 'react';
import { Reorder } from 'framer-motion';
import { ListChecks, Wand2, GripVertical, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SlideOutlineViewProps {
  titles: string[];
  onConfirm: () => void;
  onUpdateTitles: (titles: string[]) => void;
}

export default function SlideOutlineView({ titles, onConfirm, onUpdateTitles }: SlideOutlineViewProps) {
  return (
    <div className="w-full max-w-2xl bg-sidebar/50 backdrop-blur-xl border border-border/70 rounded-[2rem] overflow-hidden shadow-[0_24px_80px_-40px_rgba(15,23,42,0.55)] flex flex-col max-h-[70vh]">
      <div className="p-6 border-b border-border bg-gradient-to-r from-primary/5 via-transparent to-violet-500/5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            Presentation Outline
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Review and reorder slides before generation</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-1 bg-primary/10 border border-primary/20 rounded-lg text-[10px] font-mono text-primary font-bold">
            {titles.length} SLIDES
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-none">
        <Reorder.Group axis="y" values={titles} onReorder={onUpdateTitles} className="space-y-2">
          {titles.map((title, i) => (
            <Reorder.Item 
              key={title} 
              value={title}
              className="group flex items-center gap-3 p-3 bg-background border border-border rounded-2xl hover:border-primary/50 transition-all shadow-sm"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground font-bold">{String(i + 1).padStart(2, '0')}</span>
                  <input
                    value={title}
                    onChange={(e) => {
                      const newTitles = [...titles];
                      newTitles[i] = e.target.value;
                      onUpdateTitles(newTitles);
                    }}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium focus:text-primary transition-colors"
                  />
                </div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-500/0 group-hover:text-emerald-500 transition-all" />
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </div>

      <div className="p-6 border-t border-border bg-sidebar/50 flex items-center gap-3">
        <Button 
          onClick={onConfirm}
          className="flex-1 h-12 rounded-2xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 gap-2"
        >
          <Wand2 className="w-4 h-4" />
          Confirm & Generate Visuals
        </Button>
      </div>
    </div>
  );
}
