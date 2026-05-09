import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Slide, trackUnsplashDownload } from '@/lib/slides';
import { cn } from '@/lib/utils';
import { Image as ImageIcon, Wand2, PanelTop } from 'lucide-react';

interface SlidePreviewProps {
  slide: Slide;
  onEditSection?: (section: string) => void;
  className?: string;
}

const SlidePreview: React.FC<SlidePreviewProps> = ({ slide, onEditSection, className }) => {
  const trackedDownloads = useRef<Set<string>>(new Set());

  useEffect(() => {
    const downloadLocation = slide.unsplashData?.downloadLocation;
    if (downloadLocation && !trackedDownloads.current.has(downloadLocation)) {
      trackUnsplashDownload(downloadLocation);
      trackedDownloads.current.add(downloadLocation);
    }
  }, [slide.unsplashData?.downloadLocation]);

  const Attribution = () => {
    if (!slide.unsplashData) return null;
    return (
      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/20 backdrop-blur-md rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 shadow-2xl">
        <span className="text-[9px] text-white/70 font-medium uppercase tracking-wider">Photo by</span>
        <a 
          href={slide.unsplashData.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[9px] text-white font-bold hover:text-primary transition-colors"
        >
          {slide.unsplashData.name}
        </a>
        <span className="text-[9px] text-white/50 font-medium italic">on</span>
        <a 
          href="https://unsplash.com/?utm_source=SlidePix&utm_medium=referral" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[9px] text-white font-bold hover:text-primary transition-colors"
        >
          Unsplash
        </a>
      </div>
    );
  };

  const renderLayout = () => {
    switch (slide.layout) {
      case 'title':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-16 bg-gradient-to-br from-background via-accent/5 to-background">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="w-20 h-1 bg-primary rounded-full mb-10" 
            />
            <h1 
              className="text-6xl md:text-7xl font-black mb-8 cursor-pointer hover:bg-accent/20 transition-all p-4 rounded-3xl group relative tracking-tight leading-[1.1]"
              onClick={() => onEditSection?.(`title: ${slide.title}`)}
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                {slide.title}
              </span>
              <Wand2 className="w-5 h-5 absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity text-primary animate-pulse" />
            </h1>
            {slide.content.length > 0 && (
              <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl leading-relaxed font-medium">
                {slide.content[0]}
              </p>
            )}
          </div>
        );

      case 'split':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 h-full gap-8 p-12">
            <div className="flex flex-col justify-center">
              <h2 className="text-4xl font-bold mb-8">{slide.title}</h2>
              <ul className="space-y-4">
                {slide.content.map((point, i) => (
                  <li key={i} className="flex items-start gap-3 text-base md:text-lg text-muted-foreground">
                    <span className="w-1.5 h-1.5 mt-2 rounded-full bg-primary shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative rounded-2xl overflow-hidden bg-muted/30 border border-border group">
              {slide.imageUrl ? (
                <>
                  <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
                  <Attribution />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <ImageIcon className="w-12 h-12 stroke-[1.5]" />
                  <span className="text-sm font-medium">Auto-generating image...</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
            </div>
          </div>
        );

      case 'feature':
        return (
          <div className="flex flex-col h-full p-16">
            <h2 className="text-4xl font-black mb-16 text-center tracking-tight">{slide.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-1">
              {slide.content.slice(0, 3).map((point, i) => (
                <div key={i} className="bg-accent/10 border border-border/60 rounded-3xl p-10 flex flex-col items-center text-center justify-center hover:bg-accent/20 hover:scale-[1.02] transition-all duration-300">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 text-primary font-black text-xl shadow-inner">
                    {i + 1}
                  </div>
                  <p className="text-base md:text-lg font-bold leading-relaxed tracking-tight">{point}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'image':
        return (
          <div className="relative h-full w-full overflow-hidden">
             {slide.imageUrl ? (
                <>
                  <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
                  <Attribution />
                </>
              ) : (
                <div className="flex items-center justify-center h-full bg-muted">
                  <ImageIcon className="w-12 h-12 text-muted-foreground animate-pulse" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-16 flex flex-col justify-end">
                <h2 className="text-5xl md:text-6xl font-black text-white mb-8 drop-shadow-2xl tracking-tighter">{slide.title}</h2>
                <ul className="space-y-4">
                  {slide.content.map((point, i) => (
                    <li key={i} className="text-white/95 text-xl md:text-2xl font-bold flex items-center gap-6 drop-shadow-md">
                       <span className="w-8 h-[2px] bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.8)]" />
                       {point}
                    </li>
                  ))}
                </ul>
              </div>
          </div>
        );

      default: // 'standard'
        return (
          <div className="flex flex-col h-full p-12">
            <h2 className="text-4xl font-bold mb-12 flex items-center gap-4">
              <span className="w-2 h-10 bg-primary rounded-full" />
              {slide.title}
            </h2>
            <div className="flex-1 overflow-y-auto scrollbar-none pr-4">
              <ul className="space-y-6">
                {slide.content.map((point, i) => (
                  <motion.li 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={i} 
                    className="flex items-start gap-5 text-lg md:text-xl text-muted-foreground group cursor-pointer p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    onClick={() => onEditSection?.(`bullet point: ${point}`)}
                  >
                    <span className="mt-2 text-primary text-xs font-bold opacity-50 group-hover:opacity-100 transition-opacity">0{i + 1}</span>
                    <span className="leading-relaxed">{point}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
            {slide.imageUrl && (
               <div className="mt-8 h-48 rounded-xl overflow-hidden border border-border relative">
                  <img src={slide.imageUrl} alt="Context" className="w-full h-full object-cover opacity-80" />
                  <Attribution />
               </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className={cn(
      "aspect-[16/9] w-full max-w-5xl mx-auto bg-card border border-border shadow-[0_28px_80px_-36px_rgba(15,23,42,0.6)] rounded-[2rem] overflow-hidden ring-1 ring-black/5 relative",
      className
    )}>
      <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-r from-primary/10 via-transparent to-violet-500/10 border-b border-border/40 z-20 flex items-center justify-between px-5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <PanelTop className="w-3.5 h-3.5 text-primary" />
          Slide Canvas
        </div>
        <div className="text-[10px] font-mono text-muted-foreground/80">
          {slide.layout.toUpperCase()}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.02, y: -10 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="h-full w-full pt-14"
        >
          {renderLayout()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default SlidePreview;
