import React, { useCallback, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Presentation as PresentationIcon, 
  Sparkles, 
  MessageSquare,
  Menu,
  Image as ImageIcon,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Presentation, 
  fetchStockImage, 
  SLIDE_AGENT_SYSTEM_PROMPT, 
  buildStyleGuidance,
  parsePresentation,
  extractJson,
  exportPresentationToPdf,
  exportPresentationToPptx,
  SlideStyle, 
  AnalysisSummary, 
  SLIDE_ANALYSIS_PROMPT, 
  SLIDE_OUTLINE_PROMPT 
} from '@/lib/slides';
import { streamChat } from '@/lib/chat';
import { useChatStore } from '@/stores/chatStore';
import SlidePreview from '@/components/slides/SlidePreview';
import SlideControls from '@/components/slides/SlideControls';
import { SEOHead } from '@/components/SEOHead';
import { ChatSidebar } from '@/components/ChatSidebar';
import { ChatInput } from '@/components/ChatInput';
import { SlideThinkingIndicator } from '@/components/slides/SlideThinkingIndicator';
import { cn } from '@/lib/utils';
import SlideStyleSelector from '@/components/slides/SlideStyleSelector';
import SlideAnalysisView from '@/components/slides/SlideAnalysisView';
import SlideOutlineView from '@/components/slides/SlideOutlineView';
import { ThinkingStep } from '@/lib/chat';
import { SlideInfoPanel } from '@/components/slides/SlideInfoPanel';
import { AgentOrb } from '@/components/AgentOrb';

const PENDING_PROMPT_KEY = "slidepix_pending_prompt";

const Slides = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState('');
  const [currentPresentation, setCurrentPresentation] = useState<Presentation | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);
  const conversations = useChatStore((s) => s.conversations);
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);
  const setShowSettings = useChatStore((s) => s.setShowSettings);
  const activeTab = useChatStore((s) => s.activeTab);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const activeId = useChatStore((s) => s.activeId);
  const setActiveId = useChatStore((s) => s.setActiveId);
  const setConversations = useChatStore((s) => s.setConversations);
  const session = useChatStore((s) => s.session);
  
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
   
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [activeMobileView, setActiveMobileView] = useState<'editor' | 'preview'>('editor');
  
  const [workflowStep, setWorkflowStep] = useState<'idle' | 'style' | 'analyzing' | 'confirming' | 'generating' | 'done'>('idle');
  const [selectedStyle, setSelectedStyle] = useState<SlideStyle>('professional');
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [outline, setOutline] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [mobileOverlayOpen, setMobileOverlayOpen] = useState(false);

  const settings = useChatStore((s) => s.settings);
  const userTier = useChatStore((s) => s.userTier);
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const initialPromptRef = useRef<string | null>(null);

  React.useEffect(() => {
    setActiveTab('slides');
  }, [setActiveTab]);

  React.useEffect(() => {
    const promptFromHome = searchParams.get("q")?.trim() ?? "";
    if (!promptFromHome || initialPromptRef.current === promptFromHome) return;
    initialPromptRef.current = promptFromHome;
    setInput((current) => (current.trim() ? current : promptFromHome));
  }, [searchParams]);

  const startAnalysis = useCallback(async (userPrompt: string) => {
    setIsProcessing(true);
    setWorkflowStep('analyzing');
    const styleGuidance = buildStyleGuidance(selectedStyle);
    
    setThinkingSteps([
      { 
        agent: "Arun", 
        agentId: "arun", 
        specialization: "Intent Analyst", 
        action: "Analyzing Request", 
        detail: "Deep-scanning requirements and mapping strategic narrative...",
        color: "text-violet-400",
        timestamp: Date.now(),
        status: "running",
        type: "strategy"
      }
    ]);

    let fullAnalysis = '';
    await streamChat({
      messages: [
        { role: 'system', content: SLIDE_ANALYSIS_PROMPT },
        { role: 'system', content: styleGuidance },
        { role: 'user', content: userPrompt }
      ],
      mode: 'creative',
      provider: {
        activeProvider: settings.activeProvider,
        selectedModel: settings.providers[settings.activeProvider].selectedModel,
        apiKey: settings.providers[settings.activeProvider].apiKey
      },
      userTier,
      userId: session?.user?.id,
      onDelta: (delta) => { fullAnalysis += delta; },
      onError: (err) => {
        toast.error("Analysis failed: " + err);
        setIsProcessing(false);
      },
      onDone: async () => {
        try {
          const parsedAnalysis = extractJson<AnalysisSummary>(fullAnalysis);
          if (!parsedAnalysis) throw new Error("Invalid analysis format");
          
          setAnalysis(parsedAnalysis);
          
          setThinkingSteps(prev => {
            const next = [...prev];
            if (next[0]) next[0].status = "done";
            next.push({
              agent: "Kiran",
              agentId: "kiran",
              specialization: "Narrative Designer",
              action: "Architecting Outline",
              detail: "Defining slide-by-slide sequence and content hierarchy...",
              color: "text-emerald-400",
              timestamp: Date.now(),
              status: "running",
              type: "drafting"
            });
            return next;
          });

          let fullOutline = '';
          const outlineStyleGuidance = buildStyleGuidance(selectedStyle);
          await streamChat({
            messages: [
              { role: 'system', content: SLIDE_OUTLINE_PROMPT },
              { role: 'system', content: outlineStyleGuidance },
              { role: 'user', content: `Analyze: ${JSON.stringify(parsedAnalysis)}\nStyle: ${selectedStyle}\nTopic: ${userPrompt}` }
            ],
            mode: 'creative',
            provider: {
              activeProvider: settings.activeProvider,
              selectedModel: settings.providers[settings.activeProvider].selectedModel,
              apiKey: settings.providers[settings.activeProvider].apiKey
            },
            userTier,
            userId: session?.user?.id,
            onDelta: (delta) => { fullOutline += delta; },
            onError: (err) => {
              toast.error("Outline generation failed: " + err);
              setIsProcessing(false);
            },
            onDone: async () => {
              try {
                const parsedData = extractJson<{ titles: string[] }>(fullOutline);
                if (!parsedData || !parsedData.titles) throw new Error("Invalid outline format");
                
                setOutline(parsedData.titles);
                setWorkflowStep('confirming');
                setThinkingSteps(prev => {
                  const next = [...prev];
                  if (next[1]) next[1].status = "done";
                  return next;
                });
              // eslint-disable-next-line unused-imports/no-unused-vars
              } catch (e) {
                toast.error("Failed to parse outline");
              }
              setIsProcessing(false);
            }
          });
        // eslint-disable-next-line unused-imports/no-unused-vars
        } catch (e) {
          toast.error("Failed to analyze requirements");
          setIsProcessing(false);
        }
      }
    });
  }, [selectedStyle, settings.activeProvider, settings.providers, session?.user?.id, userTier]);

  const handleStartWorkflow = useCallback(async (promptOverride?: string) => {
    const userPrompt = (promptOverride ?? input).trim();

    if (!userPrompt || isProcessing) return;

    if (!session) {
      toast.error("Please login to generate presentations");
      sessionStorage.setItem(PENDING_PROMPT_KEY, userPrompt);
      navigate("/auth?redirect=/slides");
      return;
    }

    if (!input.trim()) setInput(userPrompt);
    setWorkflowStep('style');
    await startAnalysis(userPrompt);
  }, [input, isProcessing, navigate, session, startAnalysis]);

  React.useEffect(() => {
    if (!session || isProcessing) return;

    const queuedPrompt = sessionStorage.getItem(PENDING_PROMPT_KEY)?.trim();
    if (!queuedPrompt) return;

    sessionStorage.removeItem(PENDING_PROMPT_KEY);
    setInput(queuedPrompt);
    void handleStartWorkflow(queuedPrompt);
  }, [session, isProcessing, handleStartWorkflow]);

  const handleToggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setMobileOverlayOpen(!mobileOverlayOpen);
    } else {
      setRightSidebarOpen(!rightSidebarOpen);
    }
  };

  const handleFinalGenerate = async () => {
    setIsProcessing(true);
    setWorkflowStep('generating');
    setIsGenerating(true);

    const userPrompt = input.trim();
    const styleGuidance = buildStyleGuidance(selectedStyle);
    
    setThinkingSteps(prev => [
      ...prev,
      {
        agent: "Manu",
        agentId: "manu",
        specialization: "Visual Designer",
        action: "Sourcing Visuals",
        detail: `Style: ${selectedStyle}. Searching for professional imagery...`,
        color: "text-purple-400",
        timestamp: Date.now(),
        status: "running",
        type: "sourcing"
      }
    ]);

    const messages = [
      { role: 'system' as const, content: SLIDE_AGENT_SYSTEM_PROMPT },
      { role: 'system' as const, content: styleGuidance },
      { role: 'user' as const, content: `Topic: ${userPrompt}\nStyle: ${selectedStyle}\nOutline: ${outline.join(', ')}` }
    ];

    let fullContent = '';

    await streamChat({
      messages,
      mode: 'creative',
      provider: {
        activeProvider: settings.activeProvider,
        selectedModel: settings.providers[settings.activeProvider].selectedModel,
        apiKey: settings.providers[settings.activeProvider].apiKey
      },
      userTier,
      userId: session?.user?.id,
      onDelta: (delta) => { fullContent += delta; },
      onError: (err) => {
        toast.error("Generation failed: " + err);
        setIsGenerating(false);
        setIsProcessing(false);
      },
      onDone: async () => {
        const presentation = parsePresentation(fullContent, selectedStyle);
        if (presentation) {
          setCurrentPresentation(presentation);
          setWorkflowStep('done');
          setActiveSlideIndex(0);
          
          // Auto-open on completion
          if (window.innerWidth < 1024) {
             setMobileOverlayOpen(true);
          } else {
             setRightSidebarOpen(true);
          }
          
          handlePostGeneration(presentation, fullContent, userPrompt);
        }
        setIsGenerating(false);
        setIsProcessing(false);
      }
    });
  };

  const handlePostGeneration = async (presentation: Presentation, fullContent: string, sourcePrompt: string) => {
    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: sourcePrompt,
      timestamp: new Date()
    };
    
    const assistantMsg = {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: fullContent,
      timestamp: new Date(),
      presentation: presentation,
      isGeneratingSlides: false
    };

    let activeIdToUse = activeId;

    if (!activeIdToUse) {
      const newId = crypto.randomUUID();
      activeIdToUse = newId;
      setConversations(prev => [{ 
        id: newId, 
        title: presentation.title, 
        messages: [userMsg, assistantMsg], 
        createdAt: new Date() 
      }, ...prev]);
      setActiveId(newId);
    } else {
      setConversations(prev => prev.map(c => 
        c.id === activeIdToUse 
          ? { ...c, title: presentation.title, messages: [...c.messages, userMsg, assistantMsg] } 
          : c
      ));
    }

    for (let i = 0; i < presentation.slides.length; i++) {
        const slide = presentation.slides[i];
        if (slide.imageQuery) {
           const imageData = await fetchStockImage(slide.imageQuery);
           if (imageData) {
              setCurrentPresentation(prev => {
                 if (!prev) return null;
                 const nextSlides = [...prev.slides];
                 nextSlides[i] = { 
                   ...nextSlides[i], 
                   imageUrl: imageData.url, 
                   unsplashData: imageData.attribution 
                 };
                 const updatedPresentation = { ...prev, slides: nextSlides };
                 
                 setConversations(convs => convs.map(c => {
                   if (c.id !== activeIdToUse) return c;
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

                 return updatedPresentation;
              });
           }
        }
    }
    
    setThinkingSteps(prev => {
      const next = [...prev];
      next.push({
        agent: "Manu",
        agentId: "manu",
        specialization: "Visual Designer",
        action: "Finalizing Layouts",
        detail: "Applying professional design tokens...",
        color: "text-purple-400",
        timestamp: Date.now(),
        status: "done",
        type: "finalizing"
      });
      return next;
    });

    toast.success("Presentation ready!");
  };

  const handleEditSection = (sectionText: string) => {
    setInput(`On slide ${activeSlideIndex + 1}, change the ${sectionText} to be `);
  };

  const handleDownloadPdf = async () => {
    if (!currentPresentation) return;
    toast.info("Preparing PDF...");
    const elements = currentPresentation.slides.map(s => slideRefs.current[s.id]).filter(Boolean) as HTMLElement[];
    await exportPresentationToPdf(currentPresentation, elements);
  };

  const handleDownloadPptx = async () => {
    if (!currentPresentation) return;
    toast.info("Preparing PowerPoint...");
    await exportPresentationToPptx(currentPresentation);
  };

  const currentSlide = currentPresentation?.slides[activeSlideIndex];
  const workflowVariants = {
    idle: { opacity: 1, y: 0, scale: 1 },
    style: { opacity: 1, y: 0, scale: 0.995 },
    analyzing: { opacity: 1, y: 0, scale: 0.99 },
    confirming: { opacity: 1, y: 0, scale: 1 },
    generating: { opacity: 1, y: 0, scale: 0.99 },
    done: { opacity: 1, y: 0, scale: 1 },
  } as const;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden relative">
      <SEOHead 
        title="AI Slides Generator — SlidePix" 
        description="Generate professional, editable PDF and PowerPoint slides with AI-powered stock imagery."
      />
      
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-background/70 backdrop-blur-md z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.div
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.4, right: 0 }}
            onDragEnd={(_e, info) => {
              if (info.velocity.x < -200 || info.offset.x < -100) {
                setSidebarOpen(false);
              }
            }}
            className="fixed lg:relative z-40 h-full overflow-hidden"
          >
            <ChatSidebar 
              conversations={conversations}
              activeId={activeId}
              activeTab={activeTab}
              session={session}
              onTabChange={(tab) => {
                setActiveTab(tab);
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              onSelect={(id) => {
                setActiveId(id);
                navigate("/slides");
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              onNew={() => {
                setActiveId(null);
                navigate("/slides");
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              onNewTemp={() => {
                navigate("/slides");
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              onDelete={(id) => setConversations(prev => prev.filter(c => c.id !== id))}
              onCollapse={() => setSidebarOpen(false)}
              onOpenSettings={() => {
                setShowSettings(true);
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col relative overflow-hidden min-w-0">
        <header className="relative h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background/50 backdrop-blur-xl z-20 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_38%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_32%)] pointer-events-none" />
          <div className="flex items-center gap-3 md:gap-4">
             {!sidebarOpen && (
                <button 
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 -ml-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all"
                >
                   <Menu className="w-5 h-5" />
                </button>
             )}
            <div className="p-2 bg-primary/10 rounded-xl">
              <PresentationIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-sm">SlidePix Studio</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Presentation UI</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary px-3 py-1 font-mono text-[10px] tracking-[0.22em] uppercase">
              {isGenerating ? "Processing..." : "Ready"}
            </Badge>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex flex-col bg-background/30 relative transition-all duration-700 ease-in-out overflow-hidden z-10 w-full lg:w-auto flex-1">
            <motion.div
              key={workflowStep}
              initial={{ opacity: 0, y: 18, scale: 0.985 }}
              animate={workflowVariants[workflowStep]}
              exit={{ opacity: 0, y: -18, scale: 0.985 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scrollbar-none custom-scrollbar"
            >
              
              {(workflowStep === 'analyzing' || workflowStep === 'generating' || workflowStep === 'confirming') && (
                <div className="flex flex-col gap-2 mb-8 animate-in fade-in slide-in-from-top-4 duration-700 items-center text-center">
                  <Badge variant="outline" className="w-fit px-3 py-0.5 bg-primary/5 text-primary border-primary/20 font-mono text-[9px] uppercase tracking-widest">
                    Agent Intelligence Active
                  </Badge>
                  <h2 className="text-xl md:text-2xl font-bold tracking-tight">
                    {workflowStep === 'analyzing' ? "Architecting Narrative Strategy" : 
                     workflowStep === 'generating' ? "Finalizing Visual Design" : 
                     "Review Narrative Blueprint"}
                  </h2>
                  <p className="text-sm text-muted-foreground italic">
                    &quot;{currentPresentation?.title || input.trim().slice(0, 50) + (input.length > 50 ? '...' : '')}&quot;
                  </p>
                </div>
              )}

              {workflowStep === 'idle' && (
                <div className="relative min-h-[calc(100vh-10rem)] flex flex-col items-center justify-center px-4 py-12 gap-10">
                  <div className="absolute inset-x-0 top-14 mx-auto h-72 max-w-4xl rounded-full bg-gradient-to-r from-primary/10 via-transparent to-violet-500/10 blur-3xl pointer-events-none" />

                  <div className="relative max-w-3xl text-center space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary shadow-sm">
                      <Sparkles className="w-3 h-3" />
                      SlidePix Studio
                    </div>
                    <div className="space-y-3">
                      <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-[0.95]">
                        Start with one idea
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary via-sky-500 to-violet-500">
                          and turn it into a polished deck
                        </span>
                      </h2>
                      <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-6">
                        Enter a topic, choose a visual style below, and we’ll shape the narrative, structure, and slide design for you.
                      </p>
                    </div>
                  </div>

                  <div className="relative w-full max-w-2xl">
                    <ChatInput
                      onSend={(val) => {
                        handleStartWorkflow(val);
                      }}
                      isLoading={isProcessing}
                      variant="slides"
                      placeholder="Describe your presentation topic..."
                      value={input}
                      onChange={setInput}
                      clearOnSend={false}
                      centered={false}
                    />
                  </div>

                  <div className="relative w-full max-w-7xl space-y-5">
                    <div className="flex items-end justify-between gap-4 px-1">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Style library</div>
                        <h3 className="mt-1 text-sm font-semibold text-foreground/90">Choose a starting direction before you generate</h3>
                      </div>
                      <p className="hidden md:block text-xs text-muted-foreground max-w-md text-right">
                        The selected style becomes the visual baseline for the deck.
                      </p>
                    </div>
                    <SlideStyleSelector
                      selectedStyle={selectedStyle}
                      onSelect={(s) => setSelectedStyle(s)}
                    />
                  </div>
                </div>
              )}

              {(workflowStep === 'analyzing' || workflowStep === 'generating') && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -8 }}
                  transition={{ duration: 0.35 }}
                  className="w-full flex-1 flex flex-col items-center justify-center py-12 px-4 relative"
                >
                  <div className="absolute inset-x-0 top-24 mx-auto h-80 max-w-4xl rounded-full bg-gradient-to-r from-primary/10 via-transparent to-violet-500/10 blur-3xl pointer-events-none" />
                  <GeneratingStatusCard 
                    steps={thinkingSteps} 
                    onClick={handleToggleSidebar}
                    isOpen={rightSidebarOpen || mobileOverlayOpen}
                  />
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1">Architecture</span>
                    <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1">Narrative</span>
                    <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1">Visual sourcing</span>
                  </div>
                </motion.div>
              )}

              {workflowStep === 'confirming' && analysis && (
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.99 }}
                  transition={{ duration: 0.45 }}
                  className="space-y-10"
                >
                   <SlideAnalysisView analysis={analysis} />
                   <SlideOutlineView 
                     titles={outline} 
                     onUpdateTitles={setOutline}
                     onConfirm={handleFinalGenerate}
                   />
                </motion.div>
              )}

              {workflowStep === 'done' && currentPresentation && (
                <motion.div
                  initial={{ opacity: 0, y: 18, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -18, scale: 0.99 }}
                  transition={{ duration: 0.45 }}
                  className="space-y-8"
                >
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Presentation Deck</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-[10px] px-2 text-primary"
                        onClick={handleToggleSidebar}
                      >
                         {(rightSidebarOpen || mobileOverlayOpen) ? "Maximize Editor" : "Show Slides"}
                      </Button>
                   </div>
                   <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-[minmax(9rem,auto)]">
                      {currentPresentation.slides.map((s, i) => (
                        <button
                           key={s.id}
                           onClick={() => {
                             setActiveSlideIndex(i);
                             setSelectedSlideId(s.id);
                             if (window.innerWidth < 1024) setMobileOverlayOpen(true);
                             else setRightSidebarOpen(true);
                           }}
                           className={cn(
                             "group relative overflow-hidden rounded-[1.75rem] border bg-card transition-all shadow-sm",
                             i % 7 === 0 ? "md:col-span-2 md:row-span-2 min-h-[16rem]" : i % 5 === 0 ? "md:col-span-2 min-h-[9rem]" : "aspect-[4/3]",
                             activeSlideIndex === i && (rightSidebarOpen || mobileOverlayOpen) ? "border-primary ring-2 ring-primary/20 shadow-[0_16px_40px_-24px_rgba(59,130,246,0.6)]" : "border-border hover:border-primary/30 hover:shadow-[0_16px_40px_-30px_rgba(15,23,42,0.4)]"
                           )}
                        >
                           <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <ImageIcon className="w-4 h-4 text-white" />
                           </div>
                           <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2">
                              <div className="rounded-full bg-black/45 backdrop-blur-sm px-2 py-0.5 text-[9px] font-mono text-white/80">
                                {String(i + 1).padStart(2, '0')}
                              </div>
                              <div className="rounded-full bg-black/45 backdrop-blur-sm px-2 py-0.5 text-[9px] font-medium text-white/80 uppercase tracking-[0.18em]">
                                {s.layout}
                              </div>
                           </div>
                           {s.imageUrl ? (
                              <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                           ) : (
                              <div className="w-full h-full bg-gradient-to-br from-accent/40 to-secondary/50 flex flex-col items-center justify-center gap-3">
                                 <div className="w-12 h-12 rounded-[1.25rem] bg-background/80 border border-border/60 flex items-center justify-center shadow-sm">
                                   <Sparkles className="w-5 h-5 text-primary/70 animate-pulse" />
                                 </div>
                                 <div className="text-center">
                                   <div className="text-[9px] font-mono text-muted-foreground">SLIDE {i + 1}</div>
                                   <div className="mt-1 text-[10px] font-medium text-foreground/70 px-3 line-clamp-2">{s.title}</div>
                                 </div>
                              </div>
                           )}
                           <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pt-8 pb-3">
                              <div className="text-[10px] text-white font-semibold leading-tight line-clamp-2">{s.title}</div>
                           </div>
                        </button>
                      ))}
                   </div>

                   <div className="pt-8 border-t border-border/50">
                      <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                        <MessageSquare className="w-3 h-3" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Thought History</span>
                      </div>
                      <SlideThinkingIndicator steps={thinkingSteps} />
                   </div>
                </motion.div>
              )}
            </motion.div>

            {workflowStep !== 'idle' && (
                <div className="bg-background/80 backdrop-blur-md border-t border-border z-20">
                  <ChatInput
                  onSend={(val) => {
                    handleStartWorkflow(val);
                  }}
                  isLoading={isProcessing}
                  variant="slides"
                  placeholder="Ask to edit or refine slides..."
                  value={input}
                  onChange={setInput}
                  clearOnSend={false}
                  centered={false}
                />
              </div>
            )}
          </div>

          {/* Desktop Right Sidebar */}
          <AnimatePresence>
            {rightSidebarOpen && (
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="hidden lg:flex w-[520px] bg-muted/20 flex-col h-full relative overflow-hidden group/main z-30 border-l border-border shadow-2xl"
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none opacity-50 group-hover/main:opacity-100 transition-opacity duration-1000" />
                
                <button 
                  onClick={() => setRightSidebarOpen(false)}
                  className="absolute top-4 left-4 z-40 p-2 rounded-full bg-background/50 backdrop-blur-md border border-border text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover/main:opacity-100"
                >
                   <X className="w-4 h-4" />
                </button>

                <div className="flex-1 flex flex-col p-6 lg:p-8 relative z-10 overflow-y-auto scrollbar-none">
                  {(workflowStep === 'analyzing' || workflowStep === 'generating') ? (
                    <div className="flex-1 flex flex-col pt-10">
                      <div className="mb-8">
                        <h3 className="text-lg font-bold">Generation Progress</h3>
                        <p className="text-sm text-muted-foreground italic mt-1">Details from the agent orchestration loop.</p>
                      </div>
                      <SlideThinkingIndicator steps={thinkingSteps} isFullWidth={false} />
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center">
                      {currentSlide && (
                        <div className="w-full flex flex-col items-center gap-6">
                           <motion.div 
                             key={currentSlide.id}
                             initial={{ opacity: 0, scale: 0.98 }}
                             animate={{ opacity: 1, scale: 1 }}
                             transition={{ duration: 0.3 }}
                             className="w-full shadow-2xl rounded-[1.75rem] overflow-hidden border border-border/50 bg-background"
                           >
                             <SlidePreview 
                               slide={currentSlide} 
                               onEditSection={handleEditSection}
                             />
                           </motion.div>
                           <div className="w-full grid grid-cols-2 gap-3">
                             <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
                               <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Current slide</div>
                               <div className="mt-1 text-sm font-semibold truncate">{currentSlide.title}</div>
                             </div>
                             <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
                               <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Layout</div>
                               <div className="mt-1 text-sm font-semibold capitalize">{currentSlide.layout}</div>
                             </div>
                           </div>
                           
                           <SlideControls 
                             current={activeSlideIndex}
                             total={currentPresentation?.slides.length || 0}
                             onPrev={() => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1))}
                             onNext={() => setActiveSlideIndex(Math.min((currentPresentation?.slides.length || 1) - 1, activeSlideIndex + 1))}
                             onDownloadPdf={handleDownloadPdf}
                             onDownloadPptx={handleDownloadPptx}
                             onRegenerate={() => {/* Placeholder for re-fetching images */}}
                             className="w-full"
                           />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {selectedSlideId && workflowStep === 'done' && (
                     <SlideInfoPanel 
                       slide={currentPresentation?.slides.find(s => s.id === selectedSlideId) || null}
                       onClose={() => setSelectedSlideId(null)}
                       onRefine={(id, prompt) => {
                          const index = currentPresentation?.slides.findIndex(s => s.id === id) ?? -1;
                          if (index !== -1) {
                             setInput(`On slide ${index + 1}, ${prompt}`);
                          } else {
                             setInput(prompt);
                          }
                          setSelectedSlideId(null);
                       }}
                     />
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hidden container for PDF export */}
          {currentPresentation && (
            <div className="fixed top-[-9999px] left-[-9999px] w-[1280px] pointer-events-none z-[-1]">
              {currentPresentation.slides.map((s) => (
                <div 
                  key={`pdf-${s.id}`} 
                  ref={el => { if(el) slideRefs.current[s.id] = el; }}
                  className="w-[1280px] h-[720px] bg-background"
                >
                  <SlidePreview slide={s} />
                </div>
              ))}
            </div>
          )}

          {/* Mobile Bottom Overlay */}
          <AnimatePresence>
            {mobileOverlayOpen && (
              <>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[100] lg:hidden"
                  onClick={() => setMobileOverlayOpen(false)}
                />
                <motion.div 
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed bottom-0 inset-x-0 bg-background border-t border-border z-[101] rounded-t-[32px] overflow-hidden lg:hidden flex flex-col h-[85vh] shadow-[0_-20px_50px_rgba(0,0,0,0.3)]"
              >
                  <div className="w-12 h-1.5 bg-muted rounded-full mx-auto my-4 shrink-0" />
                  
                  <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
                    {(workflowStep === 'analyzing' || workflowStep === 'generating') ? (
                      <div className="flex-1 flex flex-col">
                        <div className="mb-6">
                          <h3 className="text-xl font-bold">Agent Insights</h3>
                          <p className="text-sm text-muted-foreground mt-1">Real-time collaboration details.</p>
                        </div>
                        <SlideThinkingIndicator steps={thinkingSteps} isFullWidth={false} />
                      </div>
                    ) : (
                    <div className="flex flex-col gap-6 pb-10">
                        {currentSlide && (
                          <>
                            <div className="w-full shadow-xl rounded-[1.75rem] overflow-hidden border border-border/50 bg-background">
                               <SlidePreview 
                                 slide={currentSlide} 
                                 onEditSection={handleEditSection}
                               />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Current slide</div>
                                <div className="mt-1 text-sm font-semibold truncate">{currentSlide.title}</div>
                              </div>
                              <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Layout</div>
                                <div className="mt-1 text-sm font-semibold capitalize">{currentSlide.layout}</div>
                              </div>
                            </div>
                            
                            <SlideControls 
                              current={activeSlideIndex}
                              total={currentPresentation?.slides.length || 0}
                              onPrev={() => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1))}
                              onNext={() => setActiveSlideIndex(Math.min((currentPresentation?.slides.length || 1) - 1, activeSlideIndex + 1))}
                              onDownloadPdf={handleDownloadPdf}
                              onDownloadPptx={handleDownloadPptx}
                              onRegenerate={() => {/* Placeholder */}}
                              className="w-full"
                            />
                            
                            <SlideInfoPanel 
                               slide={currentSlide}
                               onClose={() => setMobileOverlayOpen(false)}
                               onRefine={(_, prompt) => {
                                  setInput(`On slide ${activeSlideIndex + 1}, ${prompt}`);
                                  setMobileOverlayOpen(false);
                               }}
                             />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default Slides;

// --- Sub-components ---

const GeneratingStatusCard = ({ steps, onClick, isOpen }: { steps: ThinkingStep[], onClick: () => void, isOpen: boolean }) => {
  const activeAgentIds = [...new Set(steps.filter(s => s.status === 'running').map(s => s.agentId))];
  const lastStep = steps[steps.length - 1];
  
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative w-full max-w-sm p-6 bg-accent/20 border-2 rounded-[32px] transition-all duration-500 overflow-hidden",
        isOpen ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30"
      )}
    >
      <div className="absolute top-0 right-0 p-3">
         <Badge variant="outline" className="text-[10px] font-mono animate-pulse bg-primary/10 border-primary/20 text-primary">LIVE</Badge>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex -space-x-3">
          {(["arun", "kiran", "manu"] as const).map((id) => (
            <motion.div
              key={id}
              animate={activeAgentIds.includes(id) ? { scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <AgentOrb agentId={id} size="md" isLive={activeAgentIds.includes(id)} className="border-2 border-background shadow-md" />
            </motion.div>
          ))}
        </div>
        
        <div className="flex-1 text-left">
           <p className="text-sm font-bold truncate">{lastStep?.action || "Agent Core Active"}</p>
           <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <motion.div 
                  className="w-1.5 h-1.5 rounded-full bg-primary" 
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                Processing Narrative
              </span>
           </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
         <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <motion.div 
                key={i} 
                className="w-1 h-1 rounded-full bg-primary/30" 
                animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
         </div>
         <span className="text-[10px] font-bold text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
           {isOpen ? "Detailed View Active" : "Click to View Details"}
           <Sparkles className="w-3 h-3" />
         </span>
      </div>
    </motion.button>
  );
};
