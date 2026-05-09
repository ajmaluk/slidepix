import { motion, AnimatePresence } from "framer-motion";
import { Brain, CheckCircle2, Sparkles, Zap, Layout, Search, Timer } from "lucide-react";
import { AGENTS, type ThinkingStep, type AgentId } from "@/lib/chat";
import { AgentOrb } from "@/components/AgentOrb";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SlideThinkingIndicatorProps {
  steps?: ThinkingStep[];
  className?: string;
  isFullWidth?: boolean;
}

const typeIcons: Record<string, any> = {
  strategy: Brain,
  drafting: Zap,
  design: Sparkles,
  sourcing: Search,
  finalizing: CheckCircle2,
};

const phaseOrder = ["strategy", "drafting", "design", "sourcing", "finalizing"];

export function SlideThinkingIndicator({ steps = [], className, isFullWidth = false }: SlideThinkingIndicatorProps) {
  if (steps.length === 0) return null;

  const phases = steps.reduce((acc, step) => {
    const type = step.type || "strategy";
    if (!acc[type]) acc[type] = [];
    acc[type].push(step);
    return acc;
  }, {} as Record<string, ThinkingStep[]>);

  const activeAgentIds = [...new Set(steps.filter(s => s.status === 'running').map(s => s.agentId))];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        "flex flex-col gap-8 rounded-[2rem] border border-border/70 bg-card/70 backdrop-blur-2xl shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] overflow-hidden",
        isFullWidth ? "max-width-3xl mx-auto w-full py-12" : "w-full",
        className
      )}
    >
      <div className="p-5 md:p-6 border-b border-border/60 bg-gradient-to-r from-primary/5 via-transparent to-violet-500/5">
        {/* Dynamic Agent Header */}
        <div className={cn("flex items-center gap-4", isFullWidth && "justify-center mb-4")}>
          <div className="flex -space-x-3">
            {(["arun", "kiran", "manu"] as const).map((id) => (
              <AgentOrb
                key={id}
                agentId={id}
                size={isFullWidth ? "md" : "sm"}
                isLive={activeAgentIds.includes(id)}
                className="border-2 border-background shadow-lg"
              />
            ))}
          </div>
          <div className={cn("flex flex-col", isFullWidth && "items-center text-center")}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">Slide Architecture Engine</span>
              <Badge variant="outline" className="px-2 py-0 h-4 text-[9px] uppercase tracking-tighter bg-primary/5 text-primary">Active</Badge>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1 h-1 rounded-full bg-primary/60"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Orchestrating Narrative Beats</span>
            </div>
          </div>
        </div>
      </div>
      {/* Activity Log / Timeline */}
      <div className={cn(
        "space-y-8 relative px-5 pb-5",
        isFullWidth ? "max-w-2xl mx-auto" : "ml-4 pl-6 border-l border-border/40"
      )}>
        {isFullWidth && (
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-primary/20 via-border to-transparent" />
        )}
        
        <AnimatePresence mode="popLayout">
          {phaseOrder.map((phase, pIdx) => {
            const phaseSteps = phases[phase];
            if (!phaseSteps) return null;

            const Icon = typeIcons[phase] || Layout;
            const isPhaseActive = phaseSteps.some(s => s.status === 'running');

            return (
              <motion.div 
                key={phase} 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: pIdx * 0.1 }}
                className="relative space-y-4"
              >
                {/* Phase Marker */}
                <div className={cn(
                  "absolute -left-[30px] top-1 w-2.5 h-2.5 rounded-full bg-background border-2 transition-all duration-500",
                  isPhaseActive ? "border-primary scale-125 shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "border-border"
                )} />
                
                <div className="flex items-center gap-2">
                  <Icon className={cn("w-3 h-3", isPhaseActive ? "text-primary animate-pulse" : "text-muted-foreground/40")} />
                  <h4 className={cn(
                    "text-[10px] font-bold uppercase tracking-widest",
                    isPhaseActive ? "text-primary" : "text-muted-foreground/60"
                  )}>
                    {phase}
                  </h4>
                </div>
                
                <div className="space-y-2.5">
                  {phaseSteps.map((step, idx) => {
                    const agent = AGENTS[step.agentId as keyof typeof AGENTS] || AGENTS.manu;

                    return (
                      <motion.div
                        key={`${step.agentId}-${idx}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          "flex items-start gap-4 p-4 rounded-2xl transition-all duration-300 border",
                          step.status === 'running' 
                            ? 'bg-primary/5 border-primary/10 shadow-sm' 
                            : 'bg-accent/5 opacity-75 hover:opacity-100 hover:bg-accent/10 border-border/40'
                        )}
                      >
                        <AgentOrb agentId={step.agentId as AgentId} size="xs" isLive={step.status === 'running'} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-[11px] font-bold", agent.color)}>{agent.name}</span>
                            <span className="text-[11px] text-foreground/80 font-medium">{step.action}</span>
                            {step.status === 'running' && (
                               <motion.span 
                                 className="w-1 h-1 rounded-full bg-primary" 
                                 animate={{ opacity: [1, 0, 1] }} 
                                 transition={{ duration: 1, repeat: Infinity }} 
                               />
                            )}
                            {step.status === 'done' && (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{step.detail}</p>
                        </div>
                        {step.timestamp && (
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/30 font-mono">
                             <Timer className="w-2 h-2" />
                             {new Date(step.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }).split(' ')[0]}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {isFullWidth && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center mt-4"
        >
          <div className="px-4 py-2 bg-accent/20 rounded-full border border-border/50 text-[10px] text-muted-foreground font-medium animate-pulse flex items-center gap-2">
            <Zap className="w-3 h-3 text-primary" />
            Parallel Threading Active
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
