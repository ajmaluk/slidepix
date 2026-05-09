import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ModelMode } from "@/lib/chat";
import { AgentOrb } from "@/components/AgentOrb";

interface EmptyStateProps {
  mode: ModelMode;
  onQuickAction?: (prompt: string) => void;
}

const greetings = [
  "I am here with you. What is on your mind?",
  "Talk to me, friend. What do you need right now?",
  "Let us solve this together.",
  "Your companion is ready when you are.",
  "Share anything. I am listening.",
];

function TypingText({ texts }: { texts: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [phase, setPhase] = useState<"typing" | "waiting" | "deleting">("typing");

  useEffect(() => {
    const text = texts[currentIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (displayed.length < text.length) {
        // Variable speed: faster in the middle, slight pause on spaces
        const char = text[displayed.length];
        const baseSpeed = 18;
        const delay = char === " " ? baseSpeed + 8 : baseSpeed;
        timeout = setTimeout(() => setDisplayed(text.slice(0, displayed.length + 1)), delay);
      } else {
        timeout = setTimeout(() => setPhase("waiting"), 1600);
      }
    } else if (phase === "waiting") {
      timeout = setTimeout(() => setPhase("deleting"), 0);
    } else if (phase === "deleting") {
      if (displayed.length > 0) {
        // Delete in chunks of 2-3 chars for ultra-fast erase feel
        const chunkSize = Math.min(displayed.length, Math.random() > 0.5 ? 3 : 2);
        timeout = setTimeout(() => setDisplayed(displayed.slice(0, -chunkSize)), 8);
      } else {
        setPhase("typing");
        setCurrentIndex((i) => (i + 1) % texts.length);
      }
    }

    return () => clearTimeout(timeout);
  }, [displayed, phase, currentIndex, texts]);

  return (
    <span className="text-muted-foreground/60 font-medium">
      {displayed.split("").map((char, i) => (
        <motion.span
          key={`${currentIndex}-${i}`}
          initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {char}
        </motion.span>
      ))}
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
        className="inline-block w-[2px] h-[1.1em] bg-foreground/50 ml-0.5 align-text-bottom rounded-full"
      />
    </span>
  );
}

export function EmptyState({ mode }: EmptyStateProps) {
  const isTemp = mode === "auto" && window.location.pathname.includes("/temp/");

  return (
    <div className="flex flex-col items-center justify-center relative py-12 w-full max-w-4xl">
      {/* Subtle ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ 
            background: isTemp 
              ? "radial-gradient(circle at center, rgba(124, 58, 237, 0.08) 0%, transparent 70%)"
              : "radial-gradient(ellipse at center, hsl(var(--foreground) / 0.02) 0%, transparent 70%)" 
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center relative z-10 w-full"
      >
        <motion.div
          className="w-40 h-40 rounded-full flex items-center justify-center mb-10 shadow-2xl bg-background/5"
          animate={{
            boxShadow: ["0 0 0px rgba(0,0,0,0)", "0 0 70px rgba(124, 58, 237, 0.2)", "0 0 0px rgba(0,0,0,0)"]
          }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <AgentOrb size="xxl" agentId="kiran" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-lg md:text-xl h-7 text-center"
        >
          <TypingText texts={greetings} />
        </motion.div>
      </motion.div>
    </div>
  );
}
