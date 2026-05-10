"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ThemeSync from "@/components/ThemeSync";
import CursorGlow from "@/components/shared/CursorGlow";
import FirestoreInit from "@/components/FirestoreInit";
import { ClerkSessionBridge } from "@/components/auth/ClerkSessionBridge";
import { installStaleChunkGuard } from "@/lib/staleChunkGuard";
import "@/hooks/useTheme";

installStaleChunkGuard();
void import("@/lib/syntaxHighlighter");

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeSync />
        <Toaster />
        <Sonner />
        <CursorGlow />
        <FirestoreInit />
        {children}
        <ClerkSessionBridge />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
