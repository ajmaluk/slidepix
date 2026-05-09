import { AgentOrb } from "@/components/AgentOrb";
import { SEOHead } from "@/components/SEOHead";
import { AGENTS, type AgentId } from "@/lib/chat";

const agentIds = Object.keys(AGENTS) as AgentId[];

export default function OrbPreview() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-10 px-6">
      <SEOHead title="Orb Preview" description="Agent visualization preview" path="/orb-preview" noIndex />
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-foreground/90">Agent Orb Preview</h1>
        <p className="text-sm text-muted-foreground">Blank preview for testing animated mesh gradients.</p>
      </div>

      <AgentOrb agentId="kiran" size="xl" isLive className="scale-[1.65]" />

      <div className="flex flex-wrap justify-center gap-4 max-w-3xl">
        {agentIds.map((id) => (
          <div key={id} className="flex flex-col items-center gap-2">
            <AgentOrb agentId={id} size="lg" isLive />
            <span className="text-xs text-muted-foreground/80 capitalize">{id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
