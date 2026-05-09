import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  FileText, 
  Presentation as PresentationIcon,
  RefreshCw,
  Layers3
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';

interface SlideControlsProps {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onDownloadPdf: () => void;
  onDownloadPptx: () => void;
  onRegenerate: () => void;
  className?: string;
}

const SlideControls: React.FC<SlideControlsProps> = ({
  current,
  total,
  onPrev,
  onNext,
  onDownloadPdf,
  onDownloadPptx,
  onRegenerate,
  className
}) => {
  return (
    <div className={cn(
      "flex items-center justify-between gap-4 p-4 bg-card/70 backdrop-blur-2xl border border-border/70 rounded-[1.5rem] shadow-[0_20px_60px_-32px_rgba(15,23,42,0.55)]",
      className
    )}>
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={onPrev} 
          disabled={current === 0}
          className="rounded-xl"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-1.5 px-4 font-mono text-sm font-medium">
          <Layers3 className="w-4 h-4 text-muted-foreground/60" />
          <span className="text-primary">{current + 1}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{total}</span>
        </div>
        <Button 
          variant="outline" 
          size="icon" 
          onClick={onNext} 
          disabled={current === total - 1}
          className="rounded-xl"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onRegenerate}
            className="hidden md:flex gap-2 rounded-xl text-muted-foreground hover:text-primary transition-colors bg-background/30"
          >
          <RefreshCw className="w-4 h-4" />
          Regenerate Images
        </Button>
        
        <div className="w-px h-6 bg-border mx-2 hidden md:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="rounded-xl gap-2 shadow-lg shadow-primary/10">
              <Download className="w-4 h-4" />
              Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
            <DropdownMenuItem 
              onClick={onDownloadPdf}
              className="gap-3 rounded-xl p-3 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-red-500" />
              <div className="flex flex-col">
                <span className="font-medium">Export as PDF</span>
                <span className="text-[10px] text-muted-foreground">High fidelity, static</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={onDownloadPptx}
              className="gap-3 rounded-xl p-3 cursor-pointer"
            >
              <PresentationIcon className="w-4 h-4 text-orange-500" />
              <div className="flex flex-col">
                <span className="font-medium">Export as PPTX</span>
                <span className="text-[10px] text-muted-foreground">Fully editable slides</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default SlideControls;
