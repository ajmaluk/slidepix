import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Mic, Square, ChevronDown, MicOff, X, FileText, ImageIcon, Plus, File, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { generateId, type ModelMode, type ChatAttachment } from "@/lib/chat";
import { saveAttachmentLocally } from "@/lib/localAttachmentStore";
import { toast } from "sonner";
import { UploadSkeleton } from "@/components/UploadSkeleton";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { runOCRForAttachment, isOCRCapable, type OCRResult, type OCRStatus } from "@/lib/ocr";
import { OCRStatusIndicator } from "@/components/OCRStatusIndicator";
import { ScanningOverlay } from "@/components/ScanningOverlay";

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatAttachment[], ocrResults?: OCRResult[]) => void;
  isLoading: boolean;
  mode?: ModelMode;
  onModeChange?: (mode: ModelMode) => void;
  selectedModel?: string;
  onSelectedModelChange?: (model: string) => void;
  showModelSelector?: boolean;
  centered?: boolean;
  variant?: "default" | "slides";
  placeholder?: string;
  value?: string;
  onChange?: (val: string) => void;
  clearOnSend?: boolean;
}

const modeLabels: Record<ModelMode, string> = {
  auto: "Auto",
  search: "Search",
  creative: "Creative",
  precise: "Expert",
};

const modeDescriptions: Record<ModelMode, string> = {
  auto: "Automatically picks the best approach",
  search: "Deep research with web search",
  creative: "Imaginative and artistic responses",
  precise: "Multi-agent expert analysis",
};

const modeIcons: Record<ModelMode, string> = {
  auto: "⚡",
  search: "🔍",
  creative: "✨",
  precise: "🧠",
};

const modelLabels: Record<"dalam", string> = {
  "dalam": "Dalam",
};

const modelDescriptions: Record<"dalam", string> = {
  "dalam": "Fast, intelligent, and reasoning-capable AI model",
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "text/markdown",
];

type UploadingFile = { id: string; name: string; type: string };

export function ChatInput({
  onSend,
  isLoading,
  mode = "auto",
  onModeChange,
  // eslint-disable-next-line unused-imports/no-unused-vars
  selectedModel,
  onSelectedModelChange,
  showModelSelector = false,
  centered,
  variant = "default",
  placeholder = "Talk to your AI buddy... what is on your mind?",
  value,
  onChange,
  clearOnSend = true,
}: ChatInputProps) {
  const [internalInput, setInternalInput] = useState("");
  const input = value !== undefined ? value : internalInput;
  const setInput = onChange || setInternalInput;

  const [showModes, setShowModes] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [previewAtt, setPreviewAtt] = useState<ChatAttachment | null>(null);
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [ocrStatuses, setOcrStatuses] = useState<Map<string, OCRStatus>>(new Map());
  const [ocrProgress, setOcrProgress] = useState<Map<string, number>>(new Map());
  const [showRequestModels, setShowRequestModels] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const voicePrefixRef = useRef<string | null>(null);

  const handleVoiceResult = useCallback((text: string) => {
    const seed = voicePrefixRef.current ?? "";
    const merged = [seed.trim(), text.trim()].filter(Boolean).join(" ");
    setInput(merged);
  }, [setInput]);

  const { isListening, transcript, startListening, stopListening, isSupported, error: speechError } = useSpeechToText(handleVoiceResult);
  const isAttachmentProcessing = uploading || Array.from(ocrStatuses.values()).some((status) => status === "scanning");

  useEffect(() => {
    if (speechError) {
      toast.error(speechError);
    }
  }, [speechError]);

  useEffect(() => {
    if (!isListening) {
      voicePrefixRef.current = null;
      return;
    }

    if (voicePrefixRef.current === null) {
      voicePrefixRef.current = input.trim();
    }

    if (transcript) {
      const merged = [voicePrefixRef.current, transcript.trim()].filter(Boolean).join(" ");
      setInput(merged);
    }
  }, [input, isListening, transcript, setInput]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModes(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowRequestModels(false);
      }
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setShowUploadMenu(false);
      }
    };
    if (showModes || showUploadMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModes, showUploadMenu]);

  const uploadFile = async (file: File): Promise<ChatAttachment | null> => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File "${file.name}" exceeds 20MB limit`);
      return null;
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error(`File type "${file.type}" is not supported`);
      return null;
    }

    try {
      return await saveAttachmentLocally(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to store "${file.name}" locally`;
      toast.error(message);
      return null;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const totalFiles = attachments.length + files.length;
    if (totalFiles > 10) {
      toast.error("Maximum 10 files per message");
      return;
    }

    setUploading(true);
    const fileArray = Array.from(files);
    const skeletons: UploadingFile[] = fileArray.map((f) => ({
      id: generateId(),
      name: f.name,
      type: f.type,
    }));
    setUploadingFiles(skeletons);

    const newAttachments: ChatAttachment[] = [];
    for (const file of fileArray) {
      const attachment = await uploadFile(file);
      if (attachment) newAttachments.push(attachment);
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setUploadingFiles([]);
    setUploading(false);

    if (fileInputRef.current) fileInputRef.current.value = "";

    // Run OCR for new image attachments
    runOCRForNewAttachments(newAttachments);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setOcrResults((prev) => prev.filter((r) => r.attachmentId !== id));
    setOcrStatuses((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const runOCRForNewAttachments = async (newAtts: ChatAttachment[]) => {
    const ocrCapable = newAtts.filter(isOCRCapable);
    if (ocrCapable.length === 0) return;

    // Mark all as scanning
    setOcrStatuses((prev) => {
      const next = new Map(prev);
      ocrCapable.forEach((att) => next.set(att.id, "scanning"));
      return next;
    });

    // Run all OCR tasks in parallel
    await Promise.all(
      ocrCapable.map(async (att) => {
        try {
          let result = await runOCRForAttachment(att, (percent) => {
            setOcrProgress((prev) => {
              const next = new Map(prev);
              next.set(att.id, percent);
              return next;
            });
          });

          // One retry for transient OCR failures to improve reliability on noisy images/PDF pages.
          if (result.status !== "success") {
            await new Promise((resolve) => setTimeout(resolve, 300));
            result = await runOCRForAttachment(att, (percent) => {
              setOcrProgress((prev) => {
                const next = new Map(prev);
                next.set(att.id, percent);
                return next;
              });
            });
          }

          setOcrResults((prev) => [...prev, result]);
          setOcrStatuses((prev) => {
            const next = new Map(prev);
            next.set(att.id, result.status === "success" ? "success" : "failed");
            return next;
          });
        } catch (error) {
          console.error("OCR Error for attachment", att.id, error);
          setOcrStatuses((prev) => {
            const next = new Map(prev);
            next.set(att.id, "failed");
            return next;
          });
        } finally {
          setOcrProgress((prev) => {
            const next = new Map(prev);
            next.delete(att.id);
            return next;
          });
        }
      })
    );
  };

  const handleRerunOCR = (att: ChatAttachment) => {
    // Remove old result
    setOcrResults((prev) => prev.filter((r) => r.attachmentId !== att.id));
    // Re-run
    runOCRForNewAttachments([att]);
  };

  const handleSend = async () => {
    if (isListening) stopListening();
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || isLoading) return;

    // Keep OCR analysis in the upload phase so submit is predictable.
    if (isAttachmentProcessing) {
      toast.info("Please wait for attachment analysis to finish.");
      return;
    }

    // Attach OCR results to the attachments themselves for persistent, portable chat history
    const attachmentsWithOCR = attachments.map((att) => {
      const result = ocrResults.find((r) => r.attachmentId === att.id);
      if (result && result.status === "success" && result.extractedText) {
        return { ...att, ocrText: result.extractedText };
      }
      return att;
    });

    onSend(trimmed, attachmentsWithOCR.length > 0 ? attachmentsWithOCR : undefined, ocrResults.length > 0 ? ocrResults : undefined);
    if (clearOnSend) {
      setInput("");
      setAttachments([]);
      setOcrResults([]);
      setOcrStatuses(new Map());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleVoice = () => {
    if (isListening) {
      stopListening();
      return;
    }

    voicePrefixRef.current = input.trim();
    startListening();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const totalFiles = attachments.length + files.length;
    if (totalFiles > 10) {
      toast.error("Maximum 10 files per message");
      return;
    }

    setUploading(true);
    const fileArray = Array.from(files);
    const skeletons: UploadingFile[] = fileArray.map((f) => ({
      id: generateId(),
      name: f.name,
      type: f.type,
    }));
    setUploadingFiles(skeletons);

    const newAttachments: ChatAttachment[] = [];
    for (const file of fileArray) {
      const attachment = await uploadFile(file);
      if (attachment) newAttachments.push(attachment);
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
    setUploadingFiles([]);
    setUploading(false);

    // Run OCR for new image attachments
    runOCRForNewAttachments(newAttachments);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const isImage = (type: string) => ALLOWED_IMAGE_TYPES.includes(type);
  const activeRequestModel = "dalam";

  return (
    <div className={`px-4 ${centered ? "pb-8" : "pb-5"}`}>
      <div className="max-w-2xl mx-auto">
        <motion.div
          animate={{
            borderColor: isFocused 
              ? "hsl(var(--foreground) / 0.12)" 
              : "rgba(148, 163, 184, 0.6)",
            boxShadow: isFocused
              ? "0 0 0 1px hsl(var(--foreground) / 0.06), 0 8px 32px -8px hsl(var(--foreground) / 0.08)"
              : "0 0 0 0px transparent, 0 2px 8px -4px hsl(var(--foreground) / 0.04)",
          }}
          transition={{ duration: 0.3 }}
          className="relative bg-card border rounded-2xl"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {/* Image-only input */}
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />
          {/* All files input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_FILE_TYPES.join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />

          <AnimatePresence>
            {isFocused && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-[1px] bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
              />
            )}
          </AnimatePresence>

          {/* Attachment previews + upload skeletons */}
          <AnimatePresence>
            {(attachments.length > 0 || uploadingFiles.length > 0 || isAttachmentProcessing) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {isAttachmentProcessing && (
                  <ScanningOverlay 
                    progress={
                      ocrProgress.size > 0 
                        ? Array.from(ocrProgress.values()).reduce((a, b) => a + b, 0) / ocrProgress.size 
                        : undefined
                    } 
                  />
                )}
                <div className="flex gap-1.5 px-3 pt-2.5 pb-1 overflow-x-auto scrollbar-thin">
                  {attachments.map((att) => {
                    const ocrStatus = ocrStatuses.get(att.id) || "pending";
                    const ocrResult = ocrResults.find((r) => r.attachmentId === att.id);
                    const previewText = ocrResult?.extractedText || ocrResult?.structuredData || "";
                    const isFailed = ocrStatus === "failed";
                    return (
                      <motion.div
                        key={att.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="relative flex-shrink-0 group/att cursor-pointer"
                        onClick={() => setPreviewAtt(att)}
                      >
                        {isImage(att.type) ? (
                          <div className={`w-12 h-12 rounded-lg overflow-hidden border bg-secondary/30 ${isFailed ? "border-destructive/50" : "border-border/50"}`}>
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className={`w-12 h-12 rounded-lg border bg-secondary/30 flex flex-col items-center justify-center gap-0.5 px-0.5 ${isFailed ? "border-destructive/50" : "border-border/50"}`}>
                            <FileText className="w-4 h-4 text-muted-foreground/50" />
                            <span className="text-[7px] text-muted-foreground/50 truncate max-w-full text-center leading-tight">
                              {att.name.length > 8 ? att.name.slice(0, 6) + "…" : att.name}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeAttachment(att.id); }}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity shadow-sm"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                        <OCRStatusIndicator status={ocrStatus} previewText={previewText} />
                      </motion.div>
                    );
                  })}
                  {uploadingFiles.map((uf) => (
                    <motion.div
                      key={uf.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex-shrink-0"
                    >
                      <UploadSkeleton fileName={uf.name} fileType={uf.type} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              const value = e.target.value;
              if (value.length <= 50000) setInput(value);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isListening ? "Listening..." : placeholder}
            rows={1}
            className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/60 resize-none px-4 pt-4 pb-12 text-sm focus:outline-none scrollbar-thin"
          />

          <AnimatePresence>
            {isListening && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20"
              >
                <motion.div
                  className="w-2 h-2 rounded-full bg-destructive"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-[10px] font-medium text-destructive">Recording</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              {variant !== "slides" && (
                <>
                  <div className="relative" ref={uploadMenuRef}>
                    <button
                      onClick={() => setShowUploadMenu(!showUploadMenu)}
                      disabled={uploading}
                      className="p-2 rounded-xl text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-all duration-200 disabled:opacity-30"
                    >
                      <Plus className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {showUploadMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.97 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="absolute bottom-full left-0 mb-2 bg-popover border border-border rounded-xl py-1.5 min-w-[180px] z-50"
                        >
                          <button
                            onClick={() => {
                              imageInputRef.current?.click();
                              setShowUploadMenu(false);
                            }}
                            className="w-full text-left px-3.5 py-2.5 transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-accent/50 hover:translate-x-0.5 flex items-center gap-2.5"
                          >
                            <ImageIcon className="w-4 h-4" />
                            <div>
                              <div className="text-xs font-medium">Image</div>
                              <div className="text-[10px] text-muted-foreground/50 mt-0.5">Upload photos & images</div>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              fileInputRef.current?.click();
                              setShowUploadMenu(false);
                            }}
                            className="w-full text-left px-3.5 py-2.5 transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-accent/50 hover:translate-x-0.5 flex items-center gap-2.5"
                          >
                            <File className="w-4 h-4" />
                            <div>
                              <div className="text-xs font-medium">File</div>
                              <div className="text-[10px] text-muted-foreground/50 mt-0.5">PDF, text, CSV, JSON & images</div>
                            </div>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setShowModes(!showModes)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground/70 hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                    >
                      <span className="text-[12px]">{modeIcons[mode!]}</span>
                      <span className="font-medium">{modeLabels[mode!]}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showModes ? "rotate-180" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {showModes && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.97 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="absolute bottom-full left-0 mb-2 bg-popover border border-border rounded-xl py-1.5 min-w-[230px] z-50"
                        >
                          {(Object.keys(modeLabels) as ModelMode[]).map((m) => (
                            <button
                              key={m}
                              onClick={() => { onModeChange?.(m); setShowModes(false); }}
                              className={`w-full text-left px-3.5 py-2.5 transition-all duration-200 ${
                                mode === m
                                  ? "text-foreground bg-accent translate-x-0.5"
                                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50 hover:translate-x-0.5"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-sm">{modeIcons[m]}</span>
                                <div>
                                  <div className="text-xs font-medium">{modeLabels[m]}</div>
                                  <div className="text-[10px] text-muted-foreground/50 mt-0.5">{modeDescriptions[m]}</div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {showModelSelector && onSelectedModelChange && (
                    <div className="relative" ref={modelDropdownRef}>
                      <button
                        onClick={() => setShowRequestModels(!showRequestModels)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground/70 hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span className="font-medium">{modelLabels[activeRequestModel]}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showRequestModels ? "rotate-180" : ""}`} />
                      </button>

                      <AnimatePresence>
                        {showRequestModels && (
                          <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.97 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="absolute bottom-full left-0 mb-2 bg-popover border border-border rounded-xl py-1.5 min-w-[250px] z-50"
                          >
                            {(Object.keys(modelLabels) as Array<"dalam">).map((model) => (
                              <button
                                key={model}
                                onClick={() => {
                                  onSelectedModelChange?.(model);
                                  setShowRequestModels(false);
                                }}
                                className={`w-full text-left px-3.5 py-2.5 transition-all duration-200 ${
                                  activeRequestModel === model
                                    ? "text-foreground bg-accent translate-x-0.5"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50 hover:translate-x-0.5"
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <Zap className="w-3.5 h-3.5 text-muted-foreground/60" />
                                  <div>
                                    <div className="text-xs font-medium">{modelLabels[model]}</div>
                                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">{modelDescriptions[model]}</div>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-1">
              {variant !== "slides" && isSupported && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleVoice}
                  className={`p-2 rounded-xl transition-all duration-200 ${
                    isListening
                      ? "bg-destructive/10 text-destructive"
                      : "text-muted-foreground/50 hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </motion.button>
              )}

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={isLoading ? undefined : handleSend}
                disabled={(!isLoading && !input.trim() && attachments.length === 0) || isAttachmentProcessing}
                className={`p-2 rounded-xl transition-all duration-200 ${
                  isLoading
                    ? "bg-foreground text-background shadow-lg shadow-foreground/10"
                    : (input.trim() || attachments.length > 0) && !isAttachmentProcessing
                    ? "bg-foreground text-background hover:opacity-90 shadow-lg shadow-foreground/10"
                    : "text-muted-foreground/20 cursor-not-allowed"
                }`}
              >
                {isLoading ? (
                  <Square className="w-4 h-4" fill="currentColor" />
                ) : (
                  <ArrowUp className="w-4 h-4" />
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>

        {centered && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="text-center text-[10px] text-muted-foreground/25 mt-3 tracking-wide"
          >
            Your AI companion may still make mistakes. Verify important facts.
          </motion.p>
        )}
      </div>

      {/* Attachment preview overlay — rendered outside the card to avoid stacking context issues */}
      {previewAtt && (
        <AttachmentPreview
          attachment={previewAtt}
          open={!!previewAtt}
          onOpenChange={(open) => { if (!open) setPreviewAtt(null); }}
          ocrResult={ocrResults.find((r) => r.attachmentId === previewAtt.id) || null}
          ocrStatus={ocrStatuses.get(previewAtt.id)}
          onRerunOCR={handleRerunOCR}
        />
      )}
    </div>
  );
}
