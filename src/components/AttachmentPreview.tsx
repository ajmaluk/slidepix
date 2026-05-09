import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { X, Download, FileText, Scan, Copy, Check, ChevronDown, ChevronUp, RotateCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatAttachment } from "@/lib/chat";
import type { OCRResult, OCRStatus } from "@/lib/ocr";
import { isOCRCapable } from "@/lib/ocr";
import { resolveAttachmentUrl } from "@/lib/localAttachmentStore";

interface AttachmentPreviewProps {
  attachment: ChatAttachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ocrResult?: OCRResult | null;
  ocrStatus?: OCRStatus;
  onRerunOCR?: (attachment: ChatAttachment) => void;
}

export function AttachmentPreview({ attachment, open, onOpenChange, ocrResult, ocrStatus, onRerunOCR }: AttachmentPreviewProps) {
  const isMobile = useIsMobile();
  const isImg = attachment?.type.startsWith("image/");
  const [copied, setCopied] = useState(false);
  const [showOCR, setShowOCR] = useState(true);
  const [resolvedUrl, setResolvedUrl] = useState<string>("");

  const hasOCR = Boolean((ocrResult && ocrResult.status === "success" && (ocrResult.extractedText || ocrResult.structuredData)) || attachment?.ocrText);
  const isScanning = ocrStatus === "scanning";
  const canScan = attachment && isOCRCapable(attachment);
  const hasNeverScanned = canScan && !hasOCR && !isScanning && ocrStatus !== "failed";
  const hasFailed = ocrStatus === "failed";

  // Final OCR display text
  const extractedText = ocrResult?.extractedText || attachment?.ocrText || "";

  useEffect(() => {
    let mounted = true;
    setResolvedUrl("");
    if (!open || !attachment) return () => { mounted = false; };
    const run = async () => {
      try {
        const url = await resolveAttachmentUrl(attachment);
        if (mounted && url) setResolvedUrl(url);
      } catch (err) {
        void err;
      }
    };
    run();
    return () => { mounted = false; };
  }, [attachment, open]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const content = attachment ? (
    <div className="flex flex-col gap-0 p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded bg-accent flex items-center justify-center flex-shrink-0">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium text-foreground truncate">{attachment.name}</span>
          <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">
            {(attachment.size / 1024).toFixed(1)} KB
          </span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={resolvedUrl || attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview content */}
      <div className="px-4 pb-2">
        {resolvedUrl || attachment.url ? (
          isImg ? (
            <div className="w-full flex items-center justify-center max-h-[50vh] overflow-hidden rounded-xl bg-secondary/20">
              <img
                src={resolvedUrl || attachment.url}
                alt={attachment.name}
                className="max-w-full max-h-[50vh] object-contain rounded-xl"
              />
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center py-8 gap-3 bg-secondary/20 rounded-xl">
              <FileText className="w-10 h-10 text-muted-foreground/30" />
              <span className="text-sm text-muted-foreground">{attachment.name}</span>
              <a
                href={resolvedUrl || attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
              >
                Open file
              </a>
            </div>
          )
        ) : (
          <div className="w-full flex flex-col items-center justify-center py-12 gap-4 bg-secondary/10 rounded-xl border-2 border-dashed border-border/40">
            <div className="w-12 h-12 rounded-full bg-accent/50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground/60">Original file not available</p>
              <p className="text-[10px] text-muted-foreground/40 px-6">
                This attachment was imported from a backup without the full source file. 
                OCR data is still available below.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* OCR Section — only show when there's content, scanning, failed, or can initiate scan */}
      {(canScan || hasOCR) && (
        <div className="border-t border-border/40">
          {/* Scanning state */}
          {isScanning && (
            <div className="flex items-center gap-2.5 px-4 py-3">
              <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                >
                  <Scan className="w-3 h-3 text-primary" />
                </motion.div>
              </div>
              <span className="text-xs font-medium text-foreground">Scanning document…</span>
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
          )}

          {/* Never scanned — show scan prompt */}
          {hasNeverScanned && onRerunOCR && (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-accent flex items-center justify-center">
                  <Scan className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-xs text-muted-foreground">Extract text from this file</span>
              </div>
              <button
                onClick={() => onRerunOCR(attachment)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Scan className="w-3 h-3" />
                Scan
              </button>
            </div>
          )}

          {/* Failed state */}
          {hasFailed && !isScanning && (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-destructive/10 flex items-center justify-center">
                  <X className="w-3 h-3 text-destructive" />
                </div>
                <span className="text-xs text-muted-foreground">Scan failed</span>
              </div>
              {onRerunOCR && (
                <button
                  onClick={() => onRerunOCR(attachment)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-foreground hover:bg-accent/80 transition-colors"
                >
                  <RotateCw className="w-3 h-3" />
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Success — extracted content */}
          {hasOCR && !isScanning && (
            <>
              <button
                onClick={() => setShowOCR(!showOCR)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                    <Scan className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-foreground">Extracted Text</span>
                  <Check className="w-3 h-3 text-primary" />
                </div>
                <div className="flex items-center gap-1">
                  {onRerunOCR && attachment && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRerunOCR(attachment);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
                      title="Re-scan document"
                    >
                      <RotateCw className="w-3 h-3" />
                      Re-scan
                    </button>
                  )}
                  {showOCR ? (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {showOCR && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 pb-4 overflow-hidden"
                  >
                    {extractedText && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Text</span>
                          <button
                            onClick={() => handleCopy(extractedText)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
                          >
                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copied ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <div className="bg-secondary/30 rounded-lg p-3 max-h-[300px] overflow-y-auto scrollbar-thin">
                          <pre className="text-xs text-foreground/90 whitespace-pre-wrap break-words font-mono leading-relaxed">
                            {extractedText}
                          </pre>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      )}
    </div>
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden border-border/60 bg-card [&>button:last-child]:hidden max-h-[85vh] flex flex-col mx-4">
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}
