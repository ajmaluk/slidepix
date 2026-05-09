import { motion } from "framer-motion";
import { Scan } from "lucide-react";

interface ScanningOverlayProps {
  progress?: number;
}

/** Full-width scanning animation shown on submit while OCR completes */
export function ScanningOverlay({ progress }: ScanningOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-3 px-4 py-3"
    >
      <div className="relative flex items-center justify-center w-8 h-8">
        {/* Outer pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full border border-primary/30"
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Inner spinning icon */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Scan className="w-4 h-4 text-primary" />
        </motion.div>
      </div>

      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <span className="text-xs font-medium text-foreground">
          {progress !== undefined ? `Analyzing (${Math.round(progress)}%)...` : "Analyzing attachments..."}
        </span>
        <span className="text-[10px] text-muted-foreground">Multi-agent OCR scanning in progress</span>
      </div>

      {/* Animated scan line or progress bar */}
      <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden ml-2">
        {progress !== undefined ? (
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        ) : (
          <motion.div
            className="h-full rounded-full bg-primary/40"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: "40%" }}
          />
        )}
      </div>
    </motion.div>
  );
}
