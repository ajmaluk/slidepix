import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import "./hooks/useTheme"; // Initialize theme before render to prevent flash
import App from "./App.tsx";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { ClerkSessionBridge } from "@/components/auth/ClerkSessionBridge";
import { installStaleChunkGuard } from "@/lib/staleChunkGuard";
import "./index.css";

installStaleChunkGuard();
void import("@/lib/syntaxHighlighter");

const root = document.getElementById("root");
if (root) {
  const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  const appTree = (
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );

  createRoot(root).render(
    clerkPublishableKey ? (
      <ClerkProvider afterSignOutUrl="/">
        {appTree}
        <ClerkSessionBridge />
      </ClerkProvider>
    ) : (
      appTree
    )
  );
}
