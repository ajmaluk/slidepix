/**
 * Zustand store for chat state management.
 * Extracts core chat state from Chat.tsx into a centralized, reactive store.
 */
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Conversation, ModelMode, ThinkingStep, StreamDebugInfo } from "@/lib/chat";
import type { AppSettings } from "@/lib/settings";
import { loadSettings, saveSettings, defaultProviders } from "@/lib/settings";

// ─── Types ───
export type ChatSession = {
  user: {
    id: string;
    email: string | null;
    user_metadata: Record<string, unknown>;
  };
  access_token: string;
} | null;

export type SubscriptionTier = "free" | "basic" | "pro" | "enterprise";

interface ChatState {
  // Auth
  session: ChatSession;
  authResolved: boolean;
  userTier: SubscriptionTier;

  // Conversations
  conversations: Conversation[];
  conversationsLoaded: boolean;
  activeId: string | null;
  chatNotFound: boolean;

  // UI State
  isLoading: boolean;
  isStreaming: boolean;
  sidebarOpen: boolean;
  mode: ModelMode;
  activeTab: string;
  showThoughts: boolean;
  showSettings: boolean;
  showRatingModal: boolean;

  // Thinking
  thinkingSteps: ThinkingStep[];
  thinkingTime: number;
  thoughtsForMessageId: string | null;

  // Search
  isSearching: boolean;
  searchQuery: string;

  // Streaming Content Optimization
  streamingMessage: { id: string; content: string; isGeneratingSlides?: boolean } | null;
  setStreamingMessage: (msg: { id: string; content: string; isGeneratingSlides?: boolean } | null) => void;
  // Final (saved) streaming message ready for client-side animation
  finalStreamingMessage: { id: string; content: string } | null;
  setFinalStreamingMessage: (msg: { id: string; content: string } | null) => void;

  // Settings
  settings: AppSettings;

  // Debug
  streamDebugInfo: StreamDebugInfo | null;
  initialQueryProcessed: boolean;

  // Slides integration
  slidePanelOpen: boolean;
  activePresentation: any | null; // Use any to avoid circular deps if needed, or import Presentation

  // Actions
  setSession: (session: ChatSession) => void;
  setAuthResolved: (resolved: boolean) => void;
  setUserTier: (tier: SubscriptionTier) => void;
  setConversations: (updater: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  setConversationsLoaded: (loaded: boolean) => void;
  setActiveId: (id: string | null) => void;
  setChatNotFound: (notFound: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setMode: (mode: ModelMode) => void;
  setActiveTab: (tab: string) => void;
  setShowThoughts: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowRatingModal: (show: boolean) => void;
  setThinkingSteps: (updater: ThinkingStep[] | ((prev: ThinkingStep[]) => ThinkingStep[])) => void;
  setThinkingTime: (updater: number | ((prev: number) => number)) => void;
  setThoughtsForMessageId: (id: string | null) => void;
  setIsSearching: (searching: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSettings: (updater: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  setStreamDebugInfo: (info: StreamDebugInfo | null) => void;
  setInitialQueryProcessed: (processed: boolean) => void;
  setSlidePanelOpen: (open: boolean) => void;
  setActivePresentation: (presentation: any | null) => void;

  // Derived
  isLoggedIn: () => boolean;
  activeConv: () => Conversation | undefined;
  isTempChat: () => boolean;
  resolvedActiveProviderSettings: () => any;
}

const TEMP_PREFIX = "temp_";

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => ({
    // Auth
    session: null,
    authResolved: false,
    userTier: "free" as SubscriptionTier,

    // Conversations
    conversations: [],
    conversationsLoaded: false,
    activeId: null,
    chatNotFound: false,

    // UI
    isLoading: false,
    isStreaming: false,
    sidebarOpen: typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
    mode: "auto" as ModelMode,
    activeTab: "chat",
    showThoughts: false,
    showSettings: false,
    showRatingModal: false,

    // Thinking
    thinkingSteps: [],
    thinkingTime: 0,
    thoughtsForMessageId: null,

    // Search
  isSearching: false,
  searchQuery: "",

  // Streaming Content Optimization
  streamingMessage: null,
  setStreamingMessage: (msg) => set({ streamingMessage: msg }),
  // Final (saved) streaming message ready for client-side animation
  finalStreamingMessage: null,
  setFinalStreamingMessage: (msg) => set({ finalStreamingMessage: msg }),

  // Settings
    settings: loadSettings(),

    // Debug
    streamDebugInfo: null,
    initialQueryProcessed: false,

    // Slides
    slidePanelOpen: false,
    activePresentation: null,

    // Actions
    setSession: (session) => set({ session }),
    setAuthResolved: (authResolved) => set({ authResolved }),
    setUserTier: (userTier) => set({ userTier }),
    setConversations: (updater) =>
      set((state) => ({
        conversations: typeof updater === "function" ? updater(state.conversations) : updater,
      })),
    setConversationsLoaded: (conversationsLoaded) => set({ conversationsLoaded }),
    setActiveId: (activeId) => set({ activeId }),
    setChatNotFound: (chatNotFound) => set({ chatNotFound }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setIsStreaming: (isStreaming) => set({ isStreaming }),
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    setMode: (mode) => set({ mode }),
    setActiveTab: (activeTab) => set({ activeTab }),
    setShowThoughts: (showThoughts) => set({ showThoughts }),
    setShowSettings: (showSettings) => set({ showSettings }),
    setShowRatingModal: (showRatingModal) => set({ showRatingModal }),
    setThinkingSteps: (updater) =>
      set((state) => ({
        thinkingSteps: typeof updater === "function" ? updater(state.thinkingSteps) : updater,
      })),
    setThinkingTime: (updater) =>
      set((state) => ({
        thinkingTime: typeof updater === "function" ? updater(state.thinkingTime) : updater,
      })),
    setThoughtsForMessageId: (thoughtsForMessageId) => set({ thoughtsForMessageId }),
    setIsSearching: (isSearching) => set({ isSearching }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setSettings: (updater) =>
      set((state) => {
        const next = typeof updater === "function" ? updater(state.settings) : updater;
        saveSettings(next);
        return { settings: next };
      }),
    setStreamDebugInfo: (streamDebugInfo) => set({ streamDebugInfo }),
    setInitialQueryProcessed: (initialQueryProcessed) => set({ initialQueryProcessed }),
    setSlidePanelOpen: (slidePanelOpen) => set({ slidePanelOpen }),
    setActivePresentation: (activePresentation) => set({ activePresentation }),

    // Derived
    isLoggedIn: () => Boolean(get().session?.user?.id),
    activeConv: () => get().conversations.find((c) => c.id === get().activeId),
    isTempChat: () => Boolean(get().activeId?.startsWith(TEMP_PREFIX)),
    resolvedActiveProviderSettings: () => {
      const { settings, userTier } = get();
      const base = settings.providers?.[settings.activeProvider] ?? settings.providers?.dalam ?? defaultProviders.dalam;
      if (settings.activeProvider === "dalam" && userTier === "free") {
        return { ...base, selectedModel: defaultProviders.dalam.models[0] || "dalam" };
      }
      return base;
    },
  }))
);

export { TEMP_PREFIX };
