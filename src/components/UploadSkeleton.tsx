import { motion } from "framer-motion";
import { FileText, ImageIcon } from "lucide-react";

interface UploadSkeletonProps {
  fileName?: string;
  fileType?: string;
  size?: "sm" | "md";
}

export function UploadSkeleton({ fileName, fileType, size = "md" }: UploadSkeletonProps) {
  const isImg = fileType?.startsWith("image/");
  const dim = size === "sm" ? "w-16 h-16" : "w-16 h-16";

  return (
    <div className={`${dim} rounded-xl border border-border/50 bg-secondary/30 relative overflow-hidden flex flex-col items-center justify-center gap-1`}>
      {/* Shimmer overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent"
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />

      {isImg ? (
        <ImageIcon className="w-5 h-5 text-muted-foreground/30 animate-pulse" />
      ) : (
        <FileText className="w-5 h-5 text-muted-foreground/30 animate-pulse" />
      )}

      {fileName && (
        <span className="text-[7px] text-muted-foreground/30 truncate max-w-[90%] text-center leading-tight px-1">
          {fileName.length > 10 ? fileName.slice(0, 8) + "…" : fileName}
        </span>
      )}

      {/* Progress bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30">
        <motion.div
          className="h-full bg-foreground/20 rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: "90%" }}
          transition={{ duration: 3, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
