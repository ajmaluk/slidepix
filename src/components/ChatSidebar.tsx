import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Presentation, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/authClient";
import type { Conversation } from "@/lib/chat";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewTemp?: () => void;
  onDelete?: (id: string) => void;
  onCollapse: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isTempActive?: boolean;
  onOpenSettings?: () => void;
  session?: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } };
}

function getLastActivity(conv: Conversation): number {
  if (conv.messages.length === 0) return conv.createdAt.getTime();
  const lastMsg = conv.messages[conv.messages.length - 1];
  return lastMsg.timestamp instanceof Date ? lastMsg.timestamp.getTime() : new Date(lastMsg.timestamp).getTime();
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onCollapse,
  onOpenSettings,
  session,
}: ChatSidebarProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);

  const filteredConversations = useMemo(() => {
    const list = conversations
      .filter((c) => c.messages.length > 0 && !c.id.startsWith("temp_"))
      .sort((a, b) => getLastActivity(b) - getLastActivity(a));

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase();
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  const isLoggedIn = Boolean(session?.user?.id);

  const handleLogout = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    const { error } = await authClient.auth.signOut();

    setIsSigningOut(false);

    if (error) {
      toast.error("Unable to sign out", {
        description: error.message || "Please try again.",
      });
      return;
    }

    toast.success("Signed out");
    navigate("/auth");
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-border/30 bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-3 text-left"
        >
          <img src="/logo-transparent.png" alt="SlidePix" className="h-8 w-8 object-contain" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-foreground">SlidePix</span>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tighter text-primary">
                Studio
              </span>
            </div>
          </div>
        </button>
        <button
          onClick={onCollapse}
          className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-3 py-2.5 text-sm font-medium text-background shadow-md transition-all hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Presentation
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search presentations..."
            className="w-full rounded-xl border border-border/40 bg-accent/20 py-2 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-border/80 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Presentation className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium text-muted-foreground/60">
              {searchQuery ? "No matches found" : "No presentations yet"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/40">
              Start a new deck to see it here
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
              Presentations
            </p>
            <AnimatePresence initial={false}>
              {filteredConversations.map((conv) => (
                <motion.button
                  layout
                  key={conv.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  onClick={() => onSelect(conv.shortId || conv.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-all",
                    activeId === conv.id
                      ? "bg-accent text-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-accent/40 hover:text-foreground"
                  )}
                >
                  <Presentation className="h-4 w-4 flex-shrink-0 opacity-40" />
                  <span className="flex-1 truncate">{conv.title}</span>
                  {onDelete && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(conv.id);
                      }}
                      className="rounded-md p-1 text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete presentation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="border-t border-sidebar-border/70 p-3">
        {isLoggedIn ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onOpenSettings?.()}
              className="flex items-center justify-center gap-2 rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </button>
            <button
              onClick={handleLogout}
              disabled={isSigningOut}
              className="flex items-center justify-center gap-2 rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate("/auth")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            Login
          </button>
        )}
      </div>
    </aside>
  );
}

export default ChatSidebar;
