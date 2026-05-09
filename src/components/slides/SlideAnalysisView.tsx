import React from 'react';
import { motion } from 'framer-motion';
import { Globe, BookOpen, Users, Layers, Star } from 'lucide-react';
import { AnalysisSummary } from '@/lib/slides';

interface SlideAnalysisViewProps {
  analysis: AnalysisSummary;
}

export default function SlideAnalysisView({ analysis }: SlideAnalysisViewProps) {
  const items = [
    { label: 'Topic', value: analysis.topic, icon: Star, color: 'text-yellow-400' },
    { label: 'Language', value: analysis.language, icon: Globe, color: 'text-blue-400' },
    { label: 'Content Scope', value: analysis.scope, icon: BookOpen, color: 'text-emerald-400' },
    { label: 'Audience', value: analysis.audience, icon: Users, color: 'text-purple-400' },
    { label: 'Page Count', value: `${analysis.pageCount} Pages`, icon: Layers, color: 'text-orange-400' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl bg-sidebar/50 backdrop-blur-xl border border-border/70 rounded-[2rem] overflow-hidden shadow-[0_24px_80px_-40px_rgba(15,23,42,0.55)]"
    >
      <div className="p-6 border-b border-border bg-gradient-to-r from-primary/5 via-transparent to-violet-500/5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-primary">User Requirements Analysis</h3>
        <p className="text-xs text-muted-foreground mt-1">Deep-scanning intent and strategic mapping...</p>
      </div>
      
      <div className="p-6 space-y-6">
        {items.map((item, i) => (
          <motion.div 
            key={item.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-start gap-4 group p-3 rounded-2xl hover:bg-background/70 transition-colors"
          >
            <div className={`p-2 rounded-xl bg-background border border-border shadow-sm group-hover:border-primary/50 transition-colors`}>
              <item.icon className={`w-4 h-4 ${item.color}`} />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{item.label}</p>
              <p className="text-sm font-medium leading-relaxed">{item.value}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
