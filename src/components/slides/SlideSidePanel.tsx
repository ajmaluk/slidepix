import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  FileText, 
  Presentation as PresentationIcon,
  Info,
  Maximize2,
  Sparkles
} from 'lucide-react';
import { Presentation, exportPresentationToPdf, exportPresentationToPptx, fetchStockImage } from '@/lib/slides';
import { useChatStore } from '@/stores/chatStore';
import SlidePreview from './SlidePreview';
import { SlideInfoPanel } from './SlideInfoPanel';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SlideSidePanelProps {
  presentation: Presentation;
  onClose: () => void;
  isMobile?: boolean;
}

export const SlideSidePanel: React.FC<SlideSidePanelProps> = ({ presentation, onClose, isMobile }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const setConversations = useChatStore(s => s.setConversations);
  const activeId = useChatStore(s => s.activeId);
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleDownloadPdf = async () => {
    toast.info("Preparing PDF...");
    const elements = presentation.slides.map((s) => slideRefs.current[s.id]).filter(Boolean) as HTMLElement[];
    await exportPresentationToPdf(presentation, elements);
  };

  const handleDownloadPptx = async () => {
    toast.info("Preparing PowerPoint...");
    await exportPresentationToPptx(presentation);
  };

  const handleRegenerateImage = async () => {
    const currentSlide = presentation.slides[activeIndex];
    if (!currentSlide.imageQuery || isRefreshing) return;
    
    setIsRefreshing(true);
    toast.info("Refining visual...", { icon: <Sparkles className="w-4 h-4 text-violet-400" /> });
    
    try {
      const imageData = await fetchStockImage(currentSlide.imageQuery);
      if (imageData) {
        const updatedPresentation = { ...presentation };
        updatedPresentation.slides[activeIndex] = {
          ...currentSlide,
          imageUrl: imageData.url,
          unsplashData: imageData.attribution
        };

        // Update local store persistence
        setConversations(convs => convs.map(c => {
          if (c.id !== (activeId || useChatStore.getState().activeId)) return c;
          return {
            ...c,
            messages: c.messages.map(m => {
              if (m.presentation?.id === presentation.id) {
                return { ...m, presentation: updatedPresentation };
              }
              return m;
            })
          };
        }));
        
        // Also update the active presentation in store so the panel reflects it
        useChatStore.getState().setActivePresentation(updatedPresentation);
        toast.success("Visual updated");
      }
    } catch {
      toast.error("Failed to update visual");
    } finally {
      setIsRefreshing(false);
    }
  };

  const currentSlide = presentation.slides[activeIndex];

  const panelVariants = isMobile ? {
    hidden: { y: "100%" },
    visible: { y: 0 },
    exit: { y: "100%" }
  } : {
    hidden: { x: "100%", opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit: { x: "100%", opacity: 0 }
  };

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      drag={isMobile ? "y" : false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDragEnd={(_, info) => {
        if (isMobile && info.offset.y > 150) {
          onClose();
        }
      }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className={`fixed ${isMobile ? 'inset-x-0 bottom-0 h-[92vh] rounded-t-[40px]' : 'top-0 right-0 w-[520px] h-full'} bg-background/80 backdrop-blur-3xl border-l border-white/10 shadow-2xl z-50 flex flex-col overflow-hidden`}
    >
      {isMobile && (
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-white/10" />
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/20 border border-violet-500/20">
            <PresentationIcon className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white/90 line-clamp-1">{presentation.title}</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Slide {activeIndex + 1} of {presentation.slides.length}</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all shadow-inner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-none">
        <div className="relative group/canvas">
          <div 
            ref={el => {
              if (currentSlide) {
                slideRefs.current[currentSlide.id] = el;
              }
            }}
            className="w-full shadow-2xl rounded-2xl overflow-hidden border border-white/10"
          >
            <SlidePreview slide={currentSlide} />
          </div>
          
          {/* Quick Info Toggle */}
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white opacity-0 group-hover/canvas:opacity-100 transition-all shadow-xl"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* Narrative & Navigation */}
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadPdf}
                className="bg-white/5 border-white/10 hover:bg-white/10 gap-2 h-9 rounded-xl"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadPptx}
                className="bg-white/5 border-white/10 hover:bg-white/10 gap-2 h-9 rounded-xl"
              >
                <Download className="w-3.5 h-3.5" />
                PPTX
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRegenerateImage}
                disabled={isRefreshing || !currentSlide.imageQuery}
                className="bg-white/5 hover:bg-white/10 gap-2 h-9 rounded-xl text-violet-400 border border-violet-500/20"
              >
                <Sparkles className={isRefreshing ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
                Regen Visual
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
                className="w-9 h-9 border-white/10 bg-white/5 hover:bg-white/10 rounded-xl"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                disabled={activeIndex === presentation.slides.length - 1}
                onClick={() => setActiveIndex(Math.min(presentation.slides.length - 1, activeIndex + 1))}
                className="w-9 h-9 border-white/10 bg-white/5 hover:bg-white/10 rounded-xl"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 shadow-inner">
            <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5" />
              Speaker Notes
            </h4>
            <p className="text-sm text-white/80 leading-relaxed font-medium italic">
              {currentSlide.notes || "No notes provided for this slide."}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 shadow-inner">
            <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
               <PresentationIcon className="w-3.5 h-3.5" />
               Strategy & Rationale
            </h4>
            <p className="text-sm text-white/60 leading-relaxed">
              {currentSlide.strategy || "No strategic rationale provided."}
            </p>
          </div>
        </div>
      </div>

      {/* Info Panel Overlay */}
      <AnimatePresence>
        {showInfo && (
          <SlideInfoPanel 
            slide={currentSlide} 
            onClose={() => setShowInfo(false)}
            onRefine={() => {}} // Handle refinement in chat?
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
