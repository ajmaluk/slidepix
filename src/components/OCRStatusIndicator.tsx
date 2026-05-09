import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Scan } from "lucide-react";
import type { OCRStatus } from "@/lib/ocr";

interface OCRStatusIndicatorProps {
  status: OCRStatus;
  previewText?: string;
}

export function OCRStatusIndicator({ status, previewText }: OCRStatusIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (status === "pending") return null;

  if (status === "scanning") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-accent border border-border/50 flex items-center justify-center z-10"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        >
          <Scan className="w-2.5 h-2.5 text-muted-foreground" />
        </motion.div>
      </motion.div>
    );
  }

  if (status === "success") {
    return (
      <div className="relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center z-10 cursor-pointer"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Check className="w-2.5 h-2.5 text-primary" />
        </motion.div>

        <AnimatePresence>
          {showTooltip && previewText && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              className="absolute bottom-full right-0 mb-2 w-44 p-2 rounded-lg bg-popover border border-border/60 shadow-lg z-50"
            >
              <div className="flex items-center gap-1 mb-1">
                <Scan className="w-2.5 h-2.5 text-primary" />
                <span className="text-[9px] font-medium text-foreground">OCR Extracted</span>
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed line-clamp-4 break-words">
                {previewText.slice(0, 100)}{previewText.length > 100 ? "…" : ""}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center z-10"
      >
        <X className="w-2.5 h-2.5 text-destructive" />
      </motion.div>
    );
  }

  return null;
}
