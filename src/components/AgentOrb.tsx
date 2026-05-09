import { AGENTS, type AgentId } from "@/lib/chat";
import { cn } from "@/lib/utils";

interface AgentOrbProps {
  agentId: AgentId;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
  className?: string;
  isLive?: boolean;
  isThinking?: boolean;
  isIdle?: boolean;
}

const sizeMap: Record<string, string> = {
  xs: "w-4 h-4",
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-10 h-10",
  xl: "w-16 h-16",
  xxl: "w-32 h-32",
};

/**
 * AgentOrb renders the animated SVG orb for a given agent.
 * Uses the pre-generated SVG files from /orbs/<agentId>.svg
 * which contain embedded SMIL animations (turbulence, blob motion, etc).
 */
export function AgentOrb({ agentId, size = "md", className, isLive = true }: AgentOrbProps) {
  // Safe access with fallback to kiran
  const agent = AGENTS[agentId] || AGENTS.kiran;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 transition-all duration-500",
        sizeMap[size] || sizeMap.md,
        // Add a background color as fallback if image fails
        agent.bgColor || "bg-primary/20",
        agent.glow,
        className
      )}
    >
      {/* Background gradient fallback */}
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-40", agent.gradient)} />
      
      <img
        src={`/orbs/${agentId}.svg`}
        alt={`${agent.name} orb`}
        className={cn(
          "w-full h-full object-cover relative z-10",
          isLive && "animate-pulse-subtle"
        )}
        loading="eager" // Better for UI critical elements
        draggable={false}
        onError={(e) => {
          // If image fails, try fallback to kiran
          if (agentId !== "kiran") {
            (e.target as HTMLImageElement).src = "/orbs/kiran.svg";
          }
        }}
      />
      {/* Live pulse ring */}
      {isLive && (size === "lg" || size === "xl" || size === "xxl") && (
        <span className="absolute inset-0 rounded-full animate-ping opacity-10 border border-current pointer-events-none z-20" />
      )}
    </div>
  );
}
